(function($) {
// General models
var Document = Backbone.Model.extend({ url: function() { return "/api/1.0/document/" + this.id; } });
var Docket = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.id; } });
var Agency = Backbone.Model.extend({ url: function() { return "/api/1.0/agency/" + this.id; } });
var Entity = Backbone.Model.extend({ url: function() { return "/api/1.0/entity/" + this.id; } });
var SearchResults = Backbone.Model.extend({ idAttribute: "query", url: function() { return "/api/1.0/search/" + (this.get('level') ? this.get('level') + '/' : '') + encodeURIComponent(this.id) + (this.get('in_page') ? "?page=" + this.get('in_page') : ''); } });

// Cluster models
var DocketClusters = Backbone.Model.extend({
    max_depth: 5,
    flatten: function() {
        var data = this.toJSON()['cluster_hierarchy'];

        var computed = [data];
        _.each(computed[0], function(item) {
            item.row = 0;
            item.parent = null;
        })

        // do the rest of the rows
        for (var depth = 0; depth < this.max_depth - 1; depth++) {
            computed.push([]);
            _.each(computed[depth], function(item) {
                var children = _.sortBy(item.children, function(child) { return -1 * child.size; });
                _.each(children, function(child) {
                    child.row = depth + 1;
                    child.parent = item;
                    computed[depth + 1].push(child);
                })
            })
        }
        
        return computed;
    },
    
    url: function() {
        var preselect = this.get('docId');
        var cutoff = this.get('cutoff');
        var require_summaries = this.get('require_summaries')
        var qs = [];
        if (cutoff) qs.push("cutoff=" + cutoff);
        if (preselect) qs.push("prepopulate_document=" + preselect);
        if (require_summaries) qs.push("require_summaries=true");
        return "/api/1.0/docket/" + this.id + "/hierarchy?" + qs.join("&");
    }
});
var Cluster = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.get('docket_id') + "/cluster/" + this.id + "?cutoff=" + this.get('cutoff'); } });
var ClusterDocument = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.get('docket_id') + "/cluster/" + this.get('cluster_id') + "/document/" + this.id + "?cutoff=" + this.get('cutoff'); } });
var ClusterChain = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.get('docket_id') + "/clusters_for_document/" + this.id; } });

var ClusterDocketTeaser = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.id + "/hierarchy_teaser"; } });
var ClusterDocumentTeaser = Backbone.Model.extend({ url: function() { return "/api/1.0/document/" + this.id + "/hierarchy_teaser"; } });

// Template helpers
var helpers = {
    'formatDate': function(iso_date) {
        var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        var date = new Date(iso_date);
        return (months[date.getUTCMonth()] + " " + date.getUTCDate() + ", " + date.getUTCFullYear());
    },
    'shortFormatDate': function(iso_date) {
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
    },
    'pluralize': function(count, singular, plural) {
        if (typeof plural === "undefined") {
            plural = singular + "s";
        }
        return count == 1 ? singular : plural;
    }
}

// Utility functions
var pad2 = function(number) {
   return (number < 10 ? '0' : '') + number;
}

var expandWeeks = function(weeks) {
    var out = [];
    var current = null;
    for (var i = 0; i < weeks.length - 1; i++) {
        out.push(weeks[i]);
        
        current = new Date(weeks[i]['date_range'][1]);
        current.setDate(current.getDate() + 1);

        next = new Date(weeks[i + 1]['date_range'][0]);

        while (current < next) {
            var end = new Date(current);
            end.setDate(end.getDate() + 6);
            var new_week = _.map([current, end], function(d) { return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) });
            out.push({
                'date_range': new_week,
                'count': 0
            });

            current = end;
            current.setDate(current.getDate() + 1);
        }
    }
    out.push(weeks[weeks.length - 1]);

    return out;
}

