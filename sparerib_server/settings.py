import os

DEBUG = True
TEMPLATE_DEBUG = DEBUG


TIME_ZONE = 'America/New_York'
LANGUAGE_CODE = 'en-us'

USE_TZ = True

STATIC_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
STATIC_URL = '/static/'

# Additional locations of static files
STATICFILES_DIRS = ()

STATICFILES_FINDERS = (
    'django.contrib.staticfiles.finders.FileSystemFinder',
    'django.contrib.staticfiles.finders.AppDirectoriesFinder',
)

TEMPLATE_LOADERS = (
    'django.template.loaders.filesystem.Loader',
    'django.template.loaders.app_directories.Loader',
)

MIDDLEWARE_CLASSES = (
    'django.middleware.common.CommonMiddleware',
    'locksmith.client_keys.middleware.ClientKeyMiddleware',
    'locksmith.lightauth.middleware.APIKeyMiddleware',
)

ROOT_URLCONF = 'sparerib_server.urls'

# Python dotted path to the WSGI application used by Django's runserver.
WSGI_APPLICATION = 'sparerib_server.wsgi.application'

TEMPLATE_DIRS = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')
)

TEMPLATE_CONTEXT_PROCESSORS = (
    "django.contrib.auth.context_processors.auth",
    "django.core.context_processors.debug",
    "django.core.context_processors.i18n",
    "django.core.context_processors.media",
    "django.core.context_processors.static",
    "django.core.context_processors.tz",
    "django.contrib.messages.context_processors.messages",
    'locksmith.client_keys.context_processors.client_key_context'
)

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'sparerib_api.auth.SpareribAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    )
}

INSTALLED_APPS = (
    'django.contrib.staticfiles',
    'rest_framework',
    'sparerib_api',
    'sparerib_public',
    'analysis',
    'locksmith.client_keys'
)

SENDFILE_BACKEND = 'sendfile.backends.simple'

# hacks to make everything work in pypy
try:
    import psycopg2
except ImportError:
    # we're running in pypy
    from psycopg2cffi import compat
    compat.register()

try:
    from local_settings import *
except:
    pass

