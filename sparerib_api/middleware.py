from django.conf import settings
import urllib2
from cache import *

QS_PARAM = getattr(settings, 'LOCKSMITH_QS_PARAM', 'apikey')
HTTP_HEADER = getattr(settings, 'LOCKSMITH_HTTP_HEADER', 'HTTP_X_APIKEY')

@cache(seconds=86400)
def check_api_key(key):
    try:
        urllib2.urlopen("http://transparencydata.com/api/1.0/entities/id_lookup.json?bioguide_id=0&apikey=%s" % key).read()
        return True
    except urllib2.HTTPError as e:
        if e.code == 401:
            return None
        else:
            raise

class APIKeyMiddleware(object):
    def process_request(self, request):
        key = request.GET.get(QS_PARAM, None) or request.META.get(HTTP_HEADER, None)
        if key is not None:
            if check_api_key(key):
                request.apikey = key