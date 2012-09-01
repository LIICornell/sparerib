from djangorestframework.views import View as DRFView
from analysis.corpus import get_dual_corpora_by_metadata, find_doc_in_hierarchy, trace_doc_in_hierarchy
from analysis.utils import profile
from django.conf import settings
from django.http import Http404

from django.db import connection
import psycopg2.extras

import itertools
try:
    import numpypy
except:
    pass
import numpy

from regs_models import *

DEFAULT_CUTOFF = getattr(settings, 'DEFAULT_CLUSTER_CUTOFF', 0.9)


class CommonClusterView(DRFView):
    _cutoff = None
    _clusters = None
    _corpus = None

    @property
    def cutoff(self):
        if self._cutoff is None:
            if 'cutoff' in self.PARAMS:
                self._cutoff = float(self.PARAMS['cutoff'])
            else:
                self._cutoff = DEFAULT_CUTOFF
        return self._cutoff

    @property
    def corpus(self):
        if self._corpus is None:
            self._corpus = get_dual_corpora_by_metadata('docket_id', self.kwargs['docket_id'])
            if not self._corpus:
                # todo: better error handling
                raise Http404("Couldn't find analysis for docket %s" % self.kwargs['docket_id'])
        return self._corpus

    def dispatch(self, *args, **kwargs):
        # make sure the fancy postgres stuff works right
        connection.cursor()
        psycopg2.extras.register_hstore(connection.connection)
        psycopg2.extras.register_composite('int_bounds', connection.connection)

        return super(CommonClusterView, self).dispatch(*args, **kwargs)




class DocketHierarchyView(CommonClusterView):
    @profile
    def get(self, request, docket_id):
        docket = Docket.objects.get(id=docket_id)

        hierarchy = self.corpus.hierarchy(request.GET.get('require_summaries', "").lower()=="true")
        total_clustered = sum([cluster['size'] for cluster in hierarchy])
        
        out = {
            'cluster_hierarchy': sorted(hierarchy, key=lambda x: x['size'], reverse=True),
            'stats': {
                'clustered': total_clustered,
                'unclustered': docket.stats['count'] - total_clustered if 'count' in docket.stats else None
            },
            'prepopulate': None
        }

        # choose a cluster and document to prepopulate if one hasn't been requested
        prepop = int(request.GET.get('prepopulate_document', 0))
        if prepop:
            pp_cluster = find_doc_in_hierarchy(hierarchy, prepop, self.cutoff)
            if pp_cluster:
                out['prepopulate'] = {
                    'document': prepop,
                    'cluster': pp_cluster['name'],
                    'cutoff': self.cutoff
                }
        if not out['prepopulate'] and out['stats']['clustered'] > 0:
            pp_cluster = find_doc_in_hierarchy(hierarchy, out['cluster_hierarchy'][0]['name'], out['cluster_hierarchy'][0]['cutoff'])
            out['prepopulate'] = {
                'document': pp_cluster['members'][0],
                'cluster': pp_cluster['name'],
                'cutoff': out['cluster_hierarchy'][0]['cutoff']
            }

        return out

class HierarchyTeaserView(CommonClusterView):
    @profile
    def get(self, request, item_id, item_type="docket"):
        if item_type == "document":
            doc = Doc.objects.only("docket_id").get(id=item_id)
            self.kwargs['docket_id'] = doc.docket_id
        else:
            self.kwargs['docket_id'] = item_id

        hierarchy = self.corpus.hierarchy()

        out = {
            'docket_teaser': {
                '0.5': {'count': self._count_clusters(hierarchy, 0.5)},
                '0.8': {'count': self._count_clusters(hierarchy, 0.8)}
            }
        }

        if item_type == 'document':
            out['document_teaser'] = None
            docs = self.corpus.docs_by_metadata('document_id', item_id)
            if docs:
                out['document_teaser'] = {}
                doc_id = docs[0]

                cluster05 = find_doc_in_hierarchy(hierarchy, doc_id, 0.5)
                if cluster05:
                    out['document_teaser'] = {'0.5': {'count': cluster05['size'], 'id': doc_id}}
                    
                    cluster08 = find_doc_in_hierarchy(hierarchy, doc_id, 0.8)
                    if cluster08:
                        out['document_teaser']['0.8'] = {'count': cluster08['size'], 'id': doc_id}

        return out

    def _count_clusters(self, hierarchy, cutoff):
        count = 0

        for cluster in hierarchy:
            if cluster['cutoff'] == cutoff:
                count += 1

            if cluster['cutoff'] < cutoff:
                count += self._count_clusters(cluster['children'], cutoff)

        return count


class SingleClusterView(CommonClusterView):
    @profile
    def get(self, request, docket_id, cluster_id):
        cluster_id = int(cluster_id)
        
        h = self.corpus.hierarchy()
        cluster = find_doc_in_hierarchy(h, cluster_id, self.cutoff)

        metadatas = dict(self.corpus.doc_metadatas(cluster['members']))

        return {
            'id': cluster['name'],
            'documents': [{
                'id': doc_id,
                'title': metadatas[doc_id]['title'],
                'submitter': ', '.join([metadatas[doc_id][field] for field in ['submitter_name', 'submitter_organization'] if field in metadatas[doc_id]])
            } for doc_id in cluster['members']]
        }


class DocumentClusterView(CommonClusterView):
    @profile
    def get(self, request, docket_id, cluster_id, document_id):
        document_id = int(document_id)
        cluster_id = int(cluster_id)

        h = self.corpus.hierarchy()
        cluster = find_doc_in_hierarchy(h, cluster_id, self.cutoff)['members']

        doc = self.corpus.doc(document_id)
        text = doc['text']
        raw_phrases = self.corpus.phrase_overlap(document_id, cluster)
        
        frequencies = numpy.zeros(len(text), 'l')
        for phrase in raw_phrases.values():
            for occurrence in phrase['indexes']:
                frequencies[occurrence.start:occurrence.end] = numpy.maximum(frequencies[occurrence.start:occurrence.end], phrase['count'])

        freq_ranges = [(f[0], len(list(f[1]))) for f in itertools.groupby(frequencies)]
        cluster_size = float(len(cluster))

        components = []
        cursor = 0
        for fr in freq_ranges:
            components.append((fr[0], text[cursor:cursor + fr[1]]))
            cursor += fr[1]

        html = ''.join(['<span style="background-color:rgba(255,255,0,%s)">%s</span>' % (round(p[0]/cluster_size, 2), p[1]) for p in components])
        return {
            'frequency_html': html
        }

class DocumentClusterChainView(CommonClusterView):
    @profile
    def get(self, request, docket_id, document_id):
        document_id = int(document_id)

        h = self.corpus.hierarchy()

        return {
            'clusters': [{
                'cutoff': round(entry[0], 2),
                'id': entry[1],
                'size': entry[2]
            } for entry in trace_doc_in_hierarchy(h, document_id)]
        }

