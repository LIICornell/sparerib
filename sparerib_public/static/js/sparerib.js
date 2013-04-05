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
            this.$el.find('a.jump').click(function(evt) {
                console.log($(evt.target).attr('href'));
                var top = $($(evt.target).attr('href')).offset().top;
                $(window).scrollTop(top);
                return false;
            })
        }, this));
        setMeta({'pageTitle': helpers.capitalize(this.id)});
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
        } else {
            options.placeholder = 'Search or filter by keyword, agency or submitter';
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
        setMeta({'pageTitle': 'Search'});
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
    className: 'aggregated-view',

    template: _.template($('#aggregated-tpl').html()),
    teaserTemplate: _.template($('#docket-teaser-tpl').html()),

    render: function() {
        var modelType = this.model instanceof Docket ? "docket" : "agency";
        this.$el.addClass(modelType + "-view").attr("id", modelType + "-" + this.model.id);

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
                    if (!window.SIMPLE_JS) SpareribCharts.timeline_chart('submission-timeline', timeline_data);

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

                    if (type == 'docket') {
                        setMeta({'pageTitle': 'Docket: ' + this.model.get('title')});
                    } else {
                        setMeta({'pageTitle': 'Agency: ' + this.model.get('name'), 'pageDesc': DEFAULT_META.pageDesc + " View the regulatory history of " + this.model.get('name'), 'twDesc': "View the regulatory history of " + this.model.get('name') + " on Docket Wrench" });
                    }
                }, this),
                'error': function() {
                    console.log('failed');
                }
            }
        );
        
        if (this.model instanceof Docket && !window.SIMPLE_JS) {
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
        
        setMeta({'pageTitle': this.model instanceof Docket ? 'Docket: ' + this.model.id : 'Agency: ' + this.model.id});
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
                    if (!window.SIMPLE_JS) SpareribCharts.tiny_timeline_chart('sidebar-timeline', timeline_data);
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

        setMeta({'pageTitle': 'Document: ' + this.model.id});
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
                        if (!window.SIMPLE_JS) SpareribCharts.timeline_chart(({'submitter_mentions': 'submission', 'text_mentions': 'mention'})[submission_type] + '-timeline', timeline_data, {'show_legend': false});
                    });

                    $('.main-loading').slideUp('fast');
                    this.$el.slideDown('fast');
                    setMeta({'pageTitle': 'Organization: ' + this.model.get('name'), 'pageDesc': DEFAULT_META.pageDesc + " View the regulatory history of " + this.model.get('name'), 'twDesc': "View the regulatory history of " + this.model.get('name') + " on Docket Wrench" });
                }, this),
                'error': function() {
                    console.log('failed');
                }
            }
        );
        setMeta({'pageTitle': 'Organization'});
        return this;
    }
});

