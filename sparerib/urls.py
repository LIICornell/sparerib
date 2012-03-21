from django.conf.urls import patterns, include, url

urlpatterns = patterns('',
    url(r'^api/1.0/', include('sparerib.sparerib_api.urls')),
)

from django.contrib.staticfiles.urls import staticfiles_urlpatterns
urlpatterns += staticfiles_urlpatterns()