from djangorestframework.mixins import ResponseMixin
from djangorestframework.renderers import DEFAULT_RENDERERS
from djangorestframework.response import Response, ErrorResponse
from djangorestframework import status

from django.views.generic import View
from django.core.urlresolvers import reverse

from util import get_db

from collections import defaultdict
import itertools, isoweek

from django.template.defaultfilters import slugify

from django.conf import settings
import pyes

class AggregatedView(ResponseMixin, View):
    "Regulations.gov docket view"

    renderers = DEFAULT_RENDERERS

    def get(self, request, *args, **kwargs):
        "Access basic metadata about regulations.gov dockets."

        db = get_db()

        results = list(db[self.aggregation_collection].find({'_id': kwargs[self.aggregation_field]}))
        if not results:
            return self.render(Response(status.HTTP_404_NOT_FOUND, '%s not found.' % self.aggregation_level.title()))

        item = results[0]

        # basic docket metadata
        out = {
            'url': reverse('%s-view' % self.aggregation_level, kwargs=kwargs),
            'id': item['_id'],
            'type': self.aggregation_level
        }
        for label in ['name', 'title', 'year']:
            if label in item:
                out[label] = item[label]
        rulemaking_field = item.get('details', {}).get('dk_type', None)
        if rulemaking_field:
            out['rulemaking'] = rulemaking_field.lower() == 'rulemaking'

        stats = item.get('stats', None)
        if stats:
            # cleanup, plus stitch on some additional data
            stats['type_breakdown'] = [{
                    'type': key,
                    'count': value
                } for key, value in sorted(stats['type_breakdown'].items(), key=lambda x: x[1], reverse=True)]

            if 'weeks' in stats:
                stats['weeks'] = [{
                    'date_range': key,
                    'count': value
                } for key, value in stats['weeks']]

            if 'months' in stats:
                stats['months'] = [{
                    'month': key,
                    'count': value
                } for key, value in stats['months']]

            # limit ourselves to the top ten of each match type, and grab their extra metadata
            for label, items in [('top_text_entities', stats['text_entities'].items()), ('top_submitter_entities', stats['submitter_entities'].items())]:
                stats[label] = [{
                    'id': i[0],
                    'count': i[1]
                } for i in sorted(items, key=lambda x: x[1], reverse=True)[:10]]
            del stats['text_entities'], stats['submitter_entities']

            # grab additional info about these ones from the database
            ids = list(set([record['id'] for record in stats['top_text_entities']] + [record['id'] for record in stats['top_submitter_entities']]))
            entities_search = db.entities.find({'_id': {'$in': ids}}, ['_id', 'td_type', 'aliases'])
            entities = dict([(entity['_id'], entity) for entity in entities_search])

            # stitch this back onto the main records
            for label in ['top_text_entities', 'top_submitter_entities']:
                for entity in stats[label]:
                    if 'td_type' not in entities[entity['id']]:
                        continue
                    
                    entity['type'] = entities[entity['id']]['td_type']
                    entity['name'] = entities[entity['id']]['aliases'][0]
                    entity['url'] = '/%s/%s/%s' % (entity['type'], slugify(entity['name']), entity['id'])

            out['stats'] = stats
        else:
            out['stats'] = {'count': 0}

        # do something with the agency if this is not, itself, an agency request
        if self.aggregation_level != 'agency':
            agency = item.get('agency', None)
            if agency:
                agency_meta = list(db.agencies.find({'_id': agency}))
                if agency_meta:
                    out['agency'] = {
                        'id': agency,
                        'name': agency_meta[0]['name'],
                        'url': '/agency/%s' % agency
                    }
                else:
                    agency = None
            
            if not agency:
                out['agency'] = None

        return self.render(Response(200, out))

class DocketView(AggregatedView):
    aggregation_level = 'docket'
    aggregation_field = 'docket_id'
    aggregation_collection = 'dockets'

class AgencyView(AggregatedView):
    aggregation_level = 'agency'
    aggregation_field = 'agency'
    aggregation_collection = 'agencies'

class DocumentView(ResponseMixin, View):
    "Regulations.gov document view"

    renderers = DEFAULT_RENDERERS

    def get(self, request, *args, **kwargs):
        "Access basic metadata about regulations.gov documents."

        db = get_db()

        results = list(db.docs.find({'document_id': kwargs['document_id']}))
        if not results:
            return self.render(Response(status.HTTP_404_NOT_FOUND, 'Document not found.'))

        document = results[0]

        # basic docket metadata
        out = {
            'title': document['title'],
            'url': reverse('document-view', kwargs=kwargs),
            'id': document['document_id'],
            'docket': {
                'id': document['docket_id'],
                'url': reverse('docket-view', kwargs={'docket_id': document['docket_id']})
            },

            'agency': document['agency'],
            'date': document.get('details', {}).get('fr_publish_date', None),
            'type': document.get('type', None),
            'views': []
        }

        if out['date']:
            out['date'] = out['date'].isoformat()

        text_entities = set()
        submitter_entities = set(document.get('submitter_entities', []))

        for view in document.get('views', []):
            # hack to deal with documents whose scrapes failed but still got extracted
            object_id = document['object_id'] if 'object_id' in document else view['file'].split('/')[-1].split('.')[0]
            out['views'].append({
                'object_id': object_id,
                'file_type': view['type'],
                'view_type': 'document_view',
                'title': None
            })

            for entity in view.get('entities', []):
                text_entities.add(entity)

        for attachment in document.get('attachments', []):
            for view in attachment.get('views', []):
                out['views'].append({
                    'object_id': attachment['object_id'],
                    'file_type': view['type'],
                    'view_type': 'attachment_view',
                    'title': attachment['title']
                })

                for entity in view.get('entities', []):
                    text_entities.add(entity)

        entities_search = db.entities.find({'_id': {'$in': list(submitter_entities.union(text_entities))}})
        entities = dict([(entity['_id'], entity) for entity in entities_search])

        for label, items in [('submitter_entities', sorted(list(submitter_entities))), ('text_entities', sorted(list(text_entities)))]:
            out[label] = [{
                'id': item,
                'type': entities[item]['td_type'],
                'name': entities[item]['aliases'][0],
                'url': '/%s/%s/%s' % (entities[item]['td_type'], slugify(entities[item]['aliases'][0]), item)
            } for item in items]

        return self.render(Response(200, out))

