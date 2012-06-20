(function($) {
// General models
var Document = Backbone.Model.extend({ url: function() { return "/api/1.0/document/" + this.id; } });
var Docket = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.id; } });
var Agency = Backbone.Model.extend({ url: function() { return "/api/1.0/agency/" + this.id; } });
var Entity = Backbone.Model.extend({ url: function() { return "/api/1.0/entity/" + this.id; } });
var SearchResults = Backbone.Model.extend({ idAttribute: "query", url: function() { return "/api/1.0/search/" + (this.get('level') ? this.get('level') + '/' : '') + encodeURIComponent(this.id) + (this.get('in_page') ? "?page=" + this.get('in_page') : ''); } });

// Cluster models
var DocketClusters = Backbone.Model.extend({ url: function() {
    var preselect = this.get('docId');
    var cutoff = this.get('cutoff');
    var qs = [];
    if (cutoff) qs.push("cutoff=" + cutoff);
    if (preselect) qs.push("prepopulate_document=" + preselect);
    return "/api/1.0/docket/" + this.id + "/hierarchy?" + qs.join("&");
} });
var Cluster = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.get('docket_id') + "/cluster/" + this.id + "?cutoff=" + this.get('cutoff'); } });
var ClusterDocument = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.get('docket_id') + "/cluster/" + this.get('cluster_id') + "/document/" + this.id + "?cutoff=" + this.get('cutoff'); } });

// Template helpers
var helpers = {
    'formatDate': function(iso_date) {
        var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        var date = new Date(iso_date);
        return (months[date.getUTCMonth()] + " " + date.getUTCDate() + ", " + date.getUTCFullYear());
    },
    'capitalize': function(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    },
    'prettifyLabel': function(string) {
        return _.map(string.split('_'), helpers.capitalize).join(' ');
    },
    'getIcon': function(file_type) {
        var icons = {
            'html':   'html',
            'xml':    'html',
            'crtext': 'html',

            'msw':    'msw',
            'msw6':   'msw',
            'msw8':   'msw',
            'msw12':  'msw',

            'pdf':    'pdf',
            'rtf':    'rtf',
            'txt':    'txt',
            'wp8':    'wp8',
            '?':      'unknown'
        }
        return '/static/img/icons/64x64/icon_' + (typeof icons[file_type] == "undefined" ? icons['?'] : icons[file_type]) + '.png';
    }
}
// Views
var SearchView = Backbone.View.extend({
    tagName: 'div',
    className: 'search-view',

    events: {
        'submit form': 'search'
    },

    template: _.template($('#search-tpl').html()),
    render: function() {
        $(this.el).html(this.template(this));
        return this;
    },

    search: function(evt) {
        evt.preventDefault();
        app.navigate('/search/' + encodeURIComponent($(this.el).find('.search-query').val()), {trigger: true});
        return false;
    }
})

var ResultsView = Backbone.View.extend({
    tagName: 'div',
    id: 'results-view',

    template: _.template($('#results-tpl').html()),
    render: function() {
        this.model.fetch(
            {
                'success': $.proxy(function() {
                    var context = _.extend({}, helpers, this.model.toJSON());
                    $(this.el).html(this.template(context));

                    // update the URL for the right type
                    if (!this.model.get('level')) {
                        app.navigate('/search-' + this.model.attributes.search.aggregation_level + '/' + encodeURIComponent(this.model.attributes.search.raw_query) + (this.model.get('in_page') ? '/' + this.model.get('in_page') : ''), {trigger: false, replace: true});
                    }

                    // populate the search input
                    this.$el.closest('.search-view').find('form input.search-query').val(context.search.raw_query);
                }, this),
                'error': function() {
                    console.log('failed');
                }
            }
        );
        return this;
    }
})

var AggregatedDetailView = Backbone.View.extend({
    tagName: 'div',
    id: 'docket-view',

    template: _.template($('#aggregated-tpl').html()),
    render: function() {
        this.model.fetch(
            {
                'success': $.proxy(function() {
                    var context = _.extend({}, helpers, this.model.toJSON());
                    $(this.el).html(this.template(context));

                    // charts
                    SpareribCharts.type_breakdown_piechart('type-breakdown', context.stats.type_breakdown);
                    
                    var timeGranularity = this.model.get('type') == 'docket' ? 'weeks' : 'months';
                    var timeline_data = [{
                        'name': 'Submission Timline',
                        'href': '',
                        'timeline': context.stats[timeGranularity],
                        'overlays': []
                    }];
                    _.each(context.stats.fr_docs, function(doc) {
                        timeline_data[0].overlays.push({
                            'name': doc.title,
                            'date_range': doc.comment_date_range ? doc.comment_date_range : [doc.date, null],
                            'type': doc.type
                        });
                    });
                    SpareribCharts.timeline_chart('submission-timeline', timeline_data);
                }, this),
                'error': function() {
                    console.log('failed');
                }
            }
        );
        return this;
    }
})