var DownloadView = Backbone.ModalView.extend({
    template: _.template($('#download-tpl').html()),
    initialize: function() {
        this.defaultOptions = _.extend({}, this.defaultOptions, {css: {}});
    },
    render: function() {
        this.$el.html(this.template());
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
        if (!window.SIMPLE_JS) this.renderMap();
        setMeta({'pageTitle': 'Comment Similarity for ' + this.model.id, 'pageDesc': 'Visualize federal rulemaking comments with Docket Wrench.', 'twDesc': 'Visualize federal rulemaking comments with Docket Wrench #dataviz' });
        return this;
    },
        
    renderMap: function() {
        this.$el.find('.cluster-map').html("").addClass('loading');
        this.$el.find('.cluster-breakdown').html("");

        this.model.fetch({
            'success': $.proxy(function() {
                var chart = this.$el.find('.cluster-map').removeClass('loading');
                this.$el.find('.cluster-visualization h4').css('visibility', 'visible');

                var hierarchy = this.model.get('cluster_hierarchy');
                this.circles = window.SpareribBubbles.drawBubbles({'element': chart.get(), 'data': hierarchy});

                var prepopulate = this.model.get('prepopulate');
                if (prepopulate) {
                    this.circles.select(prepopulate.cluster, prepopulate.cutoff);
                    this.switchDoc(prepopulate.cluster, prepopulate.document);
                }

                var stats = this.model.get('stats');
                this.renderSummary(stats);
                this.renderDoclistGraphics();

                if (hierarchy.length == 0 || hierarchy[0].phrases) {
                    var _this = this;
                    this.computePhrases();
                    // add a delay before showing phrases so a circle is selected before we do
                    setTimeout(function() {
                        _this.circles.setPhrasesLoading("false");
                    }, 750);
                } else {
                    this.model.set("require_summaries", true);
                    this.model.fetch({
                        'success': $.proxy(function() {
                            this.computePhrases();
                            this.circles.setPhrasesLoading("false");
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

    renderSummary: function(stats) {        
        var percentage = Math.round(100 * stats.clustered / (stats.clustered + stats.unclustered));

        var pie = SpareribCharts.cluster_piechart(this.$el.find(".cluster-breakdown").get(0), [{"type": "unclustered", "percentage": 100 - percentage}, {"type": "clustered", "percentage": percentage}]);
        pie.style("position", "absolute").style("bottom", "0px").style("left", "0px");
        var $container = $(pie[0][0].parentNode);

        _.each([[445, 120 - 45, "unclustered"], [445, 120 + 45, "clustered"]], function(coords) {
            var group = pie.append("g");
            group.append("line")
                .attr("x1", coords[0] + 4)
                .attr("y1", coords[1])
                .attr("x2", coords[0] + 140)
                .attr("y2", coords[1])
                .style("stroke", "#473f3d")
                .style("stroke-width", "2px");
            group.append("circle")
                .attr("cx", coords[0])
                .attr("cy", coords[1])
                .attr("r", 4)
                .style("stroke", "#473f3d")
                .style("stroke-width", "2px")
                .style("fill", "none");
            if (coords[2] == "clustered") {
                var text = "<span class='percent'>" + percentage + "%</span> of comments have at least 50% similarity to one or more other comments";
            } else {
                var text = "<span class='percent'>" + (100 - percentage) + "%</span> of comments are unique and have less than 50% similarity to other comments";
            }
            var $div = $("<div>").html(text).css({'position': 'absolute', 'left': (coords[0] + 150) + 'px', 'bottom': (250 - coords[1]), 'width': '265px', 'font-size': '80%'});
            $container.append($div);
        });
        
        SpareribCharts.brace(pie, 445, 230, pie.selectAll('.slice-clustered')[0][0].getBoundingClientRect().width, "up");
        SpareribCharts.brace(pie, 445, 240, 885, "down");
        pie.append("line").attr("x1", 445).attr("x2", 445).attr("y1", 230).attr("y2", 240).style("stroke", "#cbc5b9").style("stroke-width", "1px");

        // fill in the breadcrumbs and dates
        this.$el.find('.breadcrumbs').html('<li><a href="' + stats.agency.url + '">' + stats.agency.name + '</a> &raquo;&nbsp;</li><li><a href="/docket/' + this.model.id + '">' + this.model.id + '</a> &raquo;</li>');
        this.$el.find('.dates').html(helpers.formatDate(stats.date_range[0]) + " &mdash; " + helpers.formatDate(stats.date_range[1]))
    },

    renderDoclistGraphics: function() {
        
        var svg = d3.select(this.el).selectAll('.cluster-docs').insert("svg", ".cluster-doc");
        svg
            .style('width', '75px')
            .style('height', '610px')
            .style('margin-top', '-4px')
            .style('float', 'left');
        SpareribCharts.brace(svg, 40, 304, 608, "right");
        this.doclistSvg = svg;
        this.doclistSvgOffset = $(svg[0][0]).offset().top;

        var _this = this;
        this.$el.find('.cluster-doc-list').on('scroll', function() {
            _this.updateDoclistGraphics();
        });

        this.updateDoclistGraphics();
    },
    updateDoclistGraphics: function() {
        var selected = this.$el.find('.cluster-doc-list .cluster-doc-selected');
        var svg = $(this.doclistSvg[0][0]);
        if (selected.length > 0) {
            var offset = (selected.offset().top - this.doclistSvgOffset) + (selected.height() / 2) + 4;
            var circle = this.doclistSvg.selectAll('circle');

            if (offset < 2 || offset > 608) {
                circle.remove();
                offset = Math.min(Math.max(2, offset), 608);
            } else {
                if (circle.empty()) {
                    circle = this.doclistSvg.append("circle")
                        .attr("r", 4)
                        .attr("cx", 8)
                        .style("stroke", "#473f3d")
                        .style("stroke-width", "2px")
                        .style("fill", "none");
                }
                circle
                    .attr("cy", offset);
            }

            this.doclistSvg.selectAll('path.S').remove();
            SpareribCharts.drawHS(this.doclistSvg, 12, offset, 40, 304)
                .classed("S", true)
                .style("stroke", "#89827b")
                .style("stroke-width", "2px")
                .attr("stroke-dasharray","2,5")
                .attr("stroke-linecap", "round");
        }
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
                    this.updateDoclistGraphics();
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
        this.updateDoclistGraphics();
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

                var meta = this.documentModel.get('metadata')
                var title = $("<div class='cluster-doc-header'>");
                title.html("<span class='cluster-doc-title'>" + meta.title + "</span><span class='cluster-doc-submitter'>" + meta.submitter + "</span>");
                contents.append(title);

                var key = $("<div class='cluster-doc-key'>");
                key.html("Least Common Phrases <span></span> Most Common Phrases");
                title.append(key);

                var pre = $("<div>").addClass('cluster-doc-text');
                contents.append(pre);

                var truncated = this.documentModel.get('truncated');
                var backlink = $("<div class='cluster-doc-link'>");
                backlink.html(
                    "<a href='/document/" + meta.document_id + "'>"
                    + (truncated ? "Learn more about this submission and see its full text &raquo;" : "Learn more about this submission &raquo;")
                    + "</a>"
                );
                contents.append(backlink);

                var children = docArea.children();
                docArea.removeClass("loading").removeClass("pseudo-loading").append(contents);
                if (children.length) {
                    children.remove();
                }
                pre.html(this.documentModel.get('frequency_html') + (truncated ? "..." : ""));
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

var DEFAULT_META = {
    siteTitle: 'Docket Wrench',
    pageTitle: '',
    pageDesc: 'Use Docket Wrench to see how businesses and organizations shape federal regulations.',
    altDesc: 'Docket Wrench makes it simple for researchers and members of the public to delve into regulatory comments.',
    twDesc: null
};
var meta_fragment = '';
var social = $('header .social');
var doSocial = window.navigator.userAgent.search(/Zombie/) == -1;
var setMeta = function(meta) {
    var m = _.extend({}, DEFAULT_META, meta);
    m.title = m.siteTitle + (m.pageTitle ? " - " + m.pageTitle : "");

    var head = $('head');
    head.find('title').html(m.title);

    if (_.contains(["Home", "About", "Search"], m.pageTitle)) {
        head.find('meta[name=og\\:title]').attr('content', m.pageDesc);
        head.find('meta[name=og\\:description]').attr('content', m.altDesc);
    } else {
        head.find('meta[name=og\\:title]').attr('content', m.title);
        head.find('meta[name=og\\:description]').attr('content', m.pageDesc);
    }
    

    meta_fragment = Backbone.history.getFragment();
    head.find('meta[name=og\\:url]').attr('content', 'http://docketwrench.sunlightfoundation.com/' + meta_fragment);

    if (!m.twDesc) m.twDesc = m.pageDesc;
    m.twDesc = m.twDesc + " #opengov";

    if (doSocial) {
        var twLink = $('<a class="socialite twitter-share" href="http://twitter.com/share">Share on Twitter</a>')
        twLink.attr('data-url', 'http://docketwrench.sunlightfoundation.com/' + meta_fragment);
        twLink.attr('data-text', m.twDesc);

        var fbLink = $('<a class="socialite facebook-like" href="http://facebook.com/sharer/sharer.php?" data-layout="button_count">Facebook</a>');
        fbLink.attr('data-url', 'http://docketwrench.sunlightfoundation.com/' + meta_fragment);
        fbLink.attr('data-text', m.pageDesc);
        
        social.html('');
        social.append(fbLink);
        social.append(twLink);

        Socialite.load(social);
    }
}
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

        // downloads
        this.route("docket/:id/download", "docketDownload");

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
        setMeta({'pageTitle': 'Home'});
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

    docketDownload: function(id) {
        var current = $("#main").children().eq(0);
        if (!(current && current.hasClass("docket-view") && current.attr("id") == "docket-" + id)) {
            console.log("not already there");
            this.docketDetail(id);
        }

        var view = new DownloadView();
        view.render().showModal();
    },

    about: function() {
        var view = new StaticView({id: 'about'});
        $('#main').html(view.render().el);
    }
});

var app = new AppRouter();
window.app = app;
window.SIMPLE_JS = false;

app.bind("all", function(route, router) {
    var url;  
    url = Backbone.history.getFragment();

    if (url != meta_fragment) {
        setMeta({});
    }

    window._gaq.push(['_trackPageview', "/" + url]);
});

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