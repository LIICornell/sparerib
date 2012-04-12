(function($) {
// Models
var Document = Backbone.Model.extend({ url: function() { return "/api/1.0/document/" + this.id; } });
var DocumentCollection = Backbone.Collection.extend({ model: Document, url: "/api/1.0/document" });

var Docket = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.id; } });
var DocketCollection = Backbone.Collection.extend({ model: Docket, url: "/api/1.0/docket" });

var Agency = Backbone.Model.extend({ url: function() { return "/api/1.0/agency/" + this.id; } });
var AgencyCollection = Backbone.Collection.extend({ model: Agency, url: "/api/1.0/agency" });

var Entity = Backbone.Model.extend({ url: function() { return "/api/1.0/entity/" + this.id; } });
var EntityCollection = Backbone.Collection.extend({ model: Entity, url: "/api/1.0/entity" });

var SearchResults = Backbone.Model.extend({ idAttribute: "query", url: function() { return "/api/1.0/search/" + (this.get('level') ? this.get('level') + '/' : '') + encodeURIComponent(this.id) + (this.get('in_page') ? "?page=" + this.get('in_page') : ''); } });
var SearchResultsCollection = Backbone.Collection.extend({ model: SearchResults, url: "/api/1.0/search" });

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
    id: 'search-view',

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
                    if (!this.model.get('level'))
                    app.navigate('/search-' + this.model.attributes.search.aggregation_level + '/' + encodeURIComponent(this.model.attributes.search.raw_query) + (this.model.get('in_page') ? '/' + this.model.get('in_page') : ''), {trigger: false, replace: true});
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
                        'timeline': _.map(context.stats[timeGranularity], function(period) {
                            return period.count;
                        })
                    }];
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
        'click .tab': 'switchTab'
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

                    // click on the first item in each visible tab area
                    $(this.el).find('.tab-area:visible .tab:first-child').click()
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
                            'timeline': _.map(context.stats[submission_type].months, function(month) {
                                return month.count;
                            })
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

// Router
var AppRouter = Backbone.Router.extend({   
    initialize: function() {
        // routes

        // resource pages
        this.route("document/:id", "documentDetail");
        this.route("docket/:id", "docketDetail");
        this.route("agency/:id", "agencyDetail");
        this.route(/^(organization|individual|politician|entity)\/[a-zA-Z0-9-]*\/([a-z0-9-]*)$/, "entityDetail");
        
        // search
        this.route("", "searchLanding");
        this.route("search/:term/:page", "defaultSearchResults");
        this.route("search/:term", "defaultSearchResults");
        this.route("search-:type/:term/:page", "searchResults");
        this.route("search-:type/:term", "searchResults");
    },

    searchLanding: function() {
        var searchView = new SearchView();
        $('#main').html(searchView.render().el);
    },

    defaultSearchResults: function(query, page) {
        this.searchResults(null, query, page);
    },
    searchResults: function(type, query, page) {
        console.log(query, page);
        // are we on a search page?
        var resultSet = $('.result-set');
        if (resultSet.length == 0) {
            this.searchLanding();
            resultSet = $('.result-set');
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

    entityDetail: function(type, id) {
        var entity = new Entity({'id': id});
        var entityView = new EntityDetailView({model: entity});
        $('#main').html(entityView.render().el);
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