var DocumentDetailView = Backbone.View.extend({
    tagName: 'div',
    id: 'document-view',

    events: {
        'click .tab': 'switchTab',
        'click .attachment-name': 'toggleAttachment'
    },

    template: _.template($('#document-tpl').html()),
    render: function() {
        this.model.fetch(
            {
                'success': $.proxy(function() {
                    var context = _.extend({}, helpers, this.model.toJSON());

                    // tweak attachments a bit
                    context['full_attachments'] = [{'title': 'Main Views', 'attachment': false, 'views': context['views']}].concat(_.map(context['attachments'], function(attachment) {
                        attachment['attachment'] = true;
                        return attachment;
                    }));
                    $(this.el).html(this.template(context));

                    // make the first attachment visible
                    $(this.el).find('.attachment-name').eq(0).click()
                }, this),
                'error': function() {
                    console.log('failed');
                }
            }
        );
        return this;
    },

    switchTab: function(evt) {
        var $tab = $(evt.target).closest('.tab');
        var $this = $(this.el);
        var $area = $tab.closest('.tab-area');
        if (!$tab.hasClass('active')) {
            $area.find('.tab').removeClass('active');
            $tab.addClass('active');

            var view = $area.find('.tab-view').hide().filter('[data-tab-id=' + $tab.attr('data-tab-id') + ']').show();
            var iframe = view.find('iframe');
            if (!iframe.attr('src')) {
                iframe.attr('src', iframe.attr('data-src'));
            }
        }
    },

    toggleAttachment: function(evt) {
        var $name = $(evt.target).closest('.attachment-name');
        var $attachment = $name.closest('.attachment');
        var $area = $attachment.find('.tab-area');
        if (!$name.hasClass('active')) {
            // first make sure something is visible in the hidden area
            var tabs = $area.find('.tab');
            if (tabs.filter('.active').length == 0) {
                tabs.eq(0).click();
            }

            // then show the whole thing
            $name.addClass('active');
            $area.slideDown('fast');
        } else {
            $name.removeClass('active');
            $area.slideUp('fast');
        }
    }
})

var EntityDetailView = Backbone.View.extend({
    tagName: 'div',
    id: 'entity-view',

    template: _.template($('#entity-tpl').html()),
    render: function() {
        this.model.fetch(
            {
                'success': $.proxy(function() {
                    var context = _.extend({}, helpers, this.model.toJSON());
                    $(this.el).html(this.template(context));

                    // charts
                    _.each(['submitter_mentions', 'text_mentions'], function(submission_type) {
                        if (context.stats[submission_type].count == 0) {
                            return;
                        }

                        var timeline_data = [{
                            'name': 'Submission Timline',
                            'href': '',
                            'timeline': context.stats[submission_type].months
                        }];
                        SpareribCharts.timeline_chart(({'submitter_mentions': 'submission', 'text_mentions': 'mention'})[submission_type] + '-timeline', timeline_data);
                    });
                }, this),
                'error': function() {
                    console.log('failed');
                }
            }
        );
        return this;
    }
})