class EntityView(ResponseMixin, View):
    "TD entity view"

    renderers = DEFAULT_RENDERERS

    def get(self, request, *args, **kwargs):
        "Access aggregate information about entities as they occur in regulations.gov data."

        db = get_db()

        results = list(db.entities.find({'_id': kwargs['entity_id']}))
        if not results:
            return self.render(Response(status.HTTP_404_NOT_FOUND, 'Docket not found.'))

        entity = results[0]

        # basic docket metadata
        out = {
            'name': entity['aliases'][0],
            'url': reverse('entity-view', args=args, kwargs=kwargs),
            'id': entity['_id'],
            'type': entity['td_type'],
            'stats': entity['stats']
        }

        stats = entity.get('stats', None)
        if stats:
            # cleanup, plus stitch on some additional data
            for mention_type in ["text_mentions", "submitter_mentions"]:
                stats[mention_type].update({
                    'months': [{
                        'month': key,
                        'count': value
                    } for key, value in stats[mention_type]['months']],
                })

                # limit ourselves to the top ten of each match type, and grab their extra metadata
                agencies = sorted(stats[mention_type]['agencies'].items(), key=lambda x: x[1], reverse=True)
                if len(agencies) > 5:
                    agencies = agencies[:5] + ('Other', sum([a[1] for a in agencies[5:]]))

                dockets = sorted(stats[mention_type]['dockets'].items(), key=lambda x: x[1], reverse=True)[:10]

                for label, items in [('top_dockets', dockets), ('top_agencies', agencies)]:
                    stats[mention_type][label] = [{
                        'id': item[0],
                        'count': item[1]
                    } for item in items]
                del stats[mention_type]['dockets'], stats[mention_type]['agencies']

            # grab additional docket metadata
            ids = list(set([record['id'] for record in stats['submitter_mentions']['top_dockets']] + [record['id'] for record in stats['text_mentions']['top_dockets']]))
            dockets_search = db.dockets.find({'_id': {'$in': ids}}, ['_id', 'title', 'year', 'details.dk_type'])
            dockets = dict([(docket['_id'], docket) for docket in dockets_search])

            # stitch this back onto the main records
            for mention_type in ['text_mentions', 'submitter_mentions']:
                for docket in stats[mention_type]['top_dockets']:
                    rdocket = dockets[docket['id']]
                    docket.update({
                        'title': rdocket['title'],
                        'url': reverse('docket-view', kwargs={'docket_id': rdocket['_id']}),
                        'year': rdocket['year'],
                        'rulemaking': rdocket.get('details', {}).get('dk_type', 'Nonrulemaking').lower() == 'rulemaking'
                    })

            # repeat for agencies
            ids = list(set([record['id'] for record in stats['submitter_mentions']['top_agencies']] + [record['id'] for record in stats['text_mentions']['top_agencies']]))
            agencies_search = db.agencies.find({'_id': {'$in': ids}}, ['_id', 'name'])
            agencies = dict([(agency['_id'], agency) for agency in agencies_search])

            # ...and stitch
            for mention_type in ['text_mentions', 'submitter_mentions']:
                for agency in stats[mention_type]['top_agencies']:
                    ragency = agencies.get(agency['id'], None)
                    agency.update({
                        'name': ragency['name'] if ragency else agency['id'],
                        'url': '/agency/%s' % agency['id']
                    })

            out['stats'] = stats
        else:
            out['stats'] = {'count': 0}

        return self.render(Response(200, out))

class SearchView(ResponseMixin, View):
    "Regulations.gov docket view"

    renderers = DEFAULT_RENDERERS

    def get(self, request, *args, **kwargs):
        # HACK! use a filter to restrict us to the only agencies we support at the moment
        query = {'filter': {'terms': {'agency': ['ED', 'CPSC']}}, 'query': {'text': {'files.text': kwargs['query']}}}
        
        es = pyes.ES(settings.ES_SETTINGS)
        out = es.search_raw(query)

        # HACK #2 -- the docket IDs are all document IDs by accident.  Oops.  Clumsily fix that.
        for hit in out['hits']['hits']:
            hit['_source']['docket_id'] = '-'.join(hit['_source']['docket_id'].split('-')[:-1])

        return self.render(Response(200, out))