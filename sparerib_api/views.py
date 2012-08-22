from djangorestframework.mixins import ResponseMixin
from djangorestframework.renderers import DEFAULT_RENDERERS
from djangorestframework.response import Response, ErrorResponse
from djangorestframework.views import View as DRFView
from djangorestframework import status

from django.http import HttpResponse, Http404

from django.views.generic import View
from django.core.urlresolvers import reverse

from util import *

from regs_models import Doc, Docket, Agency, Entity

from collections import defaultdict
import itertools, isoweek

from django.template.defaultfilters import slugify

from django.conf import settings
import pyes

import re, datetime, calendar

class AggregatedView(DRFView):
    "Regulations.gov docket view"

    renderers = DEFAULT_RENDERERS

    def get(self, request, *args, **kwargs):
        "Access basic metadata about regulations.gov dockets."

        results = list(self.aggregation_class.objects(id=kwargs[self.aggregation_field]))
        if not results:
            return self.render(Response(status.HTTP_404_NOT_FOUND, '%s not found.' % self.aggregation_level.title()))

        self.item = item = results[0]

        # basic docket metadata
        out = {
            'url': reverse('%s-view' % self.aggregation_level, kwargs=kwargs),
            'id': item.id,
            'type': self.aggregation_level
        }
        for label in ['name', 'title', 'year']:
            if hasattr(item, label):
                out[label] = getattr(item, label)
        rulemaking_field = getattr(item, 'details', {}).get('Type', None)
        if rulemaking_field:
            out['rulemaking'] = rulemaking_field.lower() == 'rulemaking'

        stats = item.stats
        if stats:
            # cleanup, plus stitch on some additional data
            stats["type_breakdown"] = dict([(doc_type, stats["type_breakdown"].get(doc_type, 0)) for doc_type in Doc.type.choices])

            if 'weeks' in stats and len(stats['weeks']) != 0:
                stats['weeks'] = prettify_weeks(stats['weeks'])


            if 'months' in stats and len(stats['months']) != 0:
                stats['months'] = prettify_months(stats['months'])

            # limit ourselves to the top five of each match type, and grab their extra metadata
            for label, items in [('top_text_entities', stats['text_entities'].items()), ('top_submitter_entities', stats['submitter_entities'].items())]:
                stats[label] = [{
                    'id': i[0],
                    'count': i[1]
                } for i in sorted(items, key=lambda x: x[1], reverse=True)[:5]]
            del stats['text_entities'], stats['submitter_entities']

            # grab additional info about these ones from the database
            ids = list(set([record['id'] for record in stats['top_text_entities']] + [record['id'] for record in stats['top_submitter_entities']]))
            entities_search = Entity.objects(id__in=ids).only('id', 'td_type', 'aliases')
            entities = dict([(entity.id, entity) for entity in entities_search])

            # stitch this back onto the main records
            for label in ['top_text_entities', 'top_submitter_entities']:
                for entity in stats[label]:
                    if not entities[entity['id']].td_type:
                        continue
                    
                    entity['type'] = entities[entity['id']].td_type
                    entity['name'] = entities[entity['id']].aliases[0]
                    entity['url'] = '/%s/%s/%s' % (entity['type'], slugify(entity['name']), entity['id'])

            out['stats'] = stats
        else:
            out['stats'] = {'count': 0}

        return out

