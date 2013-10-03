from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from django.views.generic import View
from django.core.urlresolvers import reverse
from django.conf import settings

from util import *

import math, json, operator, copy

import pyes
from query_parse import parse_query, parse_query_for_mongo

from collections import defaultdict

from regs_models import *

### Base search classes ###

class SearchResultsView(APIView):
    aggregation_level = None
    allowed_filters = ['agency', 'docket', 'submitter', 'mentioned', 'type']

    def get(self, request, query):
        self.set_query(query)

        page_num = int(self.request.GET.get('page', '1'))

        limit = self.get_limit()

        start = (page_num - 1) * self.get_limit()
        end = start + self.get_limit()

        all_results = self.get_results()
        results = list(all_results[start:end])
        serialized_page_info = self.serialize_page_info(page_num, len(all_results))

        serialized_page_info['results'] = results
        return Response(serialized_page_info)

    def set_query(self, query):
        parsed = parse_query(query)
        self.raw_query = query
        self.text_query = parsed['text']
        self.filters = parsed['filters']

    def url_with_page_number(self, page_number):
        """ Constructs a url used for getting the next/previous urls """
        url = "%s?page=%d" % (self.request.path, page_number)

        limit = self.get_limit()
        if limit != self.limit:
            url = "%s&limit=%d" % (url, limit)

        return url

    def serialize_page_info(self, page, count):
        limit = self.get_limit()
        page_count = int(math.ceil(float(count) / limit))
        out = {
            'next': self.url_with_page_number(page + 1) if page < page_count else None,
            'page': page,
            'pages': page_count,
            'per_page': limit,
            'previous': self.url_with_page_number(page - 1) if page > 1 else None,
            'total': count,
            'search': {
                'text_query': self.text_query,
                'filters': [{
                    'type': f[0],
                    'value': f[1],
                    'label': f[2] if len(f) > 2 else f[1]
                } for f in self.filters if f[0] in self.allowed_filters],
                'raw_query': self.raw_query,
                'aggregation_level': self.aggregation_level,
                'search_type': getattr(self, 'search_type', self.aggregation_level)
            }
        }

        return out

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

class ESSearchResultsView(SearchResultsView):
    def get_es_filters(self, extra_terms={}):
        terms = defaultdict(list)
        terms.update(extra_terms)

        for f in self.filters:
            if f[0] == 'agency':
                terms['agency'] += [f[1]]
            elif f[0] == 'docket':
                terms['docket_id'] += [f[1]]
            elif f[0] == 'submitter':
                terms['submitter_entities'] += [f[1]]
            elif f[0] == 'mentioned':
                terms['files.entities'] += [f[1]]
            elif f[0] == 'type':
                # we might need to be more restrictive than extra_terms, and we need to validate that this filter makes sense
                if 'document_type' in extra_terms:
                    if extra_terms['document_type'] == terms['document_type']:
                        terms['document_type'] = []
                    if f[1] not in extra_terms['document_type']:
                        continue
                terms['document_type'] += [f[1]]
        count = len(terms.values())
        if count == 0:
            return None
        elif count == 1:
            return {'terms': terms}
        else:
            term_list = []
            for key, value in terms.iteritems():
                term_list.append({'terms': {key: value}})
            return {'and': term_list}

    def get_es_text_query(self):
        return {
            'query_string': {
                'fields': ['files.text', 'title^2', 'identifiers^4'],
                'query': self.text_query,
                'use_dis_max': True
            }
        } if self.text_query else {'match_all': {}}

class ESSearchResults(object):
    indices = "regulations"
    doc_types = None
    _es = None

    def __init__(self, query):
        self.query = query
        self._results = None
        # paginator wants the count before we know what slice we want, so add some indirection hackery to avoid having to do two queries
        self._count = -1

    @property
    def es(self):
        if not self._es:
            self._es = es = pyes.ES(settings.ES_SETTINGS)
        return self._es

    def __getslice__(self, start, end):
        if not self._results:
            self.query['from'] = start
            self.query['size'] = end - start
            
            self._results = self.es.search_raw(self.query, indices=self.indices, doc_types=self.doc_types)
            self._count = self._results['hits']['total']

        return self._results['hits']['hits']

    def __len__(self):
        return self._count

