from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.settings import api_settings
from rest_framework.renderers import JSONPRenderer, BaseRenderer

from django.http import HttpResponse, Http404

from django.views.generic import View
from django.core.urlresolvers import reverse

from util import *
from bulk import DocketExporter, get_deferred_by_uuid
from search import get_similar_dockets

from regs_models import Doc, Docket, Agency, Entity
from mongoengine import Q

from collections import defaultdict
import itertools, isoweek

from django.template.defaultfilters import slugify

from django.conf import settings
import pyes

import re, datetime, calendar, urllib, itertools, struct, uuid

class AggregatedView(APIView):
    "Regulations.gov docket view"

    def get(self, request, *args, **kwargs):
        "Access basic metadata about regulations.gov dockets."

        results = list(self.aggregation_class.objects(id=kwargs[self.aggregation_field]))
        if not results:
            raise Http404('%s not found.' % self.aggregation_level.title())

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
                } for i in sorted(items, key=lambda x: x[1], reverse=True)[:10]]
                stats[label[4:] + "_count"] = len(items)
            del stats['text_entities'], stats['submitter_entities']

            # grab additional info about these ones from the database
            ids = list(set([record['id'] for record in stats['top_text_entities']] + [record['id'] for record in stats['top_submitter_entities']]))
            entities_search = Entity.objects(id__in=ids).only('id', 'td_type', 'aliases')
            entities = dict([(entity.id, entity) for entity in entities_search])

            # stitch this back onto the main records
            for label in ['top_text_entities', 'top_submitter_entities']:
                filtered_entities = []
                for entity in stats[label]:
                    if not entities[entity['id']].td_type or entities[entity['id']].td_type != 'organization':
                        continue
                    
                    entity['type'] = entities[entity['id']].td_type
                    entity['name'] = entities[entity['id']].aliases[0]
                    entity['url'] = '/%s/%s/%s' % (entity['type'], slugify(entity['name']), entity['id'])
                    filtered_entities.append(entity)
                stats[label] = filtered_entities[:5]

            out['stats'] = stats
        else:
            out['stats'] = {'count': 0}

        return Response(out)

class DocketView(AggregatedView):
    aggregation_level = 'docket'
    aggregation_field = 'docket_id'
    aggregation_class = Docket

    def get(self, request, *args, **kwargs):
        out = super(DocketView, self).get(request, *args, **kwargs).data

        stats = out['stats']
        stats['similar_dockets'] = []
        summaries = []

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

                        if doc['summary']:
                            summaries.append(doc['summary'])
                    else:
                        doc['stats'] = {'count': 0, 'comments_open': False}
                        doc['summary'] = None

                # remove duplicates, if any
                tmp = stats['doc_info']['fr_docs']
                included = set()
                stats['doc_info']['fr_docs'] = []
                for doc in tmp:
                    if doc['id'] not in included:
                        stats['doc_info']['fr_docs'].append(doc)
                        included.add(doc['id'])

            summary_text = "\n".join(summaries)
            if summary_text:
                similar_dockets = get_similar_dockets(summary_text, kwargs[self.aggregation_field])[:3]
                if similar_dockets:
                    sd = dict([(docket.id, docket.title) for docket in Docket.objects(id__in=similar_dockets).only('id', 'title')])
                    stats['similar_dockets'] = [{
                        'id': docket,
                        'title': sd[docket]
                    } for docket in similar_dockets]

        agency = self.item.agency
        if not agency:
            agency = re.split("[-_]", self.item.id)[0]
        
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

        return Response(out)

class AgencyView(AggregatedView):
    aggregation_level = 'agency'
    aggregation_field = 'agency'
    aggregation_class = Agency

    def get(self, request, *args, **kwargs):
        out = super(AgencyView, self).get(request, *args, **kwargs).data

        agency = self.item.id

        for label, order in [('recent_dockets', '-stats.date_range.0'), ('popular_dockets', '-stats.count')]:
            dockets = Docket.objects(agency=agency).order_by(order).only('title', 'stats.date_range', 'stats.type_breakdown', 'stats.count').limit(5)
            out[label] = [{
                'date_range': docket.stats['date_range'],
                'count': docket.stats['count'],
                'comment_count': docket.stats['type_breakdown'].get('public_submission', 0),
                'title': docket.title,
                'id': docket.id
            } for docket in dockets]

        return Response(out)