class DocketView(AggregatedView):
    aggregation_level = 'docket'
    aggregation_field = 'docket_id'
    aggregation_class = Docket

    def get(self, request, *args, **kwargs):
        out = super(DocketView, self).get(request, *args, **kwargs)

        stats = out['stats']
        if stats['count'] > 0:
            # do a similar thing with FR documents
            if stats.get('doc_info', {}).get('fr_docs', None):
                fr_doc_ids = [doc['id'] for doc in stats['doc_info']['fr_docs']]
                fr_search = Doc.objects(id__in=fr_doc_ids)
                fr_docs = dict([(fr_doc.id, fr_doc) for fr_doc in fr_search])

                for doc in stats['doc_info']['fr_docs']:
                    if doc['id'] in fr_docs:
                        fr_doc = fr_docs[doc['id']]
                        doc['stats'] = {
                            'date_range': fr_doc.stats['date_range'],
                            'count': fr_doc.stats['count']
                        } if fr_doc.stats else {'count': 0}
                        doc['summary'] = fr_doc.get_summary()
                        doc['comments_open'] = 'Comment_Due_Date' in fr_doc.details and fr_doc.details['Comment_Due_Date'] > datetime.datetime.now()
                        print fr_doc.details.get('Comment_Due_Date', 'none')
                    else:
                        doc['stats'] = {'count': 0, 'comments_open': False}
                        doc['summary'] = None

        agency = self.item.agency
        if agency:
            agency_meta = list(Agency.objects(id=agency).only("name"))
            if agency_meta:
                out['agency'] = {
                    'id': agency,
                    'name': agency_meta[0].name,
                    'url': '/agency/%s' % agency
                }
            else:
                agency = None
        
        if not agency:
            out['agency'] = None

        return out

class AgencyView(AggregatedView):
    aggregation_level = 'agency'
    aggregation_field = 'agency'
    aggregation_class = Agency

    def get(self, request, *args, **kwargs):
        out = super(AgencyView, self).get(request, *args, **kwargs)

        agency = self.item.id

        for label, order in [('recent_dockets', '-stats.date_range.0'), ('popular_dockets', '-stats.count')]:
            dockets = Docket.objects(agency=agency).order_by(order).only('title', 'stats.date_range', 'stats.count').limit(5)
            out[label] = [{
                'date_range': docket.stats['date_range'],
                'count': docket.stats['count'],
                'comment_count': docket.stats['type_breakdown'].get('public_submission', 0),
                'title': docket.title,
                'id': docket.id
            } for docket in dockets]

        return out