class MongoSearchResultsView(SearchResultsView):
    def set_query(self, query):
        parsed = parse_query_for_mongo(query)
        self.raw_query = query
        self.text_query = parsed['text']
        self.mongo_query = parsed['quoted_text']
        self.filters = parsed['filters']

class MongoSearchResults(object):
    model = None

    def __init__(self, query, extra_ids=[], alternative_sort=("_id", 1), is_filtered=False):
        self.query = query
        self.extra_ids = extra_ids
        self._results = None
        self._count = -1
        self.alternative_sort = alternative_sort if alternative_sort else ("_id", 1)
        self.is_filtered = is_filtered

    def __getslice__(self, start, end):
        model = self.model

        do_full_search = True
        initial = []
        actual = []
        
        if start < len(self.extra_ids):
            # some of the results will be faked
            initial_ids = self.extra_ids[start:end]

            # grab them from the database
            initial = list(model._get_collection().find({'_id': {'$in': initial_ids}}, self.query['project']))

            if len(initial) >= (end - start):
                # we can satisfy the whole query with fake things
                do_full_search = False
        
        # check and see if there's actually any querying going on (either search terms or filters)
        if not (self.query['search'] or self.is_filtered):
            do_full_search = False

        self._count = len(self.extra_ids)

        if do_full_search:
            print 'doing full query'
            # calcualte the actual offsets in light of how much fake stuff we're shoving in at the beginning
            actual_start = start - len(self.extra_ids) + len(initial)
            actual_end = end - len(self.extra_ids)

            # this might be a text search or a regular query, depending on whether things besides filters are supplied
            if self.query['search']:
                self._results = model._get_db().command("text", model._get_collection_name(), **self.query)
                actual = self._results['results'][actual_start:actual_end]

                actual_fmt = [{
                    '_id': match['obj']['_id'],
                    '_type': model._class_name.lower(),
                    '_index': 'regulations',
                    '_score': match['score'],
                    '_from_filter': False,
                    'url': self.get_result_url(match['obj']),
                    'fields': self.get_result_fields(match['obj'])
                } for match in actual]

                self._count = len(self.extra_ids) + (len(self._results['results']) if self._results else 0)
            else:
                # build query
                print self.query['filter']
                cursor = model._get_collection().find(__raw__=self.query['filter']).sort(*self.alternative_sort)
                
                # get full count
                self._count = len(self.extra_ids) + cursor.count()

                # fetch subset of results
                self._results = cursor.skip(actual_start).limit(actual_end - actual_start)
                actual = list(self._results)

                actual_fmt = [{
                    '_id': match['_id'],
                    '_type': model._class_name.lower(),
                    '_index': 'regulations',
                    '_score': 99, # arbitrary but high, since they come first
                    '_from_filter': False,
                    'url': self.get_result_url(match),
                    'fields': self.get_result_fields(match)
                } for match in actual]
        else:
            print 'not doing full query'
            actual_fmt = []
        
        initial_fmt = [{
            '_id': match['_id'],
            '_type': model._class_name.lower(),
            '_index': 'regulations',
            '_score': 100, # arbitrary but high, since they come first
            '_from_filter': True,
            'url': self.get_result_url(match),
            'fields': self.get_result_fields(match)
        } for match in initial]

        return initial_fmt + actual_fmt

    def __len__(self):
        return self._count

    def get_result_fields(self, match_object):
        return {}

    def get_result_url(self, match_object):
        return ""

### Implementations ###

class DocumentSearchResults(ESSearchResults):
    doc_types = ["document"]

    def __getslice__(self, start, end):
        s = super(DocumentSearchResults, self).__getslice__(start, end)

        def stitch_record(match):
            match['url'] = reverse('document-view', kwargs={'document_id': match['_id']})

            if match.get('highlight', None):
                # munge the highlights so the frontend doesn't have to care what field they came from
                ordered = sorted(match['highlight'].items(), key=lambda x: ['identifiers', 'title', 'files.text'].index(x[0]))
                collated = [[(row[0], snippet) for snippet in row[1]] for row in ordered]
                collapsed = reduce(operator.add, collated)
                formatted = ["<strong>ID:</strong> %s" % item[1] if item[0] == 'identifiers' else item[1] for item in collapsed]
                match['highlight'] = formatted
            
            return match

        return map(stitch_record, s)

