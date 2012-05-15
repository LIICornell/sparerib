from djangorestframework.views import View as DRFView
from analysis.corpus import Corpus, get_corpora_by_metadata
from django.conf import settings
from django.http import Http404

from util import *

from django.db import connection
import psycopg2.extras

import itertools
import numpy

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
            corpora = get_corpora_by_metadata('docket', self.kwargs['docket_id'])
            if corpora:
                self._corpus = corpora[0]
            else:
                self.corpus = Corpus()
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
        db = get_db()
        docket = db.dockets.find({'_id': docket_id})[0]

        sized_clusters = [{
            'id': min(cluster),
            'size': len(cluster)
        } for cluster in self.clusters]

        total_clustered = sum([cluster['size'] for cluster in sized_clusters])
        return {
            'clusters': sorted(sized_clusters, key=lambda c: c['size'], reverse=True),
            'stats': {
                'clustered': total_clustered,
                'unclustered': docket['stats']['count'] - total_clustered
            }
        }

class SingleClusterView(CommonClusterView):
    def get(self, request, docket_id, cluster_id):
        cluster_id = int(cluster_id)
        
        try:
            cluster = [cluster for cluster in self.clusters if cluster_id in cluster][0]
        except IndexError:
            raise Http404

        docs = docs_by_centrality(self.corpus, cluster)

        return {'documents': [{
            'id': doc[0],
            'title': doc[1]['title'],
            'submitter': ', '.join([doc[1][field] for field in ['submitter_name', 'submitter_organization'] if doc[1].get(field, False)])
        } for doc in docs]}

class DocumentClusterView(CommonClusterView):
    def get(self, request, docket_id, cluster_id, document_id):
        document_id = int(document_id)
        cluster_id = int(cluster_id)

        try:
            cluster = [cluster for cluster in self.clusters if cluster_id in cluster][0]
        except IndexError:
            raise Http404

        doc = self.corpus.doc(document_id)
        text = doc['text']
        raw_phrases = self.corpus.phrase_overlap(document_id, cluster)
        
        frequencies = numpy.zeros(len(text), 'l')
        for phrase in raw_phrases.values():
            for occurrence in phrase['indexes']:
                numpy.maximum(frequencies[occurrence.start:occurrence.end], phrase['count'], frequencies[occurrence.start:occurrence.end])

        freq_ranges = [(f[0], len(list(f[1]))) for f in itertools.groupby(frequencies)]
        max_freq = float(numpy.amax(frequencies))

        components = []
        cursor = 0
        for fr in freq_ranges:
            components.append((fr[0], text[cursor:cursor + fr[1]]))
            cursor += fr[1]

        html = ''.join(['<span style="background-color:rgba(255,255,0,%s)">%s</span>' % (round(p[0]/max_freq, 2), p[1]) for p in components])
        return {'frequency_html': html}


### UTILITIES ####

# this is mostly a copy of the centroid_doc method as of 87d6e4, except it returns all docs, and their metadata instead of their text
def docs_by_centrality(corpus, doc_ids):
    """Return the document from given document set with minimum average
    distance to other documents in the set.

    Document set may be any arbitrary collection of IDs from the corpus.
    
    Result is (document ID, document text).
    """

    # SQL doesn't support empty lists with IN operator, so check here to avoid SQL error
    if not doc_ids:
        return None
        
    corpus.cursor.execute("""
        with included_sims as (
            select low_document_id, high_document_id, similarity
            from similarities
            where
                corpus_id = %(corpus_id)s
                and low_document_id in %(doc_ids)s
                and high_document_id in %(doc_ids)s
        )
        select document_id, metadata
        from (
            select low_document_id as document_id, similarity from included_sims
            union all
            select high_document_id, similarity from included_sims
        ) x
        inner join documents using (document_id)
        where
            documents.corpus_id = %(corpus_id)s
        group by document_id, metadata
        order by sum(similarity) desc
    """, dict(corpus_id=corpus.id, doc_ids=tuple(doc_ids)))
            
    return corpus.cursor.fetchall()