class DocumentView(ResponseMixin, View):
    "Regulations.gov document view"

    renderers = DEFAULT_RENDERERS

    def get(self, request, *args, **kwargs):
        "Access basic metadata about regulations.gov documents."
        results = list(Doc.objects(id=kwargs['document_id']))
        if not results:
            return self.render(Response(status.HTTP_404_NOT_FOUND, 'Document not found.'))

        document = results[0]

        # basic docket metadata
        out = {
            'title': document.title,
            'url': reverse('document-view', kwargs=kwargs),
            'id': document.id,
            'docket': {
                'id': document.docket_id,
                'url': reverse('docket-view', kwargs={'docket_id': document.docket_id}),
                'title': Docket.objects(id=document.docket_id).only("title")[0].title
            },

            'agency': {
                'id': document.agency,
                'url': reverse('agency-view', kwargs={'agency': document.agency}),
                'name': Agency.objects(id=document.agency).only("name")[0].name
            },
            'date': document.details.get('Date_Posted', None),
            'type': document.type,
            'views': [],
            'attachments': [],
            'details': document.details if document.details else {}
        }

        if out['date']:
            out['date'] = out['date'].isoformat()

        text_entities = set()
        submitter_entities = set(document.submitter_entities if document.submitter_entities else [])

        for view in document.views:
            # hack to deal with documents whose scrapes failed but still got extracted
            object_id = document.object_id if document.object_id else view.file_path.split('/')[-1].split('.')[0]
            out['views'].append({
                'object_id': object_id,
                'file_type': view.type,
                'extracted': view.extracted == 'yes',
                'url': view.url,
                'html': reverse('raw-text-view', kwargs={'document_id': document.id, 'file_type': view.type, 'output_format': 'html', 'view_type': 'view'}) if view.extracted == 'yes' else None
            })

            for entity in view.entities:
                text_entities.add(entity)

        for attachment in document.attachments:
            a = {
                'title': attachment.title,
                'views': []
            }
            for view in attachment.views:
                a['views'].append({
                    'object_id': attachment.object_id,
                    'file_type': view.type,
                    'extracted': view.extracted == 'yes',
                    'url': view.url,
                    'html': reverse('raw-text-view', kwargs={'document_id': document.id, 'object_id': attachment.object_id, 'file_type': view.type, 'output_format': 'html', 'view_type': 'attachment'}) if view.extracted == 'yes' else None
                })

                for entity in view.entities:
                    text_entities.add(entity)
            out['attachments'].append(a)

        stats = document.stats if document.stats else {'count': 0}
        # limit ourselves to the top five of each match type, and grab their extra metadata
        for label in ['text_entities', 'submitter_entities']:
            stats['top_' + label] = [{
                'id': i[0],
                'count': i[1]
            } for i in sorted(stats.get(label, {}).items(), key=lambda x: x[1], reverse=True)[:5]]
            if label in stats:
                del stats[label]
        top_entities = set([record['id'] for record in stats['top_text_entities']] + [record['id'] for record in stats['top_submitter_entities']])

        entities_search = Entity.objects(id__in=list(submitter_entities.union(text_entities, top_entities))).only('id', 'td_type', 'aliases')
        entities = dict([(entity.id, entity) for entity in entities_search])

        for label, items in [('submitter_entities', sorted(list(submitter_entities))), ('text_entities', sorted(list(text_entities)))]:
            out[label] = [{
                'id': item,
                'type': entities[item].td_type,
                'name': entities[item].aliases[0],
                'url': '/%s/%s/%s' % (entities[item].td_type, slugify(entities[item].aliases[0]), item)
            } for item in items]

        for label in ['top_text_entities', 'top_submitter_entities']:
            for entity in stats[label]:
                if not entities[entity['id']].td_type:
                    continue
                
                entity['type'] = entities[entity['id']].td_type
                entity['name'] = entities[entity['id']].aliases[0]
                entity['url'] = '/%s/%s/%s' % (entity['type'], slugify(entity['name']), entity['id'])

        if 'weeks' in stats:
            stats['weeks'] = prettify_weeks(stats['weeks'])

        recent_comments = []
        if 'recent_comments' in stats:
            recent_comments_search = Doc.objects(id__in=[doc['id'] for doc in stats['recent_comments']]).only('id', 'title', 'details')
            for comment in recent_comments_search:
                comment_item = {
                    'title': comment.title,
                    'date': comment.details['Date_Posted'].date().isoformat() if 'Date_Posted' in comment.details else None,
                    'author': " ".join([comment.details.get('First_Name', ''), comment.details.get('Last_Name', '')]).strip(),
                    'organization': comment.details.get('Organization_Name', ''),
                    'url': '/document/' + comment.id
                }
                comment_item['author'] = comment_item['author'] if comment_item['author'] else None
                recent_comments.append(comment_item)

        stats['recent_comments'] = recent_comments

        out['comment_stats'] = stats

        return self.render(Response(200, out))