class DocumentView(APIView):
    "Regulations.gov document view"

    def get(self, request, *args, **kwargs):
        "Access basic metadata about regulations.gov documents."
        results = list(Doc.objects(id=kwargs['document_id']))
        if not results or results[0].deleted:
            raise Http404('Document not found.')

        document = results[0]

        # basic document metadata
        out = {
            'title': document.title,
            'url': reverse('document-view', kwargs=kwargs),
            'id': document.id,

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

        # comment-on metadata
        if document.comment_on:
            out['comment_on'] = {
                "fr_doc": document.comment_on.get('fr_doc', False),  
                "type": document.comment_on.get('type', None), 
                "id": document.comment_on['document_id'],
                'url': reverse('document-view', kwargs={'document_id': document.comment_on['document_id']}),
                "title": document.comment_on['title']
            }
            if document.comment_on['agency'] == out['agency']['id'] or not document.comment_on['agency']:
                out['comment_on']['agency'] = out['agency']
            else:
                out['comment_on']['agency'] = {
                    'id': document.comment_on['agency'],
                    'url': reverse('agency-view', kwargs={'agency': document.comment_on['agency']}),
                    'name': Agency.objects(id=document.comment_on['agency']).only("name")[0].name
                }
        else:
            out['comment_on'] = {}

        # docket metadata
        docket = Docket.objects(id=document.docket_id)[0]
        out['docket'] = {
            'id': document.docket_id,
            'url': reverse('docket-view', kwargs={'docket_id': document.docket_id}),
            'title': docket.title,
            'weeks': [],
            'fr_docs': []
        }
        if docket.stats:
            out['docket']['weeks'] = prettify_weeks(docket.stats['weeks'])
            out['docket']['fr_docs'] = docket.stats['doc_info'].get('fr_docs', [])

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

        # stats for FR docs
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

        # cleaned-up details
        details = out['details'].copy()
        dp = lambda key, default=None: details.pop(key, default)
        out['clean_details'] = dtls(
            ('Submitter Information', dtls(
                ('Name', combine(dp('First_Name'), dp('Middle_Name'), dp('Last_Name'))),
                ('Organization', dp('Organization_Name')),
                ('Location', combine(dp('Mailing_Address'), dp('Mailing_Address_'), dp('City'), expand_state(dp('State_or_Province')), dp('Postal_Code'), dp('Country'), sep=", ")),
                ('Email Address', dp('Email_Address')),
                ('Phone Number', dp('Phone_Number')),
                ('Fax Number', dp('Fax_Number')),
                ("Submitter's Representative", dp('Submitter_s_Representative'))
            )),

            ('Dates and Times', dtls(
                ('Document Date', dp('Document_Date')), # rarely-used
                ('Date Received', dp('Received_Date')),
                ('Postmark Date', dp('Postmark_Date', dp('Post_Mark_Date'))),
                ('Date Posted', dp('Date_Posted')),
                (None, dp('Date')), # Swallow this one, since it's always the same as Date_Posted,
                ('Comment Period', combine(
                    short_date(dp('Comment_Start_Date')),
                    short_date(dp('Comment_Due_Date')),
                    sep="&ndash;"
                )),

                # all the other dates -- don't even know what most of these are
                ("File Date", dp("File_Date")),
                ("Answer Date", dp("Answer_Date")),
                ("Author Date", dp("Author_Date")),
                ("Author Document Date", dp("Author_Document_Date")),
                ("Effective Date", dp("Effective_Date")),
                ("Implementation Date", dp("Implementation_Date")),
                ("Implementation Service Date", dp("Implementation_Service_Date"))
            )),
            
            ('Citations and References', dtls(
                ("RIN", document.rin if document.rin else None),
                ("Federal Register No.", dp("Federal_Register_Number")),
                ("Federal Register Pages", dp("Start_End_Page", "").replace(" - ", "&ndash;")),
                (None, dp("Page_Count")), # who cares?
                (None, dp("Page_Start")), # who cares?
                ("Federal Register Citation", dp("Federal_Register_Citation")),
                ("CFR Section(s)", dp("CFR")),
                ("Related RINs", dp("Related_RIN_s_")),
            )),
            
            ('Additional Details', dtls(*details.items()))
        )

        return Response(out)

class EntityView(APIView):
    "TD entity view"

    def get(self, request, *args, **kwargs):
        "Access aggregate information about entities as they occur in regulations.gov data."
        results = Entity.objects(id=kwargs['entity_id'])
        if not results:
            raise Http404('Docket not found.')

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

                docket_list = stats[mention_type]['dockets'].items()
                years = request.GET.get('years', None)
                if years:
                    year_set = set(years.split(","))
                    docket_list = [item for item in docket_list if get_docket_year(item[0]) in year_set]
                dockets = sorted(docket_list, key=lambda x: x[1], reverse=True)[:10]

                stats[mention_type]['top_dockets'] = [{
                    'id': item[0],
                    'count': item[1]
                } for item in dockets]

                stats[mention_type]['docket_count'] = len(docket_list)
                del stats[mention_type]['dockets']

                stats[mention_type]['docket_search_url'] = "/search-docket/" + url_quote(":".join(["mentioned" if mention_type == "text_mentions" else "submitter", entity.id, '"%s"' % entity.aliases[0]]))

            # grab additional docket metadata
            ids = list(set([record['id'] for record in stats['submitter_mentions']['top_dockets']] + [record['id'] for record in stats['text_mentions']['top_dockets']]))
            dockets_search = Docket.objects(id__in=ids).only('id', 'title', 'year', 'details.dk_type', 'agency')
            dockets = dict([(docket.id, docket) for docket in dockets_search])

            # stitch this back onto the main records
            for mention_type in ['text_mentions', 'submitter_mentions']:
                for docket in stats[mention_type]['top_dockets']:
                    rdocket = dockets[docket['id']]
                    docket.update({
                        'title': rdocket.title,
                        'url': reverse('docket-view', kwargs={'docket_id': rdocket.id}),
                        'year': rdocket.year,
                        'rulemaking': rdocket.details.get('Type', 'Nonrulemaking').lower() == 'rulemaking',
                        'agency': rdocket.agency
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

        return Response(out)

class EntityDocketView(APIView):
    "TD/Docket join view"
    renderer_classes = api_settings.DEFAULT_RENDERER_CLASSES + [JSONPRenderer]

    def get(self, request, entity_id, docket_id, document_type, entity_type):
        dkt_results = list(Docket.objects(id=docket_id).only('id', 'title'))
        ent_results = list(Entity.objects(id=entity_id).only('id', 'aliases'))
        if not dkt_results or not ent_results:
            raise Http404('Not found.')

        docket = dkt_results[0]
        entity = ent_results[0]

        if document_type == 'mentions':
            docs_q = Doc.objects(Q(attachments__views__entities=entity_id) | Q(views__entities=entity_id), docket_id=docket_id)
        else:
            docs_q = Doc.objects(submitter_entities=entity_id, docket_id=docket_id) \

        docs_q = docs_q.only('type', 'title', 'id', 'views', 'attachments.views', 'details.Date_Posted', 'deleted').hint([("docket_id", 1)])
        docs = filter(lambda d: not d.deleted, sorted(list(docs_q), key=lambda doc: doc.details.get('Date_Posted', datetime.datetime(1900,1,1)), reverse=True))

        get_views = lambda doc: [{
            'object_id': view.object_id,
            'file_type': view.type,
            'url': view.url.replace('inline', 'attachment')
        } for view in doc.views if entity_id in view.entities]

        out_docs = []
        for doc in docs[:10]:
            out_doc = {
                'title': doc.title,
                'id': doc.id,
                'date_posted': doc.details['Date_Posted'],
                'type': doc.type,
                'url': '/document/' + doc.id
            }
            if document_type == 'mentions':
                out_doc['files'] = get_views(doc) + list(itertools.chain.from_iterable([get_views(attachment) for attachment in doc.attachments]))

            out_docs.append(out_doc)

        return Response({
            'documents': out_docs,
            'has_more': len(docs) > 10,
            'count': len(docs),
            'document_search_url': "/search-document/" + \
                url_quote(":".join(["mentioned" if document_type == "mentions" else "submitter", entity.id, '"%s"' % entity.aliases[0]])) + \
                url_quote(":".join(["docket", docket.id, '"%s"' % docket.title])),
            'docket': {
                'id': docket.id,
                'title': docket.title,
            },
            'entity': {
                'id': entity.id,
                'name': entity.aliases[0]
            },
            'filter_type': document_type
        })

class BinaryEntityRenderer(BaseRenderer):
    media_type = 'application/octet-stream'
    format = 'binary'

    def render(self, data, media_type=None, renderer_context=None):
        max_int64 = 0xFFFFFFFFFFFFFFFF
        entities = data['entities']
        def to_structs():
            for e in entities:
                iid = int(e, 16)
                yield struct.pack('>QQ', (iid >> 64) & max_int64, iid & max_int64)
        return "".join(to_structs())

class EntitySummaryView(APIView):
    renderer_classes = api_settings.DEFAULT_RENDERER_CLASSES + [BinaryEntityRenderer]
    def get(self, request):
        entities = Entity.objects(__raw__={'td_type': 'organization', '$or':[{'stats.submitter_mentions.count':{'$gte':1}}, {'stats.text_mentions.count':{'$gte':1}}]}).only('id')
        return Response({'entities': [e.id for e in entities]})

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

class NotFoundView(APIView):
    def get(self, request):
        return Response(status=404)

class BulkView(APIView):
    def get(self, request, lookup_type, bulk_id):
        if lookup_type == "docket":
            # confirm that the docket is real
            if Docket.objects(id=bulk_id).count() == 0:
                raise Http404('Docket not found.')

            # create the deferred
            bulk_deferred = DocketExporter(bulk_id)

        elif lookup_type == "uuid":
            bulk_deferred = get_deferred_by_uuid(bulk_id)
            if not bulk_deferred:
                raise Http404('Deferred not found.')

        else:
            raise Http404('Bulk type not found.')

        return Response(bulk_deferred.get_status())