var ClusterView = Backbone.View.extend({
    tagName: 'div',
    id: 'cluster-view',

    events: {
        'click .cluster-cell-alive': 'handleSwitchCluster',
        'click .cluster-doc-list li': 'handleSwitchDoc',
    },

    template: _.template($('#clusters-tpl').html()),
    render: function() {
        this.$el.html(this.template({'docket_id': this.model.id, 'cutoff': this.model.get('cutoff')}));
        this.renderMap();
        return this;
    },
    renderMap: function() {
        console.log('running');
        this.$el.find('.cluster-map').html("").addClass('loading');

        this.model.fetch({
            'success': $.proxy(function() {
                var data = this.model.toJSON()['cluster_hierarchy'];

                // partition map for the top-level display
                // precompute some stuff
                // - special-case the first row
                var max_depth = 5;

                var computed = [data];
                var start = 0;
                _.each(computed[0], function(item) {
                    item.start = start;
                    item.row = 0;
                    start += item.size;
                })

                // do the rest of the rows
                for (var depth = 0; depth < max_depth - 1; depth++) {
                    computed.push([]);
                    _.each(computed[depth], function(item) {
                        var start = item.start;
                        var children = _.sortBy(item.children, function(child) { return -1 * child.size; });
                        _.each(children, function(child) {
                            child.start = start;
                            child.row = depth + 1;
                            start += child.size;
                            computed[depth + 1].push(child);
                        })
                    })
                }

                console.log(computed);

                // do the drawing
                var width = 960,
                    height = 250;

                var left_padding = 100;

                var width_scale = d3.scale.linear()
                    .domain([0, d3.sum(_.map(data, function(d) { return d.size; }))])
                    .range([0, width - left_padding]);

                var height_scale = d3.scale.linear()
                    .domain([0, max_depth])
                    .range([0, height]);

                var div = d3.select('.cluster-map')
                    .classed('loading', false)
                    .append("div")
                    .classed("cluster-area", true)
                    .style("position", "relative")
                    .style("width", (width - left_padding) + "px")
                    .style("height", height + "px")
                    .style("left", left_padding + "px")

                div.selectAll("div.cluster-row")
                    .data(computed)
                    .enter()
                        .append("div")
                        .classed("cluster-row", true)
                        .attr("data-row", function(d, i) { return i; })
                        .selectAll("div.cluster-cell")
                        .data(function(d, i) { return computed[i]; })
                        .enter()
                            .append("div")
                            .style("position", "absolute")
                            .style("top", function(d) { return height_scale(d.row) + "px"; })
                            .style("left", function(d) { return width_scale(d.start) + "px"; })
                            .style("height", height_scale(1) - 1 + "px")
                            .style("width", function(d) { return width_scale(d.size) - 1 + "px"; })
                            .classed("cluster-cell", true)
                            .classed("cluster-cell-alive", function(d) { return parseInt(d.name) >= 0; })
                            .classed("cluster-cell-dead", function(d) { return parseInt(d.name) < 0; })
                            .attr("data-cluster-id", function(d) { return Math.round(100 * parseFloat(d.cutoff)) + "-" + d.name; })
                            .attr("data-cluster-size", function(d) { console.log("set-size", d); return d.size; })
                            .style("border", "1px solid #ffffff")
                            .on('mouseover', function(d, i) {
                                var tip = $("<div>");
                                tip.addClass("cluster-tip")
                                tip.css({
                                    "top": height_scale(d.row + 1) + "px",
                                    "left": width_scale(d.start) + "px",
                                });
                                tip.html("<strong>" + d.size + " documents</strong> at <strong>" + (100*d.cutoff) + "% similarity</strong>");

                                var $this = $(this);
                                $this.data('tooltip', tip);
                                $this.parents(".cluster-area").append(tip);
                            })
                            .on('mouseout', function() {
                                $(this).data('tooltip').remove();
                            })

                div.selectAll("div.cluster-row-label")
                    .data(computed)
                    .enter()
                        .append("div")
                        .classed("cluster-row-label", true)
                        .text(function(d, i) { return (10 * i) + 50 + "%"; })
                        .style("position", "absolute")
                        .style("width", left_padding + "px")
                        .style("height", height_scale(1) - 1 + "px")
                        .style("top", function(d, i) { return height_scale(i) + 1 + "px"; })
                        .style("left", (-1 * left_padding) + "px");



                var prepopulate = this.model.get('prepopulate');
                if (prepopulate) {
                    var $box = this.$el.find('.cluster-map div[data-cluster-id=' + Math.round(100*prepopulate.cutoff) + "-" + prepopulate.cluster + ']').addClass('cluster-cell-selected')
                    this.switchCluster(prepopulate.cluster, prepopulate.cutoff);
                    this.switchDoc(prepopulate.cluster, prepopulate.document);
                }
            }, this),
            'error': function() {
                console.log('failed');
            }
        });
        return this;
    },

    handleSwitchCluster: function(evt) {
        var $box = $(evt.target).closest('.cluster-cell');
        var clusterData = $box.attr('data-cluster-id').split("-");
        var clusterId = clusterData[1], cutoff = clusterData[0] / 100;

        this.switchCluster(clusterId, cutoff);
        $box.parents('.cluster-map').find('.cluster-cell-selected').removeClass('cluster-cell-selected');
        $box.addClass('cluster-cell-selected');
    },
    switchCluster: function(clusterId, cutoff) {
        if (cutoff != this.model.get('cutoff')) {
            this.model.set('cutoff', cutoff)
            app.navigate(Backbone.history.fragment.replace(/cutoff-[0-9]*/, 'cutoff-' + (100 * cutoff)), {trigger: false});
        }

        this.clusterModel = new Cluster({'cutoff': cutoff, 'docket_id': this.model.id, 'id': clusterId});
        
        var list = $(this.el).find('.cluster-doc-list');
        list.html("").addClass('loading');

        this.clusterModel.fetch({
            'success': $.proxy(function() {
                // TODO: make this a real template with a real view
                var ul = $("<ul data-cluster-id='" + Math.round(100*cutoff) + "-" + clusterId + "'>");
                list.removeClass("loading").append(ul);
                _.each(this.clusterModel.get('documents'), function(item) {
                    ul.append("<li data-document-id='" + item.id + "'><span class='cluster-doc-title'>" + item.title + "</span><span class='cluster-doc-submitter'>" + item.submitter + "</span>");
                });

                var docArea = $(this.el).find('.cluster-doc');
                if (ul.attr('data-cluster-id') == docArea.attr('data-cluster-id')) {
                    // the document area is already showing the right thing, so select the right thing on our side
                    ul.find("li[data-document-id=" + docArea.attr('data-document-id') + "]").addClass("cluster-doc-selected");
                } else if (ul.find("li[data-document-id=" + docArea.attr('data-document-id') + "]").length > 0) {
                    // we're already looking at a document within this cluster, but it needs to be reloaded to get the highlighting right
                    ul.find("li[data-document-id=" + docArea.attr('data-document-id') + "]").eq(0).click();
                } else {
                    // just pick the first one
                    ul.find('li').eq(0).click();
                }
            }, this),
            'error': function() {
                console.log('failed');
            }
        });
    },

    handleSwitchDoc: function(evt) {
        var $box = $(evt.target).closest('li');
        var docId = $box.attr('data-document-id');
        this.switchDoc(this.clusterModel.id, docId);
        $box.parent().find('.cluster-doc-selected').removeClass('cluster-doc-selected');
        $box.addClass('cluster-doc-selected');
    },
    switchDoc: function(clusterId, docId) {
        // update the model and URL
        this.model.set('docId', docId);
        app.navigate('/docket/' + this.model.id + '/similarity/cutoff-' + (100 * this.model.get('cutoff')) + '/document-' + docId, {
            trigger: false,
            // if we're not already viewing a document, don't create a new history entry since this is automatic
            replace: Backbone.history.fragment.indexOf("/document-") == -1
        })

        this.documentModel = new ClusterDocument({'cutoff': this.model.get('cutoff'), 'docket_id': this.model.id, 'cluster_id': clusterId, 'id': docId});

        var docArea = $(this.el).find('.cluster-doc');
        docArea.html("").addClass("loading");
        docArea.attr('data-cluster-id', Math.round(100*this.model.get('cutoff')) + "-" + clusterId);
        docArea.attr('data-document-id', docId);

        this.documentModel.fetch({
            'success': $.proxy(function() {
                var contents = $("<div class='cluster-doc-contents'>");
                var pre = $("<pre>");
                contents.append(pre);
                docArea.removeClass("loading").append(contents);
                pre.html(this.documentModel.get('frequency_html'));

                var graph = $("<div class='cluster-doc-graph'>");
                docArea.append(graph);

                // some d3 stuff to draw a graph at the bottom
                var sizes = this.documentModel.get('cluster_sizes');
                var x = d3.scale.linear().domain([0.5, 0.95]).range([0, graph.width()]);

                var height = graph.height();
                var y = d3.scale.linear().domain([0, d3.max(_.map(sizes, function(x) { return x.size; }))]).range([height - 3, 3])
                window.y = y;

                var chart = d3.selectAll(graph).append("svg")
                    .classed("chart-canvas", true)
                    .attr("width", "100%")
                    .attr("height", "100%");

                var line = d3.svg.line()
                    .x(function(d,i) { return x(d.cutoff); })
                    .y(function(d,i) { return y(d.size); })
                    .interpolate("monotone");
                
                chart.append('path')
                    .classed('graph-line', true)
                    .attr('d', line(sizes.slice(0,sizes.length).reverse()))
                    .style('stroke-width', '3')
                    .style('stroke', "#0a6e92")
                    .style('fill-opacity', 0);

                var cut = x(parseFloat(this.model.get('cutoff')));
                chart.append('line')
                    .classed('graph-line', true)
                    .attr('x1', cut)
                    .attr('x2', cut)
                    .attr('y1', 0)
                    .attr('y2', height)
                    .style('stroke-width', '3')
                    .style('stroke', "#990000")
                    .style('fill-opacity', 0);
            }, this),
            'error': function() {
                console.log('failed');
            }
        });
    }
})

