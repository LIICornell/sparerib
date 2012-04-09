from django.conf.urls import patterns, include, url
from views import DocketView, DocumentView, EntityView, SearchView

from search import DocumentSearchResultsView

urlpatterns = patterns('',
    url(r'^docket/(?P<docket_id>[A-Z0-9_-]+$)', DocketView.as_view(), name='docket-view'),
    url(r'^document/(?P<document_id>[A-Z0-9_-]+$)', DocumentView.as_view(), name='document-view'),
    url(r'^(?P<type>organization|individual|politician|entity)/(?P<entity_id>[a-f0-9-]+$)', EntityView.as_view(), name='entity-view'),
    url(r'^search/documents/(?P<query>.*$)', DocumentSearchResultsView.as_view(), name='search-documents-view'),
    url(r'^search/(?P<query>.+$)', SearchView.as_view(), name='search-view'),
)
