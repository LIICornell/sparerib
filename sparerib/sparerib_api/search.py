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

from util import get_db

ALLOWED_FILTERS = ['agency', 'docket']

class SearchResultsView(PaginatorMixin, DRFView):
    aggregation_level = None

    def get(self, request, query):
        self.set_query(query)
        return self.get_results()

    def set_query(self, query):
        parsed = parse_query(query)
        self.raw_query = query
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
            'raw_query': self.raw_query,
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

    # slight tweak to how this was done in the original - this will be the default
    limit = 10
    # and this will be the max
    max_limit = 50

    def get_limit(self):
        try:
            limit = int(self.request.GET.get('limit', self.limit))
            return min(limit, self.max_limit)
        except ValueError:
            return self.limit

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

        def stitch_record(match):
            match['url'] = reverse('document-view', kwargs={'document_id': match['fields']['document_id']})
            return match

        return map(stitch_record, self._results['hits']['hits'])

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

        db = get_db()

        ids = [match['term'] for match in s]
        agg_search = db[self.aggregation_collection].find({'_id': {'$in': ids}}, ['_id', 'name', 'year', 'title', 'details', 'agency', 'stats'])
        agg_map = dict([(result['_id'], result) for result in agg_search])

        def stitch_record(match):
            out = {
                '_type': self.aggregation_level,
                '_index': 'regulations',
                'fields': {},
                '_score': match['total'],
                '_id': match['term'],
                'matched': match['count'],
                'url': reverse(self.aggregation_level + '-view', kwargs={self.aggregation_field: match['term']})
            }
            if match['term'] in agg_map:
                agg_data = agg_map[match['term']]
                out['fields'] = {
                    self.aggregation_field: agg_map[match['term']]['_id'],
                    'date_range': agg_data['stats']['date_range'],
                    'count': agg_data['stats']['count']
                }
                for label in ['name', 'title', 'agency', 'year']:
                    if label in agg_data:
                        out['fields'][label] = agg_data[label]
                
                rulemaking_field = agg_data.get('details', {}).get('dk_type', None)
                if rulemaking_field:
                    out['fields']['rulemaking'] = rulemaking_field.lower() == 'rulemaking'
            return out

        return map(stitch_record, s)

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
            },
            'size': 0
        }

        filters = self.get_es_filters()
        if filters:
            query['facets'][self.aggregation_level]['facet_filter'] = filters

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

class DefaultSearchResultsView(DRFView):
    def get(self, request, query):
        parsed = parse_query(query)
        if any([f for f in parsed['filters'] if f[0] == 'docket']):
            # they've filtered to a single docket, so default to document aggregation
            new_url = reverse('search-documents-view', kwargs={'query': query})
        else:
            # default to docket aggregation
            new_url = reverse('search-dockets-view', kwargs={'query': query})
        if request.META['QUERY_STRING']:
            new_url += "?" + request.META['QUERY_STRING']

        raise ErrorResponse(status.HTTP_302_FOUND, headers={'Location': new_url})