class DocumentSearchResultsView(ESSearchResultsView):
    aggregation_level = 'document'

    def get_results(self):
        query = {}
        
        filters = self.get_es_filters()
        text_query = self.get_es_text_query()

        if filters:
            query['filter'] = filters

        if text_query:
            query['query'] = text_query
            if 'query_string' in text_query:
                query['highlight'] = {'fields': dict([(field.split('^')[0], {}) for field in text_query['query_string']['fields']])}

        query['fields'] = ['document_type', 'docket_id', 'title', 'submitter_name', 'submitter_organization', 'agency', 'posted_date']
        
        return DocumentSearchResults(query)

class FRSearchResultsView(DocumentSearchResultsView):
    search_type = 'document-fr'
    def get_es_filters(self, extra_terms={}):
        terms = extra_terms.copy()
        terms['document_type'] = ['rule', 'proposed_rule', 'notice']

        return super(FRSearchResultsView, self).get_es_filters(terms)

class NonFRSearchResultsView(DocumentSearchResultsView):
    search_type = 'document-non-fr'
    def get_es_filters(self, extra_terms={}):
        terms = extra_terms.copy()
        terms['document_type'] = ['supporting_material', 'public_submission', 'other']

        return super(NonFRSearchResultsView, self).get_es_filters(terms)

class DocketSearchResultsView(ESSearchResultsView):
    aggregation_level = 'docket'

    def get_results(self):
        query = {}
        
        filters = self.get_es_filters()
        text_query = self.get_es_text_query()

        subqueries = [{
            'has_child': {
                'type': 'document',
                'query': text_query.copy(),
                'score_type': 'sum'
            }
        }]

        if filters:
            query['filter'] = {
                'has_child': {
                    'type': 'document',
                    'filter': filters
                }
            }

        if text_query and 'query_string' in text_query:
            title_query = copy.deepcopy(text_query)
            title_query['query_string']['boost'] = 10
            title_query['query_string']['fields'] = ['title']
            subqueries.append(title_query)

        query['query'] = {
            'dis_max': {
                'queries': subqueries
            }
        }

        query['fields'] = ['_id', 'title', 'agency']

        return DocketSearchResults(query)

class DocketSearchResults(ESSearchResults):
    doc_types = ["docket"]

    def __getslice__(self, start, end):
        s = super(DocketSearchResults, self).__getslice__(start, end)

        # get some extra info from Mongo
        db = Doc._get_db()

        ids = [match['_id'] for match in s]
        agg_search = db.dockets.find({'_id': {'$in': ids}}, ['_id', 'name', 'year', 'title', 'details', 'agency', 'stats'])
        agg_map = dict([(result['_id'], result) for result in agg_search])

        # get some extra info from ES
        if ids:
            count_query = {
                'query': [query for query in self.query['query']['dis_max']['queries'] if 'has_child' in query][0]['has_child']['query'],
                'facets': {'dockets': {'terms': {'field': 'docket_id', 'size': len(ids)}}},
                'size': 0
            }
            
            hp_filter = {
                'has_parent': {
                    'type': 'docket',
                    'filter': {
                        'ids': {'values': ids}
                    }
                }
            }
            if 'filter' in self.query:
                count_query['facets']['dockets']['facet_filter'] = {
                    'and': [
                        self.query['filter']['has_child']['filter'],
                        hp_filter
                    ]
                }
            else:
                count_query['facets']['dockets']['facet_filter'] = hp_filter

            print json.dumps(count_query, indent=4)
            child_results = self.es.search_raw(count_query, indices=self.indices, doc_types=['document'])
            child_counts = dict([(term['term'], term['count']) for term in child_results['facets']['dockets']['terms']])
            #print json.dumps(child_results, indent=4)
        else:
            child_counts = {}

        def stitch_record(match):
            match['url'] = reverse('docket-view', kwargs={'docket_id': match['_id']})

            if match['_id'] in agg_map and 'stats' in agg_map[match['_id']]:
                agg_data = agg_map[match['_id']]
                match['fields'].update({
                    'docket_id': agg_map[match['_id']]['_id'],
                    'date_range': agg_data['stats']['date_range'],
                    'count': agg_data['stats']['count']
                })
                if 'year' in agg_data:
                    match['fields']['year'] = agg_data['year']
                
                rulemaking_field = agg_data.get('details', {}).get('dk_type', None)
                if rulemaking_field:
                    out['fields']['rulemaking'] = rulemaking_field.lower() == 'rulemaking'

            match['fields']['matched'] = child_counts.get(match['_id'], 0)
            
            return match

        return map(stitch_record, s)

