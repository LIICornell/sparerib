from djangorestframework.mixins import PaginatorMixin
from djangorestframework.views import View as DRFView
from djangorestframework.renderers import DEFAULT_RENDERERS
from djangorestframework.response import Response, ErrorResponse
from djangorestframework import status

from django.views.generic import View
from django.core.urlresolvers import reverse
from django.conf import settings

import pyes
from query_parse import parse_query

from collections import defaultdict

ALLOWED_FILTERS = ['agency', 'docket']

class SearchResultsView(PaginatorMixin, DRFView):
    aggregation_level = None

    def get(self, request, query):
        self.set_query(query)
        return self.get_results()

    def set_query(self, query):
        parsed = parse_query(query)
        self.text_query = parsed['text']
        self.filters = parsed['filters']

    def serialize_page_info(self, page):
        # force recomputation of page numbers because of lazy loading
        page.paginator._num_pages = None
        page.paginator._count = int(page.paginator._count)

        # proceed as per usual
        out = super(SearchResultsView, self).serialize_page_info(page)
        out['search'] = {
            'text_query': self.text_query,
            'filters': [{
                'category': f[0],
                'id': f[1],
                'name': f[2] if len(f) > 2 else f[1]
            } for f in self.filters if f[0] in ALLOWED_FILTERS],
            'aggregation_level': self.aggregation_level
        }

        return out

    def get_es_filters(self):
        terms = defaultdict(list)
        for f in self.filters:
            if f[0] == 'agency':
                terms['agency'] += [f[1]]
            elif f[0] == 'docket':
                terms['docket_id'] += [f[1]]
        return {'terms': terms} if len(terms.values()) else None

    def get_es_text_query(self):
        return {'text': {'files.text': self.text_query}} if self.text_query else {'match_all': {}}

class DeferredInt(int):
    def __init__(self):
        super(DeferredInt, self).__init__()
        self._real = False

    def __int__(self):
        return self._real if self._real else 0

    def __str__(self):
        if self._real is False:
            return str(0)
        else:
            return str(self._real)

    def __cmp__(self, val):
        if self._real is False:
            return 1
        else:
            return self._real.__cmp__(val)

    def resolve(self, val):
        self._real = val

class DocumentSearchResults(object):
    def __init__(self, query):
        self.query = query
        self._results = None
        # paginator wants the count before we know what slice we want, so add some indirection hackery to avoid having to do two queries
        self._count = DeferredInt()

    def __getslice__(self, start, end):
        if not self._results:
            self.query['from'] = start
            self.query['size'] = end - start
            
            es = pyes.ES(settings.ES_SETTINGS)
            self._results = es.search_raw(self.query)
            self._count.resolve(self._results['hits']['total'])
        return self._results['hits']['hits']

    def count(self):
        return self._count

class DocumentSearchResultsView(SearchResultsView):
    aggregation_level = 'document'

    def get_results(self):
        query = {}
        
        filters = self.get_es_filters()
        text_query = self.get_es_text_query()

        if filters:
            query['filter'] = filters

        if text_query:
            query['query'] = text_query
            if 'text' in text_query:
                query['highlight'] = {'fields': dict([(key, {}) for key in text_query['text'].keys()])}

        query['fields'] = ['document_id', 'document_type', 'docket_id', 'title', 'submitter_name', 'submitter_organization', 'agency', 'posted_date']
        
        return DocumentSearchResults(query)

class AggregatedSearchResults(list):
    def __init__(self, items, aggregation_level, aggregation_field, aggregation_collection):
        super(AggregatedSearchResults, self).__init__(items)
        self.aggregation_level = aggregation_level
        self.aggregation_field = aggregation_field
        self.aggregation_collection = aggregation_collection

    def __getslice__(self, start, end):
        s = super(AggregatedSearchResults, self).__getslice__(start, end)
        return [{
            '_type': self.aggregation_level,
            '_index': 'regulations',
            'fields': match,
            '_score': match['total'],
            '_id': match['term']
        } for match in s]

class AggregatedSearchResultsView(SearchResultsView):
    def get_results(self):
        query = {
            'query': self.get_es_text_query(),
            'facets': {
                self.aggregation_level: {
                    'terms_stats': {
                        'key_field': self.aggregation_field,
                        'value_script': 'doc.score',
                        'size': 1000000,
                        'order': 'total'
                    }
                }
            }
        }

        filters = self.get_es_filters()
        if filters:
            query['facets'][self.aggregation_level]['facet_filter'] = filters

        print query
        es = pyes.ES(settings.ES_SETTINGS)
        results = es.search_raw(query)

        return AggregatedSearchResults(results['facets'][self.aggregation_level]['terms'], self.aggregation_level, self.aggregation_field, self.aggregation_collection)

class DocketSearchResultsView(AggregatedSearchResultsView):
    aggregation_level = 'docket'
    aggregation_field = 'docket_id'
    aggregation_collection = 'dockets'

class AgencySearchResultsView(AggregatedSearchResultsView):
    aggregation_level = 'agency'
    aggregation_field = 'agency'
    aggregation_collection = 'agencies'