// Router
var AppRouter = Backbone.Router.extend({   
    initialize: function() {
        // routes

        // resource pages
        this.route("document/:id", "documentDetail");
        this.route("docket/:id", "docketDetail");
        this.route("agency/:id", "agencyDetail");
        this.route(/^(organization|individual|politician|entity)\/([a-zA-Z0-9-]*)\/([a-z0-9-]*)$/, "entityDetail");
        
        // search
        this.route("", "searchLanding");
        this.route("search/:term/:page", "defaultSearchResults");
        this.route("search/:term", "defaultSearchResults");
        this.route("search-:type/:term/:page", "searchResults");
        this.route("search-:type/:term", "searchResults");

        // clusters
        this.route("docket/:id/similarity", "docketClusters");
        this.route("docket/:id/similarity/cutoff-:cutoff", "docketClusters");
        this.route("docket/:id/similarity/cutoff-:cutoff/document-:docId", "docketClusters");

        // load the upper search box at the beginning
        var topSearchView = new SearchView({'id': 'top-search-form'});
        $('#top-search').html(topSearchView.render().el);

        // on all navigation, check to show/hide the search box
        this.on('all', function () {
            if ($('#main .search-view').length != 0) {
                $('#top-search').hide();
            } else {
                $('#top-search').show().find('input[type=text]').val('');
            }
        });
    },

    searchLanding: function() {
        var searchView = new SearchView({'id': 'main-search-form'});
        $('#main').html(searchView.render().el);
    },

    defaultSearchResults: function(query, page) {
        this.searchResults(null, query, page);
    },
    searchResults: function(type, query, page) {
        // are we on a search page?
        var resultSet = $('#main .result-set');
        if (resultSet.length == 0) {
            this.searchLanding();
            resultSet = $('#main .result-set');
        }

        if (typeof page == "undefined") {
            page = null;
        }

        var results = new SearchResults({'query': query, 'in_page': page, 'level': type});
        var resultsView = new ResultsView({model: results});

        resultSet.html(resultsView.render().el);
    },
 
    documentDetail: function(id) {
        var doc = new Document({'id': id});
        var view = new DocumentDetailView({model: doc});
        $('#main').html(view.render().el);
    },

    docketDetail: function(id) {
        var docket = new Docket({'id': id});
        var view = new AggregatedDetailView({model: docket});
        $('#main').html(view.render().el);
    },

    agencyDetail: function(id) {
        var agency = new Agency({'id': id});
        var view = new AggregatedDetailView({model: agency});
        $('#main').html(view.render().el);
    },

    entityDetail: function(type, slug, id) {
        var entity = new Entity({'id': id, 'slug': slug});
        var entityView = new EntityDetailView({model: entity});
        $('#main').html(entityView.render().el);
    },

    docketClusters: function(id, cutoff, docId) {
        var floatCutoff;
        if (typeof cutoff === "undefined") {
            floatCutoff = cutoff;
        } else {
            floatCutoff = parseFloat(cutoff) / 100;
        }
        var clusters = new DocketClusters({'id': id, 'cutoff': floatCutoff, 'docId': typeof docId === "undefined" ? null: docId});
        var clusterView = new ClusterView({model: clusters});
        $('#main').html(clusterView.render().el);
    }
});
 
var app = new AppRouter();
window.app = app;

Backbone.history.start({pushState: true});

/* assume backbone link handling, from Tim Branyen */
$(document).on("click", "a:not([data-bypass])", function(evt) {
    var href = $(this).attr("href");
    var protocol = this.protocol + "//";

    if (href && href.slice(0, protocol.length) !== protocol &&
        href.indexOf("javascript:") !== 0) {
        evt.preventDefault();
        Backbone.history.navigate(href, true);
    }
});



})(jQuery);