from django.conf import settings
import boto
from boto.s3.key import Key
import tempfile
import os, datetime, re
from regs_models import Doc, Agency
from django.core.cache import cache
import hashlib, json
import uuid
from django_rq import job
import dateutil

from sparerib_api.util import OrderedEnum
from sparerib_api.search import EASTERN, UTC

TEN_MINUTES = datetime.timedelta(minutes=10)
THIRTY_DAYS = 60 * 60 * 24 * 30
BULK_VERBOSE = True

class DeferredExporter(object):
    def __init__(self):
        self._check_data = None
        self.uuid = str(uuid.uuid4()).replace("-","")

    def get_check_data(self):
        if (self._check_data):
            if BULK_VERBOSE: print "Using cached check_data"
            return self._check_data
        if BULK_VERBOSE: print "Building check_data"
        ids = [doc.id for doc in self.qs.only("id")]
        count = len(ids)
        checksum = hashlib.md5(json.dumps(sorted(ids))).hexdigest()

        self._check_data = {'count': count, 'checksum': checksum}
        return self._check_data.copy()

    def confirm_check_data(self, to_confirm):
        check_data = self.get_check_data()
        for key, value in check_data.items():
            if key not in to_confirm or to_confirm[key] != value:
                return False
        return True

    def get_status(self):
        hit = cache.get(self.cache_key)
        print hit
        if hit is not None:
            if BULK_VERBOSE: print "Main cache hit"
            if (hit['status'] == 'done') or (hit['status'] in ['deferred', 'working', 'failed'] and datetime.datetime.now() - hit['timestamp'] < TEN_MINUTES):
                if self.confirm_check_data(hit):
                    if BULK_VERBOSE: print "Using cache"
                    return hit
        if BULK_VERBOSE: print "Deferring"
        return self.defer()

    def get_status_info(self):
        data = self.get_check_data()
        data['bulk_type'] = self.bulk_type
        data['uuid'] = self.uuid
        data['timestamp'] = datetime.datetime.now()
        for key, value in self.get_extra_metadata().items():
            data[key] = value
        return data

    def do_task(self):
        data = self.get_status_info()
        data['status'] = 'working'
        data['work_stage'] = 'started'
        if BULK_VERBOSE: print "Setting cache to working"
        cache.set(self.cache_key, data, timeout=THIRTY_DAYS)

        def set_stage(stage_info):
            if BULK_VERBOSE: print "Updating work stage to %s" % str(stage_info)
            data['work_stage'] = stage_info['status']
            data['percent_done'] = stage_info['percent_done']
            cache.set(self.cache_key, data, timeout=THIRTY_DAYS)

        try:
            data['url'] = self.upload_to_s3(cb=set_stage)
            if BULK_VERBOSE: print "Setting cache to done"
            data['status'] = 'done'
            data['work_stage'] = 'done'
        except:
            if BULK_VERBOSE: print "Setting cache to failed"
            data['status'] = 'failed'
            data['work_stage'] = 'failed'
        cache.set(self.cache_key, data, timeout=THIRTY_DAYS)

        return data

    def defer(self):
        data = self.get_status_info()
        data['status'] = 'deferred'
        cache.set(self.cache_key, data, timeout=THIRTY_DAYS)

        cache.set("sparerib_api.deferred.defer-" + self.uuid, self, timeout=THIRTY_DAYS)

        queue_deferred.delay(self.uuid)

        return data

    def upload_to_s3(self, cb=None):
        return upload_qs_to_s3(self.qs, name=self.s3name, cb=cb)

    def get_extra_metadata(self):
        return {}


class DocketExporter(DeferredExporter):
    bulk_type = 'docket'
    def __init__(self, docket_id):
        super(DocketExporter, self).__init__()
        self.docket_id = docket_id
        self.cache_key = "sparerib_api.bulk.get_bulk-docket-" + docket_id
        self.s3name = docket_id + ".zip"

    @property
    def qs(self):
        return Doc.objects(docket_id=self.docket_id)

    def get_extra_metadata(self):
        return {'docket_id': self.docket_id}

