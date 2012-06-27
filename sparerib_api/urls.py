from django.conf.urls import patterns, include, url
from views import AgencyView, DocketView, DocumentView, EntityView, RawTextView, NotFoundView

from search import DocumentSearchResultsView, DocketSearchResultsView, AgencySearchResultsView, DefaultSearchResultsView

from clustering import DocketHierarchyView, DocketClusterView, SingleClusterView, DocumentClusterView, DocumentClusterChainView

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

    # raw text
    url(r'^file/(?P<es_id>[0-9a-f]+)/(?P<object_id>[0-9a-z]+)_(?P<file_type>[0-9a-z]+)\.txt$', RawTextView.as_view(), name='raw-text-view'),

    # clusters
    url(r'^docket/(?P<docket_id>[A-Z0-9_-]+)/clusters$', DocketClusterView.as_view(), name='docket-clusters'),
    url(r'^docket/(?P<docket_id>[A-Z0-9_-]+)/hierarchy$', DocketHierarchyView.as_view(), name='docket-hierarchy'),
    url(r'^docket/(?P<docket_id>[A-Z0-9_-]+)/cluster/(?P<cluster_id>\d+)$', SingleClusterView.as_view(), name='single-cluster'),
    url(r'^docket/(?P<docket_id>[A-Z0-9_-]+)/cluster/(?P<cluster_id>\d+)/document/(?P<document_id>\d+)$', DocumentClusterView.as_view(), name='document-cluster'),
    url(r'^docket/(?P<docket_id>[A-Z0-9_-]+)/clusters_for_document/(?P<document_id>\d+)$', DocumentClusterChainView.as_view(), name='document-cluster'),

    # explicitly do our own fall-through to make sure we don't serve up the Backbone HTML on API calls
    url(r'', NotFoundView.as_view()),
)
