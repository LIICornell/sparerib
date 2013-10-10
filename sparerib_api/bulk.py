from django.conf import settings
import boto
from boto.s3.key import Key
import tempfile
import os, datetime
from regs_models import Doc
from django.core.cache import cache
import hashlib, json
import uuid
from django_rq import job

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
        if BULK_VERBOSE: print "Setting cache to working"
        cache.set(self.cache_key, data, timeout=THIRTY_DAYS)

        try:
            data['url'] = self.upload_to_s3()
            if BULK_VERBOSE: print "Setting cache to done"
            data['status'] = 'done'
        except:
            if BULK_VERBOSE: print "Setting cache to failed"
            data['status'] = 'failed'
        cache.set(self.cache_key, data, timeout=THIRTY_DAYS)

        return data

    def defer(self):
        data = self.get_status_info()
        data['status'] = 'deferred'
        cache.set(self.cache_key, data, timeout=THIRTY_DAYS)

        cache.set("sparerib_api.deferred.defer-" + self.uuid, self, timeout=THIRTY_DAYS)

        queue_deferred.delay(self.uuid)

        return data

    def upload_to_s3(self):
        return upload_qs_to_s3(self.qs, name=self.s3name)

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


def upload_qs_to_s3(qs, name="export.zip"):
    tfile, tname = tempfile.mkstemp(suffix=".zip")
    qs.export_to_zip(tname)

    # some likely-unique garbage to stick at the beginning of the filename
    prefix = hex(hash(str(datetime.datetime.now())+str(os.getpid())))[-4:]
    full_name = "/".join(["exports", prefix, name])

    conn = boto.connect_s3(settings.AWS_KEY, settings.AWS_SECRET)
    bucket = conn.create_bucket(settings.AWS_BUCKET)

    k = Key(bucket)
    k.key = full_name
    k.set_contents_from_filename(tname)
    k.set_acl('public-read')

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