from django.conf import settings
import boto
from boto.s3.key import Key
import tempfile
import os, datetime
from regs_models import Doc
from django.core import cache
import hashlib, json

TEN_MINUTES = datetime.timedelta(minutes=10)

class DeferredExporter(object):
    def get_check_data(self):
        ids = [doc.id for doc in self.qs.only("id")]
        count = len(ids)
        checksum = hashlib.md5(json.dumps(sorted(d))).hexdigest()

        return {'count': count, 'checksum': checksum}

    def confirm_check_data(self, to_confirm):
        check_data = self.get_check_data()
        for key, value in check_data:
            if key not in to_confirm or to_confirm[key] != value:
                return False
        return True

    def get_bulk(self):
        hit = cache.get(self.cache_key)
        if hit is not None:
            if (hit['status'] == 'done') or (hit['status'] == 'working' and datetime.datetime.now() - hit['created'] < TEN_MINUTES):
                if self.confirm_check_data(hit):
                    return hit
        return self.defer_bulk()

    def _get_bulk(self):
        data = self.get_check_data()
        data['url'] = self.upload_to_s3()
        data['status'] = done
        data['bulk_type'] = self.bulk_type
        for key, value in self.get_extra_metadata():
            data[key] = value

        return data

    def upload_to_s3(self):
        return upload_qs_to_s3(self.qs, name=self.s3name)


class DocketExporter(DeferredExporter):
    bulk_type = 'docket'
    def __init__(self, docket_id):
        super(DocketExporter, self).__init__()
        self.docket_id = docket_id
        self.qs = Doc.objects(docket_id=docket_id)
        self.cache_key = "sparerib_api.bulk.get_bulk-docket-" + docket_id
        self.s3name = docket_id + ".zip"

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