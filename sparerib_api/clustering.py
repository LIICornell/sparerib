from rest_framework.views import APIView
from rest_framework.response import Response
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


class CommonClusterView(APIView):
    _cutoff = None
    _clusters = None
    _corpus = None

    @property
    def cutoff(self):
        if self._cutoff is None:
            if 'cutoff' in self.request.QUERY_PARAMS:
                self._cutoff = float(self.request.QUERY_PARAMS['cutoff'])
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
    """
    Docket Wrench uses hierarchical agglomerative clustering (HAC) to cluster comments on a docket-by-docket basis.  The result of this process is a so-called dendrogram
    in which clusters can be examined in a tree with smaller numbers of loose clusters at the top, dividing into larger numbers of tigher clusters towards the bottom.
    Docket Wrench includes cluster groups at the 50%, 60%, 70%, 80%, and 90% similarity levels.

    This endpoint returns the cluster tree for a given docket.  It includes some general information about the docket's clustering behavior in the *stats* object (its agency, and how many documents
    were or were not included in the clustering response, for example).  The actual cluster tree is in *cluster_hierarchy*, which is a list of the loosest clusters in the docket. Each cluster
    is uniquely identified by a combination of the similarity threshold (the *cutoff* key), and the numerical ID of a canonical document it contains (the *name* key).  Thus, each cluster has a *cutoff*,
    *name*, *size* (which is the number of documents it contains), *phrases*, and *children*.  *children* is another list, of the clusters that result from the splitting of that cluster into subclusters as the
    similarity threshold is increased, so each will have a higher similarity threshold than its parent.  A cluster won't have children if it's already at the highest threshold (90%), or if no two documents
    it contains are sufficiently similar to still form a cluster at the next threshold of similarity.

    This endpoint can also supply distinguishing phrases for each cluster.  The process of calculating these phrases is computationally expensive, so by default, phrases are only included if they've already
    been generated and cached; each cluster's *phrases* key will be a list of strings if this is true, or null otherwise.  Setting the *require_summaries* GET parameter to *True* will force computation of phrases
    if they haven't already been generated.  Docket Wrench's usage pattern is to make an initial call to this endpoint without *require_summaries*, then make a second call with *require_summaries* if phrases weren't
    included in the initial response.  This allows the application to render other parts of the clustering visualization without waiting for phrases to be computed, which is slower than the initial clustering
    calculations.  Other consuming applications may want to follow this same pattern.
    """

    name = "Docket Clustering Hierarchy"

    @profile
    def get(self, request, docket_id):
        docket = Docket.objects.get(id=docket_id)

        hierarchy = self.corpus.hierarchy(request.GET.get('require_summaries', "").lower()=="true")
        total_clustered = sum([cluster['size'] for cluster in hierarchy])
        
        out = {
            'cluster_hierarchy': sorted(hierarchy, key=lambda x: x['size'], reverse=True),
            'stats': {
                'clustered': total_clustered,
                'unclustered': docket.stats['count'] - total_clustered if 'count' in docket.stats else None,
                'date_range': docket.stats['date_range'] if 'date_range' in docket.stats else None
            },
            'prepopulate': None
        }

        # populate agency info
        agency = docket.agency
        if agency:
            agency_meta = list(Agency.objects(id=agency).only("name"))
            if agency_meta:
                out['stats']['agency'] = {
                    'id': agency,
                    'name': agency_meta[0].name,
                    'url': '/agency/%s' % agency
                }
            else:
                out['stats']['agency'] = None

        # choose a cluster and document to prepopulate if one hasn't been requested
        prepop = int(request.GET.get('prepopulate_document', -1))
        if prepop > -1:
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

        remove_members(out['cluster_hierarchy'])

        return Response(out)

def remove_members(hierarchy):
    """Remove doc IDs from cluster hierarchy.

    IDs are needed for some internal operations, but aren't
    needed in browser. Large dockets could have tense of thousands
    of IDs, making API results unnecessarily large if not removed.
    """
    for c in hierarchy:
        del c['members']
        remove_members(c['children'])