class EntityView(ResponseMixin, View):
    "TD entity view"

    renderers = DEFAULT_RENDERERS

    def get(self, request, *args, **kwargs):
        "Access aggregate information about entities as they occur in regulations.gov data."
        results = Entity.objects(id=kwargs['entity_id'])
        if not results:
            return self.render(Response(status.HTTP_404_NOT_FOUND, 'Docket not found.'))

        entity = results[0]

        # basic docket metadata
        out = {
            'name': entity.aliases[0],
            'url': reverse('entity-view', args=args, kwargs=kwargs),
            'id': entity.id,
            'type': entity.td_type,
            'stats': entity.stats
        }

        stats = entity.stats
        if stats:
            # cleanup, plus stitch on some additional data
            for mention_type in ["text_mentions", "submitter_mentions"]:
                stats[mention_type].update({
                    'months': prettify_months(stats[mention_type]['months']) if stats[mention_type]['months'] else [],
                })

                # limit ourselves to the top ten of each match type, and grab their extra metadata
                agencies = sorted(stats[mention_type]['agencies'].items(), key=lambda x: x[1], reverse=True)[:10]

                stats[mention_type]['top_agencies'] = [{
                    'id': item[0],
                    'count': item[1],
                    'months': prettify_months(stats[mention_type]['agencies_by_month'][item[0]])
                } for item in agencies]
                del stats[mention_type]['agencies'], stats[mention_type]['agencies_by_month']

                dockets = sorted(stats[mention_type]['dockets'].items(), key=lambda x: x[1], reverse=True)[:10]

                stats[mention_type]['top_dockets'] = [{
                    'id': item[0],
                    'count': item[1]
                } for item in dockets]
                del stats[mention_type]['dockets']

            # grab additional docket metadata
            ids = list(set([record['id'] for record in stats['submitter_mentions']['top_dockets']] + [record['id'] for record in stats['text_mentions']['top_dockets']]))
            dockets_search = Docket.objects(id__in=ids).only('id', 'title', 'year', 'details.dk_type')
            dockets = dict([(docket.id, docket) for docket in dockets_search])

            # stitch this back onto the main records
            for mention_type in ['text_mentions', 'submitter_mentions']:
                for docket in stats[mention_type]['top_dockets']:
                    rdocket = dockets[docket['id']]
                    docket.update({
                        'title': rdocket.title,
                        'url': reverse('docket-view', kwargs={'docket_id': rdocket.id}),
                        'year': rdocket.year,
                        'rulemaking': rdocket.details.get('Type', 'Nonrulemaking').lower() == 'rulemaking'
                    })

            # repeat for agencies
            ids = list(set([record['id'] for record in stats['submitter_mentions']['top_agencies']] + [record['id'] for record in stats['text_mentions']['top_agencies']]))
            agencies_search = Agency.objects(id__in=ids).only('id', 'name')
            agencies = dict([(agency.id, agency) for agency in agencies_search])

            # ...and stitch
            for mention_type in ['text_mentions', 'submitter_mentions']:
                for agency in stats[mention_type]['top_agencies']:
                    ragency = agencies.get(agency['id'], None)
                    agency.update({
                        'name': ragency.name if ragency else agency['id'],
                        'url': '/agency/%s' % agency['id']
                    })

            # and for comments
            recent_comments = []
            if 'recent_comments' in stats['submitter_mentions']:
                recent_comments_search = Doc.objects(id__in=[doc['id'] for doc in stats['submitter_mentions']['recent_comments']]).only('id', 'title', 'details')
                for comment in recent_comments_search:
                    comment_item = {
                        'title': comment.title,
                        'date': comment.details['Date_Posted'].date().isoformat() if 'Date_Posted' in comment.details else None,
                        'author': " ".join([comment.details.get('First_Name', ''), comment.details.get('Last_Name', '')]).strip(),
                        'organization': comment.details.get('Organization_Name', ''),
                        'url': '/document/' + comment.id
                    }
                    comment_item['author'] = comment_item['author'] if comment_item['author'] else None
                    recent_comments.append(comment_item)

            stats['submitter_mentions']['recent_comments'] = recent_comments

            out['stats'] = stats
        else:
            out['stats'] = {'count': 0}

        return self.render(Response(200, out))

class RawTextView(View):
    def get(self, request, document_id, file_type, output_format, view_type, object_id=None):
        doc = Doc.objects.get(id=document_id)
        if view_type == 'view':
            view = [view for view in doc.views if view.type == file_type][0]
        else:
            attachment = [attachment for attachment in doc.attachments if attachment.object_id == object_id][0]
            view = [view for view in attachment.views if view.type == file_type][0]

        if output_format == 'txt':
            return HttpResponse(view.as_text(), content_type='text/plain')
        else:
            return HttpResponse(view.as_html(), content_type='text/html')

class NotFoundView(DRFView):
    def get(self, request):
        raise ErrorResponse(404, {})