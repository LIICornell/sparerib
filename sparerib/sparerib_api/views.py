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

class DocketView(ResponseMixin, View):
    "Regulations.gov docket view"

    renderers = DEFAULT_RENDERERS

    def get(self, request, *args, **kwargs):
        "Access basic metadata about regulations.gov dockets."

        db = get_db()

        results = list(db.dockets.find({'docket_id': kwargs['docket_id']}))
        if not results:
            return self.render(Response(status.HTTP_404_NOT_FOUND, 'Docket not found.'))

        docket = results[0]

        # basic docket metadata
        out = {
            'title': docket['title'],
            'url': reverse('docket-view', kwargs=kwargs),
            'id': docket['docket_id'],

            'agency': docket['agency'],
            'year': docket['year'],
            'rulemaking': docket['details'].get('dk_type', 'Nonrulemaking').lower() == 'rulemaking'
        }

        # grab the documents to calculate stats (temporary until we can get some map/reduce action done)
        total = 0
        weeks = defaultdict(int)
        types = defaultdict(int)
        text_entities = defaultdict(int)
        submitter_entities = defaultdict(int)
        rules = []
        earliest = None
        latest = None
        docs = db.docs.find({'docket_id': out['id']}, fields=[
            'document_id',
            'title',
            'details.fr_publish_date',
            'type',
            'views.entities',
            'attachments.views.entities',
            'submitter_entities'
        ])

        # iterate over the docs to aggregate some useful stuff
        for doc in docs:
            total += 1

            date = doc.get('details', {}).get('fr_publish_date', None)
            if date:
                week = date.isocalendar()[:-1]
                weeks[week] += 1

                real_date = date.date()
                if earliest == None or real_date < earliest:
                    earliest = real_date
                if latest == None or real_date > latest:
                    latest = real_date

            if 'type' in doc:
                types[doc['type']] += 1

                if doc['type'] in ['rule', 'proposed_rule']:
                    rules.append({
                        'date': date.date().isoformat() if date else None,
                        'type': doc['type'],
                        'id': doc['document_id'],
                        'url': reverse('document-view', kwargs={'document_id': doc['document_id']}),
                        'title': doc['title']
                    })

            # views and attachment views together
            views = itertools.chain.from_iterable([doc.get('views', [])] + [attachment.get('views', []) for attachment in doc.get('attachments', [])])
            for view in views:
                for entity in view.get('entities', []):
                    text_entities[entity] += 1

            # submitters
            for entity in doc.get('submitter_entities', []):
                submitter_entities[entity] += 1

        # clean some of that up a bit
        stats = {
            'document_count': total,
            'type_breakdown': sorted(types.items(), key=lambda x: x[0]),
            'rules': sorted(rules, key=lambda x: x['date']),
            'weeks': [],
            'date_range': [earliest.isoformat(), latest.isoformat()]
        }

        for week in sorted(weeks.items(), key=lambda x: x[0]):
            isw = isoweek.Week(*week[0])
            stats['weeks'].append({
                'date_range': [isw.monday().isoformat(), isw.sunday().isoformat()],
                'total': week[1]
            })

        # limit ourselves to the top ten of each match type, and grab their extra metadata
        for label, items in [('top_text_entities', text_entities.items()), ('top_submitter_entities', submitter_entities.items())]:
            stats[label] = [{
                'id': item[0],
                'total': item[1]
            } for item in sorted(items, key=lambda x: x[1], reverse=True)[:10]]

        # grab additional info about these ones from the database
        ids = [record['id'] for record in stats['top_text_entities']] + [record['id'] for record in stats['top_submitter_entities']]
        entities_search = db.entities.find({'_id': {'$in': ids}})
        entities = dict([(entity['_id'], entity) for entity in entities_search])

        # stitch this back onto the main records
        for label in ['top_text_entities', 'top_submitter_entities']:
            for entity in stats[label]:
                entity['type'] = entities[entity['id']]['td_type']
                entity['name'] = entities[entity['id']]['aliases'][0]
                entity['url'] = '/%s/%s/%s' % (entity['type'], slugify(entity['name']), entity['id'])

        out['stats'] = stats

        return self.render(Response(200, out))

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