class HierarchyTeaserView(CommonClusterView):
    """
    This endpoint is somewhat similar to the standard docket clustering view, but with less information; it's used to show a teaser of the number
    of clusters on regular Docket Wrench docket or document pages, and to decide whether or not to include a link to the full clustering display.  It only
    includes cluster counts, and only includes those counts at the 50% and 80% levels.

    Information will either be about a document or docket, depending on which is requested in the URL: it will be about clusters containing that document if the URL begins with "/document",
    otherwise it will cover all documents within the docket.  *item_id* will either be a document ID or a docket ID, accordingly.

    item_id -- a Regulations.gov document or docket ID
    """
    name = "Docket Clustering Hierarchy Teaser"

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

        return Response(out)

    def _count_clusters(self, hierarchy, cutoff):
        count = 0

        for cluster in hierarchy:
            if cluster['cutoff'] == cutoff:
                count += 1

            if cluster['cutoff'] < cutoff:
                count += self._count_clusters(cluster['children'], cutoff)

        return count


class SingleClusterView(CommonClusterView):
    """
    This endpoint supplies a list of the documents within a given cluster; it's used to fill the bottom left pane of the Docket Wrench
    clustering visualization.  The cluster is identified by its representative document ID (*name* in the full clustering response) and
    a clustering threshold, supplied via the *cutoff* GET parameter as a number between 0.5 and 0.9, inclusive.

    The response contains a list of documents, ordered by most to least central within the cluster, with the clustering ID of each document,
    its title, and any submitter text that was included with the original document.

    cutoff -- The cutoff for the docket, specified as a number between 0.5 and 0.9, inclusive.
    """
    name = "Single-cluster Document List"

    @profile
    def get(self, request, docket_id, cluster_id):
        cluster_id = int(cluster_id)
        
        h = self.corpus.hierarchy()
        cluster = find_doc_in_hierarchy(h, cluster_id, self.cutoff)

        metadatas = dict(self.corpus.doc_metadatas(cluster['members']))

        return Response({
            'id': cluster['name'],
            'documents': [{
                'id': doc_id,
                'title': metadatas[doc_id]['title'],
                'submitter': ', '.join([metadatas[doc_id][field] for field in ['submitter_name', 'submitter_organization'] if field in metadatas[doc_id] and metadatas[doc_id][field]])
            } for doc_id in cluster['members']]
        })


class DocumentClusterView(CommonClusterView):
    """
    This endpoint returns HTML and metadata for a particular comment within a particular cluster for a particular cutoff within a docket.  The HTML is annotated with *span* tags
    that assign a background color to phrases within the text, where phrases that are more frequent within that document's cluster at that cutoff level are darker than those that
    are less frequent.  As Docket Wrench's clustering analysis only examines the first 10,000 characters of a document, documents may be truncated; if they are, the *truncated* key
    will be set to *True*.

    cutoff -- The cutoff for the docket, specified as a number between 0.5 and 0.9, inclusive.
    """

    name = "Document with Annotated for Cluster"

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

        html = ''.join(['<span style="background-color:rgba(160,211,216,%s)">%s</span>' % (round(p[0]/cluster_size, 2), p[1]) for p in components])
        html = html.replace("\n", "<br />")
        return Response({
            'metadata': {
                'title': doc['metadata'].get('title', None),
                'submitter': ', '.join([doc['metadata'][field] for field in ['submitter_name', 'submitter_organization'] if field in doc['metadata'] and doc['metadata'][field]]),
                'document_id': doc['metadata'].get('document_id', None),
            },
            'frequency_html': html,
            'truncated': len(doc['text']) == 10000
        })

class DocumentClusterChainView(CommonClusterView):
    """
    This endpoint allows clients to determine which clusters at which cutoff levels contain a particular document.  Documents, dockets, and clusters are identified as with other clustering endpoints.
    """

    @profile
    def get(self, request, docket_id, document_id):
        document_id = int(document_id)

        h = self.corpus.hierarchy()

        return Response({
            'clusters': [{
                'cutoff': round(entry[0], 2),
                'id': entry[1],
                'size': entry[2]
            } for entry in trace_doc_in_hierarchy(h, document_id)]
        })

