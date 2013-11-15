##Overview

This documentation describes the API for [Docket Wrench](http://docketwrench.sunlightfoundation.com), Sunlight Foundation's regulatory comment analysis tool.
For more information about Docket Wrench, its data collection methodology, etc., see its [About page](http://docketwrench.sunlightfoundation.com)

The base url for the API is `/docketwrench.sunlightfoundation.com/api/1.0` ; any
addresses in the below must be appended to the base url. All API calls
require an active [Sunlight API
key](http://services.sunlightlabs.com/accounts/register/) as a querystring argument. For instance, a call
to describe docket EPA-HQ-OAR-2009-0234 would look like `/docket/EPA-HQ-OAR-2009-0234?apikey=[API key]`. API [methods](#methods) are described below.

<a id="methods"></a>
##API Methods


### Agency

    /agency/[agency]
*Methods Supported:* GET

<p>This endpoint powers Docket Wrench's agency pages.  Included are general metadata (name, URL, and ID), as well as stats about the dockets the agency manages, and the
documents within those dockets.  The stats are, for the most part, structured similarly to those provided by the docket endpoint; note, though, that date aggregation is
by month rather than by week because of the longer time scales involved in agency data.  Additional information is included about noteworthy dockets for that agency: <em>recent_dockets</em>
contains dockets whose first submissions were most recent, and <em>popular_dockets</em> includes dockets that have had the most submissions.</p>


#### Parameters
<strong>agency</strong>: a Regulations.gov agency ID, e.g., "FAA" <em>(path parameter; <strong>required</strong>)</em>


### Docket

    /docket/[docket_id]
*Methods Supported:* GET

<p>This endpoint powers Docket Wrench's docket pages.  Included are general metadata (title, URL, year, ID, and whether or not it's a rulemaking docket),
information about the agency that manages the docket, and stats about the docket's contents.  Noteworthy stats subkeys include the total document count
(<em>count</em>), a breakdown of documents by type (<em>type_breakdown</em>, broken down into <em>notice</em>, <em>proposed_rule</em>, <em>rule</em>, <em>public_submission</em>, <em>supporting_material</em>, and <em>other</em>),
information about the top entities that were recognized as having submitted comments (<em>top_submitter_entities</em>) and that were mentioned (<em>top_text_entities</em>).
The <em>doc_info</em> key includes a subkey <em>fr_docs</em> the lists and summarizes all Federal Register documents (notices, proposed rules, and rules) within the docket, with metadata.
<em>weeks</em> is a breakdown of submissions by week over the date range of the receipt of submissions (included separately in the <em>date_range</em> key).</p>


#### Parameters
<strong>docket_id</strong>: a Regulations.gov ID, e.g. "EPA-HQ-OAR-2009-0234" <em>(path parameter; <strong>required</strong>)</em>


### Document

    /document/[document_id]
*Methods Supported:* GET

<p>This endpoint powers Docket Wrench's document pages.  Included are general metadata (type, title, URL, year, and ID),
information about the dockey in which the document can be found, and information about agency that manages that docket. 
Stats are also included about the docket, which powers the docket summary graph on Docket Wrench document pages.
Additional information included about the document includes summary information and URLs about each piece of text included
with the comment (either a <em>view</em> or an <em>attachment</em> in Regulations.gov parlance), relevant information about submitting or mentioned
entities, and <em>details</em> as supplied by Regulations.gov, such as date received, federal register number, etc.  Docket Wrench provides these
details in two forms, one under the <em>details</em> key which is as provided by Regulations.gov, and the other under the <em>clean_details</em> key, which
includes much of the same information cleaned up for display on Docket Wrench: dates are pretty, names are combined, some identifiers are standardized,
and information is grouped and ordered.</p>
<p>Additionally, if the document is a federal register document (a rule, proposed rule, or notice), the response includes stats about comments submitted on
the document, if any.  The format for these stats is similar to that for dockets.</p>


#### Parameters
<strong>document_id</strong>: a Regulations.gov document ID, e.g., "EPA-HQ-OAR-2009-0234-20377" <em>(path parameter; <strong>required</strong>)</em>


### Entity

    /[type]/[entity_id]
*Methods Supported:* GET

<p>This endpoint powers Docket Wrench's organization pages.  Included are general metadata (type, name, URL, and ID),
as well as stats about documents the entity submitted or was mentioned in.  This functionality is powered by the database
of entities underlying our Influence Explorer project, and relies on a somewhat-lossy text-matching process to identify
both submissions and mentions; see the respective methodology pages for Influence Explorer and Docket Wrench for more information.</p>
<p>Stats are divided into <em>text_mentions</em> and <em>submitter_mentions</em> objects, which are structurally similar to one another, and contain information
about documents that mention the entity, and documents that the entity likely submitted, respectively.  In each is general metadata about top dockets
and agencies for each of these document types.  For the agencies, breakdowns of submission by month are included to facilitate drawing of graphs of
submissions over time.</p>


#### Parameters
<strong>entity_id</strong>: an Influence Explorer entity ID, e.g., "d958530f0e2a4979a35af270dfb309a3" <em>(path parameter; <strong>required</strong>)</em>

<strong>type</strong>: an Influence Explorer entity type; currently only "organization" is supported. <em>(path parameter; <strong>required</strong>)</em>


### Entity-Docket Overlap

    /[entity_type]/[entity_id]/[document_type]_in_docket/[docket_id]
*Methods Supported:* GET

<p>This endpoint powers allows Influence Explorer to show specific documents from a specific docket that mention or were submitted by a specific entity; this information
if included on Influence Explorer organization pages.  Metadata is structured similarly to the same information on docket, entity, and document endpoints.</p>


#### Parameters
<strong>entity_id</strong>: an Influence Explorer entity ID <em>(path parameter; <strong>required</strong>)</em>

<strong>document_type</strong>: either 'mentions' or 'submissions' <em>(path parameter; <strong>required</strong>)</em>

<strong>docket_id</strong>: a Regulations.gov docket ID <em>(path parameter; <strong>required</strong>)</em>

<strong>entity_type</strong>: the type of entity; currently must be 'organization' <em>(path parameter; <strong>required</strong>)</em>


### Entity Summary

    /entity_list
*Methods Supported:* GET

This endpoint provides a list of the IDs of all organizations that are recognized to have submitted or be mentioned in at least one document.  In addition to the
usual JSON output, this endpoint can be used with a <em>Content-Accept</em> header of "application/octet-stream" which will return the entity list in a highly compact binary format
consisting of just the UUIDs of the entities in question, expressed as pairs of big-endian unsigned longs; see http://stackoverflow.com/questions/6877096/how-to-pack-a-uuid-into-a-struct-in-python
for more information about decoding.

#### Parameters

### Document Search Results

    /search/document/[query]
*Methods Supported:* GET

<p>This endpoint searches document text.  Search terms are ANDed together, and quoted strings are allowed.  Additionally, filters can be included, formatted as follows: <em>filter_type:filter_text[:filter_display]</em>,
where filter display is an optional additional string that consumers of the results might use in place of an identifier for display purposes (this parameter, if included, can optionally be quoted).  An example
would be <em>agency:FAA:"Federal Aviation Administration"</em>, where "FAA" is the agency's ID, and "Federal Aviation Administration" is the name to be used by clients consuming the results.</p>
<p>Allowed filters for this document type include 'agency', 'docket', 'submitter', 'mentioned', 'type', 'comment_on', and 'date'.  'submitter' and 'mentioned' should use entity IDs, 'type' should be one of the allowed
document types, and 'comment_on' should be the document ID of a Federal Regsiter document.</p>


#### Parameters
<strong>query</strong>: a search query, e.g., "agency:FAA airplane" <em>(path parameter; <strong>required</strong>)</em>


### Federal Register Document Search Results

    /search/document-fr/[query]
*Methods Supported:* GET

<p>This endpoint is similar to the document search, but only includes Federal Register documents in its results (notices, proposed rules, and rules).</p>


#### Parameters
<strong>query</strong>: a search query <em>(path parameter; <strong>required</strong>)</em>


### Non-Federal-Register Document Search Results

    /search/document-non-fr/[query]
*Methods Supported:* GET

<p>This endpoint is similar to the document search, but only includes non-Federal-Register documents in its results (comments, supporting material, and "other").</p>


#### Parameters
<strong>query</strong>: a search query <em>(path parameter; <strong>required</strong>)</em>


### Docket Search Results

    /search/docket/[query]
*Methods Supported:* GET

<p>This endpoint provides search results for dockets, searching both the docket titles and the contents of their documents, with weight given to the former over the latter.
Filtering is similar to that of documents, with the following types supported: 'agency', 'docket', 'submitter', 'mentioned', and 'type'.</p>


#### Parameters
<strong>query</strong>: a search query <em>(path parameter; <strong>required</strong>)</em>


### Agency Search Results

    /search/agency/[query]
*Methods Supported:* GET

<p>This endpoint provides search results for agencies, searching on their names.
Filtering is similar in format to that of documents, with the following types supported: 'submitter' and 'mentioned', each of which
takes an entity ID.  These filters show only agencies that contain documents that either were submitted by or mention the entity with that ID, respectively.</p>


#### Parameters
<strong>query</strong>: a search query <em>(path parameter; <strong>required</strong>)</em>


### Entity Search Results

    /search/entity/[query]
*Methods Supported:* GET

<p>This endpoint provides search results for organizations, on their names.
Filtering is similar in format to that of documents, with the following types supported: 'agency', 'docket', 'agency_mentioned', and 'docket_mentioned'.
The first two filter to organizations that have submitted to that agency or docket, respectively, and last two filter to organizations that have been mentioned
in documents in that agency or docket.</p>


#### Parameters
<strong>query</strong>: a search query <em>(path parameter; <strong>required</strong>)</em>


### Docket Clustering Hierarchy

    /docket/[docket_id]/hierarchy
*Methods Supported:* GET

<p>Docket Wrench uses hierarchical agglomerative clustering (HAC) to cluster comments on a docket-by-docket basis.  The result of this process is a so-called dendrogram
in which clusters can be examined in a tree with smaller numbers of loose clusters at the top, dividing into larger numbers of tigher clusters towards the bottom.
Docket Wrench includes cluster groups at the 50%, 60%, 70%, 80%, and 90% similarity levels.</p>
<p>This endpoint returns the cluster tree for a given docket.  It includes some general information about the docket's clustering behavior in the <em>stats</em> object (its agency, and how many documents
were or were not included in the clustering response, for example).  The actual cluster tree is in <em>cluster_hierarchy</em>, which is a list of the loosest clusters in the docket. Each cluster
is uniquely identified by a combination of the similarity threshold (the <em>cutoff</em> key), and the numerical ID of a canonical document it contains (the <em>name</em> key).  Thus, each cluster has a <em>cutoff</em>,
<em>name</em>, <em>size</em> (which is the number of documents it contains), <em>phrases</em>, and <em>children</em>.  <em>children</em> is another list, of the clusters that result from the splitting of that cluster into subclusters as the
similarity threshold is increased, so each will have a higher similarity threshold than its parent.  A cluster won't have children if it's already at the highest threshold (90%), or if no two documents
it contains are sufficiently similar to still form a cluster at the next threshold of similarity.</p>
<p>This endpoint can also supply distinguishing phrases for each cluster.  The process of calculating these phrases is computationally expensive, so by default, phrases are only included if they've already
been generated and cached; each cluster's <em>phrases</em> key will be a list of strings if this is true, or null otherwise.  Setting the <em>require_summaries</em> GET parameter to <em>true</em> will force computation of phrases
if they haven't already been generated.  Docket Wrench's usage pattern is to make an initial call to this endpoint without <em>require_summaries</em>, then make a second call with <em>require_summaries</em> if phrases weren't
included in the initial response.  This allows the application to render other parts of the clustering visualization without waiting for phrases to be computed, which is slower than the initial clustering
calculations.  Other consuming applications may want to follow this same pattern.</p>


#### Parameters
<strong>docket_id</strong>: a Regulations.gov docket ID, e.g., "EPA-HQ-OAR-2009-0234" <em>(path parameter; <strong>required</strong>)</em>

<strong>require_summaries</strong>: "true" or "false"; defaults to "false" <em>(query parameter; optional)</em>


### Single-cluster Document List

    /docket/[docket_id]/cluster/[cluster_id]
*Methods Supported:* GET

<p>This endpoint supplies a list of the documents within a given cluster; it's used to fill the bottom left pane of the Docket Wrench
clustering visualization.  The cluster is identified by its representative document ID (<em>name</em> in the full clustering response) and
a clustering threshold, supplied via the <em>cutoff</em> GET parameter as a number between 0.5 and 0.9, inclusive.</p>
<p>The response contains a list of documents, ordered by most to least central within the cluster, with the clustering ID of each document,
its title, and any submitter text that was included with the original document.</p>


#### Parameters
<strong>docket_id</strong>: a Regulations.gov docket ID, e.g., "EPA-HQ-OAR-2009-0234" <em>(path parameter; <strong>required</strong>)</em>

<strong>cluster_id</strong>: a numerical representative document ID, e.g., "5123" <em>(path parameter; <strong>required</strong>)</em>

<strong>cutoff</strong>: The cutoff for the docket, specified as a number between 0.5 and 0.9, inclusive. <em>(query parameter; optional)</em>


### Document with Annotated for Cluster

    /docket/[docket_id]/cluster/[cluster_id]/document/[document_id]
*Methods Supported:* GET

<p>This endpoint returns HTML and metadata for a particular comment within a particular cluster for a particular cutoff within a docket.  The HTML is annotated with <em>span</em> tags
that assign a background color to phrases within the text, where phrases that are more frequent within that document's cluster at that cutoff level are darker than those that
are less frequent.  As Docket Wrench's clustering analysis only examines the first 10,000 characters of a document, documents may be truncated; if they are, the <em>truncated</em> key
will be set to <em>True</em>.</p>


#### Parameters
<strong>docket_id</strong>: a Regulations.gov docket ID, e.g., "EPA-HQ-OAR-2009-0234" <em>(path parameter; <strong>required</strong>)</em>

<strong>cluster_id</strong>: a numerical representative document ID, e.g., "5123" <em>(path parameter; <strong>required</strong>)</em>

<strong>document_id</strong>: a numerical document ID, e.g., "5123" <em>(path parameter; <strong>required</strong>)</em>

<strong>cutoff</strong>: The cutoff for the docket, specified as a number between 0.5 and 0.9, inclusive. <em>(query parameter; optional)</em>


### Document Cluster Chain

    /docket/[docket_id]/clusters_for_document/[document_id]
*Methods Supported:* GET

<p>This endpoint allows clients to determine which clusters at which cutoff levels contain a particular document.  Documents, dockets, and clusters are identified as with other clustering endpoints.</p>


#### Parameters
<strong>docket_id</strong>: a Regulations.gov docket ID, e.g., "EPA-HQ-OAR-2009-0234" <em>(path parameter; <strong>required</strong>)</em>

<strong>document_id</strong>: a numerical document ID, e.g., "5123" <em>(path parameter; <strong>required</strong>)</em>


### Clustering Hierarchy Teaser

    /docket/[item_id]/hierarchy_teaser
*Methods Supported:* GET

<p>This endpoint is somewhat similar to the standard docket clustering view, but with less information; it's used to show a teaser of the number
of clusters on regular Docket Wrench docket or document pages, and to decide whether or not to include a link to the full clustering display.  It only
includes cluster counts, and only includes those counts at the 50% and 80% levels.</p>
<p>Information will either be about a document or docket, depending on which is requested in the URL: it will be about clusters containing that document if the URL begins with "/document",
otherwise it will cover all documents within the docket.  <em>item_id</em> will either be a document ID or a docket ID, accordingly.</p>


#### Parameters
<strong>item_id</strong>: a Regulations.gov document or docket ID <em>(path parameter; <strong>required</strong>)</em>


### Clustering Hierarchy Teaser

    /document/[item_id]/hierarchy_teaser
*Methods Supported:* GET

<p>This endpoint is somewhat similar to the standard docket clustering view, but with less information; it's used to show a teaser of the number
of clusters on regular Docket Wrench docket or document pages, and to decide whether or not to include a link to the full clustering display.  It only
includes cluster counts, and only includes those counts at the 50% and 80% levels.</p>
<p>Information will either be about a document or docket, depending on which is requested in the URL: it will be about clusters containing that document if the URL begins with "/document",
otherwise it will cover all documents within the docket.  <em>item_id</em> will either be a document ID or a docket ID, accordingly.</p>


#### Parameters
<strong>item_id</strong>: a Regulations.gov document or docket ID <em>(path parameter; <strong>required</strong>)</em>