class EntitySearchResultsView(MongoSearchResultsView):
    aggregation_level = 'entity'

    # filters for entities are a little weird -- 'submitter' and 'mentioned' are synonymous, and not actually filters, but just add the entities to the results
    # unadorned 'agency' and 'docket' filter entities by submission to that agency/docket, and with '_mentioned', filter by mention in that agency/docket
    allowed_filters = ['agency', 'agency_mentioned', 'docket', 'docket_mentioned', 'submitter', 'mentioned']

    def get_results(self):
        extra_ids = []
        mongo_filter = {'searchable': True, 'td_type': 'organization'}
        has_real_filters = False
        candidate_sorts = []

        for f in self.filters:
            if f[0] in ('submitter', 'mentioned'):
                extra_ids.append(f[1])
            elif f[0].startswith('agency') or f[0].startswith('docket'):
                has_real_filters = True

                filter_key = 'stats.' +\
                    ('text_mentions' if f[0].endswith('_mentioned') else 'submitter_mentions') +\
                    '.%s.%s' % ('agencies' if f[0].startswith('agency') else 'dockets', f[1])
                mongo_filter[filter_key] = {'$gte': 1}
                candidate_sorts.append((filter_key, -1))

        if extra_ids:
            mongo_filter['_id'] = {'$nin': extra_ids}

        query = {'search': self.mongo_query, 'filter': mongo_filter, 'project': {'aliases': 1, 'td_type': 1}, 'limit': 50000}

        return EntitySearchResults(query, extra_ids, alternative_sort=(candidate_sorts[0] if candidate_sorts else None), is_filtered=has_real_filters)

class EntitySearchResults(MongoSearchResults):
    model = Entity

    def get_result_url(self, match_object):
        return reverse('entity-view', kwargs={'entity_id': match_object['_id'], 'type': match_object['td_type']})

    def get_result_fields(self, match_object):
        return {'name': match_object['aliases'][0], 'type': match_object['td_type']}

class AgencySearchResultsView(MongoSearchResultsView):
    aggregation_level = 'agency'

    # filters for entities are a little weird -- 'submitter' and 'mentioned' are synonymous, and not actually filters, but just add the entities to the results
    # unadorned 'agency' and 'docket' filter entities by submission to that agency/docket, and with '_mentioned', filter by mention in that agency/docket
    allowed_filters = ['agency']

    def get_results(self):
        mongo_filter = {}

        extra_ids = [f[1] for f in self.filters if f[0] == 'agency']

        if extra_ids:
            mongo_filter['_id'] = {'$nin': extra_ids}

        query = {'search': self.mongo_query, 'filter': mongo_filter, 'project': {'name': 1}, 'limit': 50000}

        return AgencySearchResults(query, extra_ids)

class AgencySearchResults(MongoSearchResults):
    model = Agency

    def get_result_url(self, match_object):
        return reverse('agency-view', kwargs={'agency': match_object['_id']})

    def get_result_fields(self, match_object):
        return {'name': match_object['name']}

class DefaultSearchResultsView(APIView):
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

        return Response(status=status.HTTP_302_FOUND, headers={'Location': new_url})

def get_similar_dockets(text, exclude_docket):
    es = pyes.ES(settings.ES_SETTINGS)

    results = es.search_raw({
        'query': {
            'more_like_this': {
                'fields': ['files.text'],
                'like_text': text
            }
        },
        'filter': {
            'and': [
                {
                    'terms': {'document_type': ['rule', 'proposed_rule', 'notice']}
                },
                {
                    'not': {
                        'term': {'docket_id': exclude_docket}
                    }
                }
            ]
        },
        'fields': ['docket_id']
    })

    docket_ids = [hit['fields']['docket_id'] for hit in results.hits.hits]
    return uniq(docket_ids)