var expandMonths = function(months) {
    var out = [];
    var current = null;
    for (var i = 0; i < months.length - 1; i++) {
        out.push(months[i]);
        
        current = new Date(months[i]['date_range'][1]);
        current.setDate(current.getDate() + 1);

        next = new Date(months[i + 1]['date_range'][0]);

        while (current < next) {
            var end = new Date(current.getUTCFullYear(), current.getUTCMonth() + 1, 0);
            var new_month = _.map([current, end], function(d) { return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) });
            out.push({
                'date_range': new_month,
                'count': 0
            });

            current = end;
            current.setDate(current.getDate() + 1);
        }
    }
    out.push(months[months.length - 1]);

    return out;
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
        this.$el.html(this.template(this));
        this.$el.find("input[type=text]").intertag({
            source: function(request, response) {
                if (request.term.length == 0) {
                    response([]);
                } else {
                    $.getJSON(AC_URL + request.term, function(data) {
                        response(data.matches);
                    });
                }
            }
        });
        return this;
    },

    search: function(evt) {
        evt.preventDefault();
        this.$el.find('input[type=text]').blur();
        app.navigate('/search/' + encodeURIComponent(this.get_encoded_search()), {trigger: true});
        return false;
    },

    get_encoded_search: function() {
        var val = this.$el.find('.ui-intertag').val();
        var terms = [];

        _.each(val.tags, function(tag) {
            terms.push([tag.type, tag.value, JSON.stringify(tag.label)].join(":"));
        })
        terms.push(val.text);

        return terms.join(" ");
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
                    this.$el.closest('.search-view').find('form .ui-intertag').val({'tags': context.search.filters, 'text': context.search.text_query});
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
    teaserTemplate: _.template($('#docket-teaser-tpl').html()),

    render: function() {
        var mainFetch = this.model.fetch(
            {
                'success': $.proxy(function() {
                    var jsonModel = this.model.toJSON();

                    var context = _.extend({'submission_count': jsonModel.stats.type_breakdown.public_submission}, helpers, jsonModel);
                    $(this.el).html(this.template(context));

                    // charts
                    var type = this.model.get('type');
                    var timeline_data = [{
                        'name': 'Submission Timline',
                        'href': '',
                        'timeline': type == "docket" ? expandWeeks(context.stats.weeks) : expandMonths(context.stats.months),
                        'overlays': []
                    }];

                    if (type == "docket") {
                        _.each(context.stats.doc_info.fr_docs, function(doc) {
                            timeline_data[0].overlays.push({
                                'name': doc.title,
                                'date_range': doc.comment_date_range ? doc.comment_date_range : [doc.date, null],
                                'type': doc.type
                            });
                        });
                    }
                    SpareribCharts.timeline_chart('submission-timeline', timeline_data);

                    var sb_chart = this.$el.find('.submitter-breakdown');
                    var tagged_total = 0;
                    var top_submitters = $('.top-submitters .submitter');
                    if (top_submitters.length == 0) {
                        sb_chart.replaceWith("<div class='notice'>This docket doesn't include any comments from recognized submitters.</div>")
                    } else {
                        top_submitters.each(function(idx, item) {
                            tagged_total += parseInt($(item).attr('data-submission-count'));
                        })
                        var sb_scaler = d3.scale.linear()
                            .domain([0, tagged_total])
                            .range([0, 240]);
                        top_submitters.each(function(idx, item) {
                            var $item = $(item);
                            var $square = $("<div>");
                            $square.attr('class', $item.find('.submitter-square').attr('class').replace('submitter-square', ''));
                            $square.css({position: 'absolute', top: 0, height: '35px', width: sb_scaler(parseInt($item.attr('data-submission-count'))) - 1 + 'px', left: sb_scaler(parseInt($item.attr('data-previous-submissions'))) + 'px'});
                            sb_chart.append($square);
                        });
                    }
                }, this),
                'error': function() {
                    console.log('failed');
                }
            }
        );
        
        if (this.model instanceof Docket) {
            this.teaserModel = new ClusterDocketTeaser({id: this.model.id});
            var teaserFetch = this.teaserModel.fetch();
            mainFetch.done($.proxy(function() {
                var div = null;
                var model = this.teaserModel;
                var template = this.teaserTemplate;

                var animateHeight = function() {
                    div.height(div.height());
                    div.removeClass('loading');

                    div.animate({'height': div.find('.similarity-data').outerHeight(true)}, 'fast', function() { div.css({'height': 'auto'}) });
                }

                teaserFetch.done(function() {
                    var teaser = template(_.extend({}, helpers, model.toJSON()));
                    div = $('.similarity-teaser').html(teaser);
                    animateHeight();
                }).fail(function() {
                    div = $('.similarity-teaser').html("<div class='similarity-data similarity-description'>Similarity data is not yet available for this docket.</div>");
                    animateHeight();
                })
            }, this));
        }
        
        return this;
    }
})