class AgencyDivisions(OrderedEnum):
    quarter = 1
    year = 2
    whole = 3

    @classmethod
    def get_for_count(cls, count):
        if count < 50000:
            return cls.whole
        elif count >= 50000 and count < 225000:
            return cls.year
        else:
            return cls.quarter

QUARTERS = {
    '1': ('01-01', '03-31'),
    '2': ('04-01', '06-30'),
    '3': ('07-01', '09-30'),
    '4': ('10-01', '12-31'),
}

class AgencyExporter(DeferredExporter):
    bulk_type = 'agency'
    def __init__(self, agency, window=None):
        super(AgencyExporter, self).__init__()
        self.agency = agency
        self.raw_window = window

        # make sure this is the right division
        db_agency = list(Agency.objects(id=agency))
        max_division = AgencyDivisions.get_for_count(db_agency[0].stats.get('count', 0) if db_agency else 0)

        self.division = None
        if window is None:
            self.division = AgencyDivisions.whole
            self.window = {}
        elif re.match(r"^[0-9]{4}$", window):
            self.division = AgencyDivisions.year
            self.window = {'year': window}
        else:
            match = re.match(r"^(?P<year>[0-9]{4})-Q(?P<quarter>[1-4])$", window)
            if match:
                self.division = AgencyDivisions.quarter
                self.window = match.groupdict()

        if not self.division or self.division > max_division:
            raise ValueError("Invalid or overly large window")

        name = agency + ("-%s" % window if window else "")

        self.cache_key = "sparerib_api.bulk.get_bulk-agency-" + name
        self.s3name = name + ".zip"

    @property
    def qs(self):
        query = {'agency': self.agency}
        range = None
        if self.division == AgencyDivisions.year:
            range = ('01-01', '12-31')
        elif self.division == AgencyDivisions.quarter:
            range = QUARTERS[self.window['quarter']]
        if range:
            range = [dateutil.parser.parse("%s-%s" % (self.window['year'], date)).replace(tzinfo=EASTERN).astimezone(UTC) for date in range]
            query['details__Date_Posted'] = {
                '$gte': range[0],
                '$lt': range[1] + datetime.timedelta(days=1)
            }

        return Doc.objects(**query)

    def get_extra_metadata(self):
        out = {'agency': self.agency}
        if self.raw_window:
            out['time_period'] = self.raw_window

        return out



def upload_qs_to_s3(qs, name="export.zip", cb=None):
    status = "compiling"
    def _cb(completed, total):
        cb({
            'status': status,
            'percent_done': 100 * (float(completed) / total)
        })

    tfile, tname = tempfile.mkstemp(suffix=".zip")
    qs.export_to_zip(tname, cb=(_cb if cb else None))

    # some likely-unique garbage to stick at the beginning of the filename
    prefix = hex(hash(str(datetime.datetime.now())+str(os.getpid())))[-4:]
    full_name = "/".join(["exports", prefix, name])

    conn = boto.connect_s3(settings.AWS_KEY, settings.AWS_SECRET)
    bucket = conn.create_bucket(settings.AWS_BUCKET)

    k = Key(bucket)
    k.key = full_name

    status = "uploading"
    k.set_contents_from_filename(
        tname,
        cb = _cb if cb else None,
        policy = 'public-read'
    )

    os.close(tfile)
    os.unlink(tname)

    return "http://" + settings.AWS_BUCKET_URL + "/" + full_name

def get_deferred_by_uuid(uuid):
    return cache.get("sparerib_api.deferred.defer-" + uuid)

def run_deferred(uuid):
    deferred = get_deferred_by_uuid(uuid)
    if not deferred:
        return None
    return deferred.do_task()

def get_status(uuid):
    deferred = get_deferred_by_uuid(uuid)
    if not deferred:
        return None
    return deferred.get_status()

@job
def queue_deferred(uuid):
    run_deferred(uuid)