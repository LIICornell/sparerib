from django.conf.urls import patterns, include, url
from views import AgencyView, DocketView, DocumentView, EntityView

from search import DocumentSearchResultsView, DocketSearchResultsView, AgencySearchResultsView, DefaultSearchResultsView

urlpatterns = patterns('',
    # resource pages
    url(r'^agency/(?P<agency>[A-Z-]+$)', AgencyView.as_view(), name='agency-view'),
    url(r'^docket/(?P<docket_id>[A-Z0-9_-]+$)', DocketView.as_view(), name='docket-view'),
    url(r'^document/(?P<document_id>[A-Z0-9_-]+$)', DocumentView.as_view(), name='document-view'),
    url(r'^(?P<type>organization|individual|politician|entity)/(?P<entity_id>[a-f0-9-]+$)', EntityView.as_view(), name='entity-view'),
    
    # search
    url(r'^search/document/(?P<query>.*$)', DocumentSearchResultsView.as_view(), name='search-documents-view'),
    url(r'^search/docket/(?P<query>.*$)', DocketSearchResultsView.as_view(), name='search-dockets-view'),
    url(r'^search/agency/(?P<query>.*$)', AgencySearchResultsView.as_view(), name='search-agency-view'),
    url(r'^search/(?P<query>.*$)', DefaultSearchResultsView.as_view(), name='search-default-view'),
)
