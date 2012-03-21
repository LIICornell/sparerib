(function($) {
// Models
var Docket = Backbone.Model.extend({
    url: function() {
        return "/api/1.0/docket/" + this.id;
    }
});

var DocketCollection = Backbone.Collection.extend({
    model: Docket,
    url: "/api/1.0/docket"
})

// Template helpers
var helpers = {
    'formatDate': function(iso_date) {
        var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        var date = new Date(iso_date);
        return (months[date.getUTCMonth()] + " " + date.getUTCDate() + ", " + date.getUTCFullYear());
    }
}
// Views
var ResultsView = Backbone.View.extend({
    tagName: 'div',
    id: 'results-view',

    events: {
        'click a': 'link_click'
    },
    template: _.template($('#results-tpl').html()),
    render: function() {
        $(this.el).html(this.template({}));
        return this;
    },
    'link_click': function(event) {
        app.navigate($(event.target).attr('href'), {trigger: true});
        return false;
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
                            return week.total;
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

// Router
var AppRouter = Backbone.Router.extend({
 
    routes:{
        "": "results",
        "docket/:id": "docketDetail"
    },
    
    initialize: function() {
        this.docketCollection = new DocketCollection();
    },

    results: function () {
        var resultsView = new ResultsView();
        $('#main').html(resultsView.render().el);
    },
 
    docketDetail:function (id) {
        var docket = new Docket({'id': id});
        var docketView = new DocketDetailView({model: docket});
        $('#main').html(docketView.render().el);
    }
});
 
var app = new AppRouter();
window.app = app;

Backbone.history.start();

})(jQuery);