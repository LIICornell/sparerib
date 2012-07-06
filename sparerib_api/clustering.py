from djangorestframework.views import View as DRFView
from analysis.corpus import get_corpora_by_metadata
from django.conf import settings

from django.db import connection
import psycopg2.extras

import itertools
try:
    import numpypy
except:
    pass
import numpy

from util import mongo_connection

DEFAULT_CUTOFF = getattr(settings, 'DEFAULT_CLUSTER_CUTOFF', 0.9)
CORPUS_PREFERENCE = {
    '4-gram':   1,
    'sentence': 2,
    'other':    3
}

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
            corpora = get_corpora_by_metadata('docket', self.kwargs['docket_id'])
            if corpora:
                sorted_corpora = sorted(corpora, key=lambda c: CORPUS_PREFERENCE.get(c.metadata.get('parser', 'other'), CORPUS_PREFERENCE['other']))
                self._corpus = sorted_corpora[0]
            else:
                # todo: better error handling
                raise "Couldn't find analysis for docket %s" % self.kwargs['docket_id']
        return self._corpus

    @property
    def clusters(self):
        if self._clusters is None:
            self._clusters = self.corpus.clusters(self.cutoff)
        return self._clusters

    def dispatch(self, *args, **kwargs):
        # make sure the fancy postgres stuff works right
        connection.cursor()
        psycopg2.extras.register_hstore(connection.connection)
        psycopg2.extras.register_composite('int_bounds', connection.connection)

        return super(CommonClusterView, self).dispatch(*args, **kwargs)



class DocketClusterView(CommonClusterView):
    def get(self, request, docket_id):
        db = mongo_connection()
        docket = db.dockets.find({'_id': docket_id})[0]

        sorted_clusters = sorted(self.clusters, key=lambda c: len(c), reverse=True)
        sized_clusters = [{
            'id': min(cluster),
            'size': len(cluster)
        } for cluster in sorted_clusters]

        total_clustered = sum([cluster['size'] for cluster in sized_clusters])
        out = {
            'clusters': sized_clusters,
            'stats': {
                'clustered': total_clustered,
                'unclustered': docket['stats']['count'] - total_clustered
            },
            'prepopulate': None
        }

        # choose a cluster and document to prepopulate if one hasn't been requested
        prepop = int(request.GET.get('prepopulate_document', 0))
        if prepop:
            pp_cluster = [cluster for cluster in self.clusters if prepop in cluster]
            if pp_cluster:
                out['prepopulate'] = {
                    'document': prepop,
                    'cluster': min(pp_cluster[0])
                }
        if not out['prepopulate'] and out['stats']['clustered'] > 0:
            pp_docs = self.corpus.docs_by_centrality(sorted_clusters[0])
            pp_doc = pp_docs[0]
            out['prepopulate'] = {
                'document': pp_doc[0],
                'cluster': sized_clusters[0]['id']
            }

        return out

class DocketHierarchyView(CommonClusterView):
    def get(self, request, docket_id):
        db = mongo_connection()
        docket = db.dockets.find({'_id': docket_id})[0]

        hierarchy = self.corpus.hierarchy([0.9, 0.8, 0.7, 0.6, 0.5], round(docket['stats']['count'] * .005), request.GET.get('require_summaries', "").lower()=="true")
        total_clustered = sum([cluster['size'] for cluster in hierarchy])
        
        out = {
            'cluster_hierarchy': sorted(hierarchy, key=lambda x: x['size'], reverse=True),
            'stats': {
                'clustered': total_clustered,
                'unclustered': docket['stats']['count'] - total_clustered
            },
            'prepopulate': None
        }

        # choose a cluster and document to prepopulate if one hasn't been requested
        prepop = int(request.GET.get('prepopulate_document', 0))
        if prepop:
            pp_cluster = self.corpus.cluster(prepop, self.cutoff)
            if pp_cluster:
                out['prepopulate'] = {
                    'document': prepop,
                    'cluster': pp_cluster[0],
                    'cutoff': self.cutoff
                }
        if not out['prepopulate'] and out['stats']['clustered'] > 0:
            pp_cluster = self.corpus.cluster(out['cluster_hierarchy'][0]['name'], out['cluster_hierarchy'][0]['cutoff'])
            pp_docs = self.corpus.docs_by_centrality(pp_cluster[1])
            pp_doc = pp_docs[0]
            out['prepopulate'] = {
                'document': pp_doc[0],
                'cluster': pp_cluster[0],
                'cutoff': out['cluster_hierarchy'][0]['cutoff']
            }

        return out

class SingleClusterView(CommonClusterView):
    def get(self, request, docket_id, cluster_id):
        cluster_id = int(cluster_id)
        
        cluster = self.corpus.cluster(cluster_id, self.cutoff)

        docs = self.corpus.docs_by_centrality(cluster[1])

        return {
            'id': cluster[0],
            'documents': [{
                'id': doc[0],
                'title': doc[1]['title'],
                'submitter': ', '.join([doc[1][field] for field in ['submitter_name', 'submitter_organization'] if doc[1].get(field, False)])
            } for doc in docs]
        }

class DocumentClusterView(CommonClusterView):
    def get(self, request, docket_id, cluster_id, document_id):
        document_id = int(document_id)
        cluster_id = int(cluster_id)

        cluster = self.corpus.cluster(cluster_id, self.cutoff)[1]

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
    def get(self, request, docket_id, document_id):
        document_id = int(document_id)

        return {
            'clusters': [{
                'cutoff': round(entry[0], 2),
                'id': entry[1],
                'size': entry[2]
            } for entry in self.corpus.clusters_for_doc(document_id)]
        }

