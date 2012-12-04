(function($) {
// General models
var Document = Backbone.Model.extend({ url: function() { return "/api/1.0/document/" + this.id; } });
var Docket = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.id; } });
var Agency = Backbone.Model.extend({ url: function() { return "/api/1.0/agency/" + this.id; } });
var Entity = Backbone.Model.extend({ url: function() { return "/api/1.0/entity/" + this.id; } });
var SearchResults = Backbone.Model.extend({ idAttribute: "query", url: function() {
    var qs = _.filter([
        (this.get('in_page') ? "page=" + this.get('in_page') : null),
        (this.get('limit') ? "limit=" + this.get('limit') : null)
    ], function(x) { return x; }).join("&");
    return "/api/1.0/search/" + (this.get('level') ? this.get('level') + '/' : '') + encodeURIComponent(this.id) + (qs ? "?" + qs : '');
} });

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
var ClusterDocument = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.get('docket_id') + "/cluster/" + this.get('cluster_id') + "/document/" + this.id + "?cutoff=" + (this.get('cutoff') ? this.get('cutoff') : "0.5"); } });
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
    },
    'slugify': function(value) {
        var stripped = $.trim(value.replace(/[^\w\s-]/g, '')).toLowerCase();
        return stripped.replace(/[-\s]+/g, '-');
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
var HomeView = Backbone.View.extend({
    tagName: 'div',
    id: 'home-view',

    template: _.template($('#home-tpl').html()),
    render: function() {
        this.$el.html(this.template({}));
        return this;
    }
});

var StaticView = Backbone.View.extend({
    tagName: 'div',

    render: function() {
        $.get('/static/content/' + this.id + '.mt.html').done($.proxy(function(content) {
            var template = _.template(content);
            this.$el.html(template({}));            
        }, this));
        return this;
    }
});

var SearchView = Backbone.View.extend({
    tagName: 'div',
    className: 'search-view',

    events: {
        'submit form': 'search',
        'click .ui-icon-plus': 'add_keyword'
    },

    intertag: function() {
        var options = {
            source: function(request, response) {
                if (request.term.length == 0) {
                    response([]);
                } else {
                    $.getJSON(AC_URL + request.term, function(data) {
                        response(data.matches);
                    });
                }
            }
        }

        if (this.options.filters == "complex") {
            var view = this;
            $.extend(options, {
                'addTag': function(item, fromClick) {
                    var new_tag = $('<span class="search-tag"><span class="ui-label"></span><span class="ui-icon ui-icon-close"></span></span>');
                    new_tag.find('.ui-label').html(item.label);
                    new_tag.data('value', item.value);
                    new_tag.addClass('ui-tag-type-' + item.type);

                    var area = $('.sidebar .search-type-' + item.type);
                    new_tag.appendTo(area);

                    var box = area.closest('.sidebar-item');
                    if (box.is(":hidden")) {
                        box.slideDown("fast");
                    }

                    if (fromClick) {
                        view.search();
                    }
                },
                'getTags': function() {
                    return $('.sidebar .search-type').find('.search-tag');
                },
                'clearTags': function() {
                    $('.sidebar .search-type').find('.search-tag').remove();
                },
                'setText': function(text) {
                    $('.sidebar .search-type-keyword').find('.search-tag').remove();
                    if (text) {
                        options.addTag({type: 'keyword', label: text, value: text});
                    }
                },
                'getText': function() {
                    var out = [];
                    $('.sidebar .search-type-keyword').find('.search-tag').each(function() {
                        out.push($(this).data('value'));
                    })
                    return out.join(" ");
                },
                'source': function(request, response) {
                    var filterType = $(this.element[0]).closest('.search-filter').data('filter-type');
                    if (request.term.length == 0 || filterType == "keyword") {
                        response([]);
                    } else {
                        var tf = {'agency': 'a', 'submitter': 'o'};
                        $.getJSON(AC_URL + request.term + "&type=" + tf[filterType], function(data) {
                            response(data.matches);
                        });
                    }
                }
            });
        }
        this.$el.find("input[type=text]").intertag(options);
        return this;
    },

    search: function(evt) {
        if (evt) evt.preventDefault();
        this.$el.find('input[type=text]').blur();
        app.navigate('/search' + (this.options.type ? "-" + this.options.type : "") + '/' + encodeURIComponent(this.get_encoded_search()), {trigger: true});
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
    },

    add_keyword: function(evt) {
        var itg = this.$el.find('.ui-intertag');
        var input = itg.find('input[type=text]');
        var val = input.val();
        if (val) {
            itg.data('intertagOptions').addTag({
                type: 'keyword',
                label: val,
                value: val
            }, true);
            input.val("");
        }
    }
})

var ResultsView = Backbone.View.extend({
    tagName: 'div',
    id: 'results-view',
    className: 'search-view',

    events: {
        'click .sidebar .search-tag .ui-icon-close': 'removeTag'
    },

    templates: {
        'shallow': _.template($('#shallow-working-results-tpl').html()),
        'deep': _.template($('#deep-working-results-tpl').html()),
        'complete': _.template($('#results-tpl').html())
    },
    render: function() {
        var $el = this.$el.html(this.templates['deep'](_.extend({'depth': this.options.depth, 'level': this.options.models[0].model.get('level')}, helpers)));
        var search_populated = false;
        _.each(this.options.models, $.proxy(function(_model) {
            var model = _model.model;
            model.fetch(
                {
                    'success': $.proxy(function() {
                        var context = _.extend({'depth': this.options.depth}, helpers, model.toJSON());
                        $el.find('.search-results-' + model.get('level')).html(this.templates.complete(context)).slideDown("fast");
                        $el.find('.search-results-loading-' + model.get('level')).slideUp("fast");

                        // populate the search input if necessary
                        if (!search_populated) {
                            $('.main-content .search form .ui-intertag').eq(0).val({'tags': context.search.filters, 'text': context.search.text_query});

                            if (context.search.filters.length && this.options.depth == "shallow") {
                                this.$el.find('.filter-results:hidden').slideDown('fast');
                                entity_context = _.extend({'depth': this.options.depth}, helpers, {
                                    'total': context.search.filters.length,
                                    'search': {
                                        'search_type': 'entity-agency',
                                        'raw_query': ''
                                    },
                                    'results': _.map(context.search.filters, function(filter) {
                                        return {
                                            "_id": filter.value,
                                            "_type": filter.type == 'submitter' ? 'organization' : 'agency', 
                                            "fields": {
                                                "name": filter.label
                                            }, 
                                            "url": "http://regulations.sunlightlabs.com/api/1.0/" + filter.type + "/" + filter.value
                                        };
                                    })
                                });
                                $el.find('.search-results-entity-agency').html(this.templates.complete(entity_context)).slideDown("fast");
                                $el.find('.search-results-loading-entity-agency').slideUp("fast");
                            } else {
                                this.$el.find('.filter-results:visible').slideUp('fast');
                            }

                            search_populated = true;
                        }
                    }, this),
                    'error': function() {
                        console.log('failed');
                    }
                }
            );
        }, this));
        return this;
    },

    removeTag: function(evt) {
        var tag = $(evt.target).closest('.search-tag');
        var container = tag.closest('.search-tags');
        tag.remove();
        if (container.children().length == 0 && container.closest('.search-filter').hasClass('search-filter-magic')) {
            container.closest('.sidebar-item').slideUp("fast");
        }

        container.closest('.search-filter').find('form').trigger('submit');
    }
})

var AggregatedDetailView = Backbone.View.extend({
    tagName: 'div',
    id: 'docket-view',

    template: _.template($('#aggregated-tpl').html()),
    teaserTemplate: _.template($('#docket-teaser-tpl').html()),

    render: function() {
        $(".main-loading").slideDown('fast');
        var mainFetch = this.model.fetch(
            {
                'success': $.proxy(function() {
                    var jsonModel = this.model.toJSON();

                    var context = _.extend({'submission_count': jsonModel.stats.type_breakdown.public_submission}, helpers, jsonModel);
                    $(this.el).css('display', 'none').html(this.template(context));

                    // charts
                    var type = this.model.get('type');
                    var timeline_data = [{
                        'name': 'Submissions',
                        'href': '',
                        'timeline': type == "docket" ? expandWeeks(context.stats.weeks) : expandMonths(context.stats.months),
                        'overlays': []
                    }];

                    if (type == "docket") {
                        _.each(context.stats.doc_info.fr_docs, function(doc) {
                            timeline_data[0].overlays.push({
                                'name': doc.title,
                                'date_range': doc.comment_date_range ? doc.comment_date_range : [doc.date, null],
                                'type': doc.type,
                                'type_label': ({'notice': 'Notices', 'proposed_rule': 'Proposed Rules', 'rule': 'Rules'})[doc.type]
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

                    $('.main-loading').slideUp('fast');
                    this.$el.slideDown('fast');
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
        $(".main-loading").slideDown('fast');
        var mainFetch = this.model.fetch(
            {
                'success': $.proxy(function() {
                    var context = _.extend({}, helpers, this.model.toJSON());

                    // tweak attachments a bit
                    context['full_attachments'] = [{'title': 'Main Text', 'attachment': false, 'views': context['views']}].concat(_.map(context['attachments'], function(attachment) {
                        attachment['attachment'] = true;
                        return attachment;
                    }));
                    $(this.el).css('display', 'none').html(this.template(context));

                    // make the first attachment visible
                    $(this.el).find('.attachment-name').eq(0).click()

                    $('.sidebar-item.collapsible h4').click(function() {
                        $(this).parents(".sidebar-item").toggleClass("active").find(".summary-table-wrapper").slideToggle('fast');
                    }).prepend("<a class='toggle'>Toggle</a>");

                    // draw the tiny chart
                    var weeks = _.map(expandWeeks(context.docket.weeks), function(week) {
                        if (_.contains(['public_submission', 'supporting_material', 'other'], context.type) && context.date >= week.date_range[0] && context.date <= week.date_range[1]) {
                            week.selected = true;
                        }
                        return week;
                    });
                    var timeline_data = [{
                        'name': 'Submissions',
                        'href': '',
                        'timeline': weeks,
                        'overlays': []
                    }];
                    _.each(context.docket.fr_docs, function(doc) {
                        timeline_data[0].overlays.push({
                            'name': doc.title,
                            'date_range': doc.comment_date_range ? doc.comment_date_range : [doc.date, null],
                            'type': doc.type,
                            'type_label': ({'notice': 'Notices', 'proposed_rule': 'Proposed Rules', 'rule': 'Rules'})[doc.type],
                            'selected': context.id == doc.id
                        });
                    });
                    SpareribCharts.tiny_timeline_chart('sidebar-timeline', timeline_data);
                    this.$el.find('#sidebar-timeline svg').attr('width', '240');

                    $('.main-loading').slideUp('fast');
                    this.$el.slideDown('fast');
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
        $(".main-loading").slideDown('fast');
        this.model.fetch(
            {
                'success': $.proxy(function() {
                    var context = _.extend({}, helpers, this.model.toJSON());
                    $(this.el).css('display', 'none').html(this.template(context));

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
                        SpareribCharts.timeline_chart(({'submitter_mentions': 'submission', 'text_mentions': 'mention'})[submission_type] + '-timeline', timeline_data, {'show_legend': false});
                    });

                    $('.main-loading').slideUp('fast');
                    this.$el.slideDown('fast');
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
        'selectcluster .cluster-map': 'handleSwitchCluster',
        'hovercluster': 'showPhrases',
        'click .cluster-doc-list li': 'handleSwitchDoc',
    },

    initialize: function() {
        this.phrases = {};
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
                var chart = this.$el.find('.cluster-map').removeClass('loading');

                var hierarchy = this.model.get('cluster_hierarchy');
                this.circles = window.SpareribBubbles.drawBubbles({'element': chart.get(), 'data': hierarchy});

                var prepopulate = this.model.get('prepopulate');
                if (prepopulate) {
                    this.circles.select(prepopulate.cluster, prepopulate.cutoff);
                    this.switchDoc(prepopulate.cluster, prepopulate.document);
                }

                if (hierarchy.length == 0 || hierarchy[0].phrases) {
                    this.circles.setPhrasesLoading("false");
                    this.computePhrases();
                } else {
                    this.model.set("require_summaries", true);
                    this.model.fetch({
                        'success': $.proxy(function() {
                            this.circles.setPhrasesLoading("false");
                            this.computePhrases();
                        }, this)
                    })
                }
            }, this),
            'error': function() {
                console.log('DocketClusters.fetch() failed');
            }
        });

        return this;
    },

    handleSwitchCluster: function(evt, opts) {
        this.switchCluster(opts.clusterId, opts.cutoff, opts.inChain);
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

    computePhrases: function() {
        var flat = this.model.flatten();
        var phrases = this.phrases;
        _.each(flat, function(row) {
            _.each(row, function(node) {
                phrases[node.name + "_" + (100 * node.cutoff)] = node.phrases;
            })
        });
    },
    showPhrases: function(evt, opts) {
        var key = opts.clusterId ? opts.clusterId + "_" + (100 * opts.cutoff) : false;
        var phrases = key && this.phrases[key] ? this.phrases[key] : [];
        this.circles.setPhrases(phrases);
    },

    handleSwitchDoc: function(evt) {
        var $box = $(evt.target).closest('li');
        var docId = $box.attr('data-document-id');
        this.switchDoc(this.clusterModel.id, docId);
        $box.parent().find('.cluster-doc-selected').removeClass('cluster-doc-selected');
        $box.addClass('cluster-doc-selected');
    },
    switchDoc: function(clusterId, docId, pseudoLoad) {
        var cutoff = this.model.get('cutoff');
        cutoff = cutoff ? cutoff : 0.5;
        var targetUrl = '/docket/' + this.model.id + '/similarity/cutoff-' + (100 * cutoff) + '/document-' + docId;
        var targetCid = Math.round(100*cutoff) + "-" + clusterId;

        // what if we're already on this document?
        var docArea = $(this.el).find('.cluster-doc');
        if (docArea.attr('data-document-id') == targetCid && docArea.attr('data-document-id') == docId) {
            return;
        }

        // update the model and URL
        this.model.set('docId', docId);
        app.navigate(targetUrl, {
            trigger: false,
            // if we're not already viewing a document, don't create a new history entry since this is automatic
            replace: Backbone.history.fragment.indexOf("/document-") == -1
        })

        if (typeof pseudoLoad !== "undefined" && pseudoLoad) {
            docArea.addClass('pseudo-loading');
        } else {
            docArea.html("").addClass("loading");
        }
        

        docArea.attr('data-cluster-id', targetCid);
        
        var oldDocId = docArea.attr('data-document-id');
        docArea.attr('data-document-id', docId);

        this.documentModel = new ClusterDocument({'cutoff': cutoff, 'docket_id': this.model.id, 'cluster_id': clusterId, 'id': docId});
        this.documentModel.fetch({
            'success': $.proxy(function() {
                var contents = $("<div class='cluster-doc-contents'>");
                var pre = $("<div>");
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
                    this.circles.removeAllFromChain();
                    this.circles.addToChain(this.chainModel.get('clusters'));
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
        this.route("search/:term/:page", "defaultSearchResults");
        this.route("search/:term", "defaultSearchResults");
        this.route("search-:type/:term/:page", "searchResults");
        this.route("search-:type/:term", "searchResults");

        // clusters
        this.route("docket/:id/similarity", "docketClusters");
        this.route("docket/:id/similarity/cutoff-:cutoff", "docketClusters");
        this.route("docket/:id/similarity/cutoff-:cutoff/document-:docId", "docketClusters");

        // static stuff
        this.route("", "home");
        this.route("about", "about");

        // load the upper search box at the beginning
        var topSearchView = new SearchView({'el': $('#top-search .search').get(0), 'type': null, 'filters': 'simple'});
        topSearchView.intertag();
    },

    home: function() {
        var homeView = new HomeView({});
        $('#main').html(homeView.render().el);
    },

    defaultSearchResults: function(query, page) {
        this.searchResults(null, query, page);
    },
    searchResults: function(type, query, page) {
        if (typeof page == "undefined") {
            page = null;
        }

        // the query will have been encoded, so decode it
        query = decodeURIComponent(query);

        if (type == null) {
            // are we on a search page?
            var models = _.map(['docket', 'document-fr', 'document-non-fr'], function(type) {
                return {'type': type, 'model': new SearchResults({'query': query, 'in_page': null, 'level': type, 'limit': 5})}
            });
            var depth = 'shallow';
        } else {
            var models = [{'type': type, 'model': new SearchResults({'query': query, 'in_page': page, 'level': type})}];
            var depth = 'deep';
        }
        var resultsView = new ResultsView({'models': models, 'depth': depth});
        $("#main").html(resultsView.render().el);

        resultsView.$el.find('.search').each(function() {
            var sv = new SearchView({'el': this, 'type': type, 'filters': 'complex'});
            sv.intertag();
        })
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
    },

    about: function() {
        var view = new StaticView({id: 'about'});
        $('#main').html(view.render().el);
    }
});
 
var app = new AppRouter();
window.app = app;

Backbone.history.start({pushState: true});

/* assume backbone link handling, from Tim Branyen */
$(document).on("click", "a:not([data-bypass])", function(evt) {
    if (evt.isDefaultPrevented() || evt.metaKey || evt.ctrlKey) {
        return;
    }

    var href = $(this).attr("href");
    var protocol = this.protocol + "//";

    if (href && href.slice(0, protocol.length) !== protocol &&
        href.indexOf("javascript:") !== 0) {
        evt.preventDefault();
        Backbone.history.navigate(href, true);
    }
});


})(jQuery);