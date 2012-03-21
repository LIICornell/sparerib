from django.conf import settings
import pymongo

def get_db():
    return pymongo.Connection(
        **(getattr(settings, 'DB_SETTINGS', {}))
    )[getattr(settings, 'DB_NAME', 'regulations')]