var DocumentDetailView = Backbone.View.extend({
    tagName: 'div',
    id: 'document-view',

    events: {
        'change .type-selection select': 'switchType',
        'click .attachment-name': 'toggleAttachment'
    },

    template: _.template($('#document-tpl').html()),
    teaserTemplate: _.template($('#document-teaser-tpl').html()),

    render: function() {
        var mainFetch = this.model.fetch(
            {
                'success': $.proxy(function() {
                    var context = _.extend({}, helpers, this.model.toJSON());

                    // tweak attachments a bit
                    context['full_attachments'] = [{'title': 'Main Text', 'attachment': false, 'views': context['views']}].concat(_.map(context['attachments'], function(attachment) {
                        attachment['attachment'] = true;
                        return attachment;
                    }));
                    $(this.el).html(this.template(context));

                    // make the first attachment visible
                    $(this.el).find('.attachment-name').eq(0).click()

                    $('.sidebar-item.collapsible h4').click(function() {
                        $(this).parents(".sidebar-item").toggleClass("active").find(".summary-table-wrapper").slideToggle('fast');
                    }).prepend("<a class='toggle'>Toggle</a>");
                }, this),
                'error': function() {
                    console.log('failed');
                }
            }
        );

        this.teaserModel = new ClusterDocumentTeaser({id: this.model.id});
        var teaserFetch = this.teaserModel.fetch();
        mainFetch.done($.proxy(function() {
            var div = null;
            var model = this.teaserModel;
            var mainModel = this.model;
            var template = this.teaserTemplate;

            var animateHeight = function() {
                div.height(div.height());
                div.removeClass('loading');

                div.animate({'height': div.find('.similarity-data').outerHeight(true)}, 'fast', function() { div.css({'height': 'auto'}) });
            }

            teaserFetch.done(function() {
                div = $('.similarity-teaser');
                if (!div.length) return;

                var teaser = template(_.extend({'docket_id': mainModel.get('docket').id}, helpers, model.toJSON()));
                div.html(teaser);
                animateHeight();
            }).fail(function() {
                div = $('.similarity-teaser');
                if (!div.length) return;

                div.html("<div class='similarity-data similarity-description'>Similarity data is not yet available for this document.</div>");
                animateHeight();
            })
        }, this));

        return this;
    },

    switchType: function(evt) {
        var $type = $(evt.target);
        var $this = $(this.el);
        var $area = $type.closest('.type-area');

        var view = $area.find('.type-view').hide().filter('[data-type-id=' + $type.val() + ']').show();
        var iframe = view.find('iframe');
        if (!iframe.attr('src')) {
            iframe.attr('src', iframe.attr('data-src'));
        }
        $area.find('.type-selection a').attr('href', view.attr('data-source-file'));
    },

    toggleAttachment: function(evt) {
        var $name = $(evt.target).closest('.attachment-name');
        var $attachment = $name.closest('.attachment');
        var $area = $attachment.find('.type-area');
        if (!$name.hasClass('active')) {
            // first make sure something is visible in the hidden area
            var types = $area.find('.type-selection select');
            if ($area.find('.type-view:visible').length == 0) {
                types.val(types.find('option').eq(0).attr('value'));
                this.switchType({'target': types})
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

                        var timeline_data = _.map(context.stats[submission_type].top_agencies.slice(0, 3), function(agency) {
                            return {
                                'name': agency.name,
                                'href': '',
                                'timeline': expandMonths(agency.months)
                            }
                        });
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
        this.$el.find('.cluster-map').html("").addClass('loading');

        this.model.fetch({
            'success': $.proxy(function() {
                var computed = this.model.flatten();

                var start = 0;
                _.each(computed[0], function(item) {
                    item.start = start;
                    start += item.size;
                })

                // do the rest of the rows
                for (var depth = 0; depth < this.model.max_depth - 1; depth++) {
                    _.each(computed[depth], function(item) {
                        var children = _.sortBy(item.children, function(child) { return -1 * child.size; });
                        var child_total = d3.sum(_.map(children, function(d) { return d.size; }));

                        // start used to start at the parent's start, but is now adjusted to center the trees
                        var start = item.start + ((item.size - child_total) / 2);
                        _.each(children, function(child) {
                            child.start = start;
                            start += child.size;
                        })
                    })
                }           
            
                // do the drawing
                var width = 960,
                    height = 250;

                var left_padding = 60;

                var width_scale = d3.scale.linear()
                    .domain([0, d3.sum(_.map(computed[0], function(d) { return d.size; }))])
                    .range([0, width - left_padding]);

                var height_scale = d3.scale.linear()
                    .domain([0, this.model.max_depth])
                    .range([0, height]);

                var gradient_scale = d3.scale.linear()
                    .domain([0, this.model.max_depth - 1])
                    .range([0, 1]);

                var map = $('.cluster-map').css({'position': 'relative'});
                this.svg = d3.select(map.get(0))
                    .classed('loading', false)
                    .append("svg")
                    .classed("cluster-area", true)
                    .style("width", (width) + "px")
                    .style("height", height + "px");

                this.chart = this.svg
                    .append("g")
                    .attr("transform", "translate(" + left_padding + ",0)");

                var divisions = this.chart.append("g");
                var connections = this.chart.append("g");
                this.connections = connections;

                this.chart.selectAll(".cluster-row")
                    .data(computed)
                    .enter()
                        .append("g")
                        .classed("cluster-row", true)
                        .attr("data-row", function(d, i) { return i; })
                        .each(function(d, i) {
                            divisions.append("rect")
                                    .attr('x', -1 * left_padding)
                                    .attr('y', height_scale(i))
                                    .attr('width', width)
                                    .attr('height', height_scale(1))
                                    .attr('fill', '#777777')
                                    .style('opacity', gradient_scale(i));
                        })
                        .selectAll(".cluster-cell")
                        .data(function(d, i) { return computed[i]; })
                        .enter()
                            .append("rect")
                            .attr("y", function(d) { return height_scale(d.row) + 4; })
                            .attr("x", function(d) { return width_scale(d.start) + 2; })
                            .attr("height", height_scale(1) - 9)
                            .attr("width", function(d) { return width_scale(d.size) - 5; })
                            .attr("rx", 5)
                            .attr("ry", 5)
                            .classed("cluster-cell", true)
                            .classed("cluster-cell-alive", function(d) { return parseInt(d.name) >= 0; })
                            .classed("cluster-cell-dead", function(d) { return parseInt(d.name) < 0; })
                            .attr("data-cluster-id", function(d) { return Math.round(100 * parseFloat(d.cutoff)) + "-" + d.name; })
                            .attr("data-cluster-size", function(d) { return d.size; })
                            .on('mouseover', function(d, i) {
                                var tip = $("<div>");
                                tip.addClass("cluster-tip")
                                tip.css({
                                    "top": height_scale(d.row + 1) - 6 + "px",
                                    "left": width_scale(d.start) + left_padding + 6 + "px",
                                });
                                if (d.phrases) {
                                    tip.html("<strong>" + d.size + " documents.</strong><p>Distinguishing phrases:</p><ul><li>" + d.phrases.join("</li><li>") + "</li><ul>");
                                } else {
                                    tip.html("<strong>" + d.size + " documents.</strong><p>Distinguishing phrases:</p>").addClass("loading")
                                }
                                var $this = $(this);
                                $this.data('tooltip', tip);
                                map.append(tip);
                            })
                            .on('mouseout', function() {
                                $(this).data('tooltip').remove();
                            })
                            .each(function(d, i) {
                                if (d.parent) {
                                    connections.append("line")
                                        .attr('x1', width_scale(d.start + (d.size / 2)))
                                        .attr('y1', height_scale(d.row + .5))
                                        .attr('x2', width_scale(d.parent.start + (d.parent.size / 2)))
                                        .attr('y2', height_scale(d.row - .5))
                                        .classed('cluster-connection', true)
                                        .attr('data-cluster-id', d3.select(this).attr('data-cluster-id'));
                                }
                            })

                d3.select(map.get(0)).selectAll("div.cluster-row-label")
                    .data(computed)
                    .enter()
                        .append("div")
                        .classed("cluster-row-label", true)
                        .text(function(d, i) { return (10 * i) + 50 + "%"; })
                        .style("position", "absolute")
                        .style("width", left_padding  - 1 + "px")
                        .style("height", height_scale(1) + "px")
                        .style("top", function(d, i) { return height_scale(i) + "px"; });



                var prepopulate = this.model.get('prepopulate');
                if (prepopulate) {
                    var $box = d3.select($(this.chart[0]).find('rect[data-cluster-id=' + Math.round(100*prepopulate.cutoff) + "-" + prepopulate.cluster + ']').get(0)).classed('cluster-cell-selected', true);
                    this.switchCluster(prepopulate.cluster, prepopulate.cutoff);
                    this.switchDoc(prepopulate.cluster, prepopulate.document);
                }

                var stats = this.model.get('stats');
                this.$el.find('.cluster-label').html(Math.round(100 * stats.clustered / (stats.clustered + stats.unclustered))  + "% of the documents in this docket are represented above; the rest are unique")
            
                // re-fetch the data, this time with summaries
                // when cluster cell's mouseover callback is next called, data will be there
                this.model.set("require_summaries", true);
                if (! computed[0][0].phrases) {
                    this.model.fetch({
                        'success': $.proxy(function() {
                            computed = this.model.flatten();
                            d3.selectAll('.cluster-row')
                                .each(function(row, i) {
                                    d3.select(this).selectAll('.cluster-cell')
                                        .each(function(cell, j) {
                                            d3.select(this).datum().phrases = computed[i][j].phrases;
                                        })
                                });
                        }, this)
                    });
                }
            
            }, this),
            'error': function() {
                console.log('DocketClusters.fetch() failed');
            }
        });

        return this;
    },

    handleSwitchCluster: function(evt) {
        var $box = $(evt.target).closest('.cluster-cell');
        var dbox = d3.select($box.get(0));
        var clusterData = $box.attr('data-cluster-id').split("-");
        var clusterId = clusterData[1], cutoff = clusterData[0] / 100;

        this.switchCluster(clusterId, cutoff, dbox.classed('cluster-cell-chain'));
        d3.select($box.parents('.cluster-map').get(0)).selectAll('.cluster-cell-selected').classed('cluster-cell-selected', false);
        dbox.classed('cluster-cell-selected', true);
    },
    switchCluster: function(clusterId, cutoff, inChain) {
        if (cutoff != this.model.get('cutoff')) {
            this.model.set('cutoff', cutoff)
            app.navigate(Backbone.history.fragment.replace(/cutoff-[0-9]*/, 'cutoff-' + (100 * cutoff)), {trigger: false});
        }

        this.clusterModel = new Cluster({'cutoff': cutoff, 'docket_id': this.model.id, 'id': clusterId});
        
        var list = $(this.el).find('.cluster-doc-list');
        list.html("").addClass('loading');

        var docArea = $(this.el).find('.cluster-doc');
        this.clusterModel.fetch({
            'success': $.proxy(function() {
                // TODO: make this a real template with a real view
                var ul = $("<ul data-cluster-id='" + Math.round(100*cutoff) + "-" + clusterId + "'>");
                list.removeClass("loading").append(ul);
                _.each(this.clusterModel.get('documents'), function(item) {
                    ul.append("<li data-document-id='" + item.id + "'><span class='cluster-doc-title'>" + item.title + "</span><span class='cluster-doc-submitter'>" + item.submitter + "</span>");
                });

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
        
        if (typeof inChain !== "undefined" && inChain) {
            // the new cluster that's been selected appears to be in the same chain as the current cluster, so we can preemptively reload the current document
            this.switchDoc(this.clusterModel.id, docArea.attr('data-document-id'), true);
        }
    },

    handleSwitchDoc: function(evt) {
        var $box = $(evt.target).closest('li');
        var docId = $box.attr('data-document-id');
        this.switchDoc(this.clusterModel.id, docId);
        $box.parent().find('.cluster-doc-selected').removeClass('cluster-doc-selected');
        $box.addClass('cluster-doc-selected');
    },
    switchDoc: function(clusterId, docId, pseudoLoad) {
        // update the model and URL
        this.model.set('docId', docId);
        app.navigate('/docket/' + this.model.id + '/similarity/cutoff-' + (100 * this.model.get('cutoff')) + '/document-' + docId, {
            trigger: false,
            // if we're not already viewing a document, don't create a new history entry since this is automatic
            replace: Backbone.history.fragment.indexOf("/document-") == -1
        })

        var docArea = $(this.el).find('.cluster-doc');

        if (typeof pseudoLoad !== "undefined" && pseudoLoad) {
            docArea.addClass('pseudo-loading');
        } else {
            docArea.html("").addClass("loading");
        }
        

        docArea.attr('data-cluster-id', Math.round(100*this.model.get('cutoff')) + "-" + clusterId);
        
        var oldDocId = docArea.attr('data-document-id');
        docArea.attr('data-document-id', docId);

        this.documentModel = new ClusterDocument({'cutoff': this.model.get('cutoff'), 'docket_id': this.model.id, 'cluster_id': clusterId, 'id': docId});
        this.documentModel.fetch({
            'success': $.proxy(function() {
                var contents = $("<div class='cluster-doc-contents'>");
                var pre = $("<pre>");
                contents.append(pre);
                var children = docArea.children();
                docArea.removeClass("loading").removeClass("pseudo-loading").append(contents);
                if (children.length) {
                    children.remove();
                }
                pre.html(this.documentModel.get('frequency_html'));
            }, this),
            'error': function() {
                console.log('failed');
            }
        });
        
        if (docId != oldDocId) {
            this.chainModel = new ClusterChain({'docket_id': this.model.id, 'id': docId});
            this.chainModel.fetch({
                'success': $.proxy(function() {
                    var sizes = this.chainModel.get('clusters');

                    // additionally, we'll highlight the relevant clusters in the top view 
                    d3.selectAll($(this.chart[0]).find('.cluster-cell.cluster-cell-chain').toArray()).classed('cluster-cell-chain', false);
                    this.connections.selectAll('.cluster-connection-chain').classed('cluster-connection-chain', false);
                    _.each(sizes, $.proxy(function(item) {
                        var filter = '[data-cluster-id=' + Math.round(100 * item.cutoff) + '-' + item.id +']';
                        d3.select($(this.chart[0]).find('.cluster-cell' + filter).get(0)).classed('cluster-cell-chain', true);
                        d3.select($(this.chart[0]).find('.cluster-connection' + filter).get(0)).classed('cluster-connection-chain', true);
                    }, this));
                }, this),
                'error': function() {
                    console.log('failed');
                }
            });
        }
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
                $('#top-search').show().find('input[type=text]').val('')
                    .end().find('.ui-intertag').trigger('tagschanged');
            }
        });
    },

    searchLanding: function() {
        var searchView = new SearchView({'id': 'main-search-form'});
        $('#main').html(searchView.render().el);
        $('.main-content .search .ui-intertag').trigger('tagschanged');
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
        window.clusters = clusters;
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