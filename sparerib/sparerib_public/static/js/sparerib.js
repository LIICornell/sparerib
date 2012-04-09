(function($) {
// Models
var Docket = Backbone.Model.extend({ url: function() { return "/api/1.0/docket/" + this.id; } });
var DocketCollection = Backbone.Collection.extend({ model: Docket, url: "/api/1.0/docket" });

var Entity = Backbone.Model.extend({ url: function() { return "/api/1.0/entity/" + this.id; } });
var EntityCollection = Backbone.Collection.extend({ model: Entity, url: "/api/1.0/entity" });

var SearchResults = Backbone.Model.extend({ idAttribute: "query", url: function() { console.log(this); return "/api/1.0/search/" + encodeURIComponent(this.id) + "?page=" + this.get('page'); } });
var SearchResultsCollection = Backbone.Collection.extend({ model: SearchResults, url: "/api/1.0/search" });

// Template helpers
var helpers = {
    'formatDate': function(iso_date) {
        var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        var date = new Date(iso_date);
        return (months[date.getUTCMonth()] + " " + date.getUTCDate() + ", " + date.getUTCFullYear());
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
                    var context = _.extend(helpers, this.model.toJSON());
                    $(this.el).html(this.template(context));
                }, this),
                'error': function() {
                    console.log('failed');
                }
            }
        );
        return this;
    }
})

var DocketDetailView = Backbone.View.extend({
    tagName: 'div',
    id: 'docket-view',

    template: _.template($('#docket-tpl').html()),
    render: function() {
        this.model.fetch(
            {
                'success': $.proxy(function() {
                    var context = _.extend(helpers, this.model.toJSON());
                    $(this.el).html(this.template(context));

                    // charts
                    SpareribCharts.type_breakdown_piechart('type-breakdown', context.stats.type_breakdown);
                    
                    var timeline_data = [{
                        'name': 'Submission Timline',
                        'href': '',
                        'timeline': _.map(context.stats.weeks, function(week) {
                            return week.count;
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

var EntityDetailView = Backbone.View.extend({
    tagName: 'div',
    id: 'entity-view',

    template: _.template($('#entity-tpl').html()),
    render: function() {
        this.model.fetch(
            {
                'success': $.proxy(function() {
                    var context = _.extend(helpers, this.model.toJSON());
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
        this.route("", "searchLanding");
        this.route("docket/:id", "docketDetail");
        this.route(/^(organization|individual|politician|entity)\/[a-zA-Z0-9-]*\/([a-z0-9-]*)$/, "entityDetail");
        this.route("search/:term/:page", "searchResults");
        this.route("search/:term", "searchResults");
    },

    searchLanding: function() {
        var searchView = new SearchView();
        $('#main').html(searchView.render().el);
    },

    searchResults: function(query, page) {
        console.log(query, page);
        // are we on a search page?
        var resultSet = $('.result-set');
        if (resultSet.length == 0) {
            this.searchLanding();
            resultSet = $('.result-set');
        }

        if (typeof page == "undefined") {
            page = 1;
        }

        var results = new SearchResults({'query': query, 'page': page});
        var resultsView = new ResultsView({model: results});
        resultSet.html(resultsView.render().el);
    },
 
    docketDetail: function(id) {
        var docket = new Docket({'id': id});
        var docketView = new DocketDetailView({model: docket});
        $('#main').html(docketView.render().el);
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