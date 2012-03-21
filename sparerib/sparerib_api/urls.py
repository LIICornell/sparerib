from django.conf.urls import patterns, include, url
from views import DocketView, DocumentView

urlpatterns = patterns('',
    url(r'^docket/(?P<docket_id>[A-Z0-9-]+$)', DocketView.as_view(), name='docket-view'),
    url(r'^document/(?P<document_id>[A-Z0-9-]+$)', DocumentView.as_view(), name='document-view')
)
