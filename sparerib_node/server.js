var express = require('express');
var app = express();
var Browser = require("zombie");
var http = require('http'), httpProxy = require('http-proxy');

var globalBrowser = new Browser();
var proxy = new httpProxy.RoutingProxy();

globalBrowser.visit("http://localhost:8005", function() {
    start();
})

app.all(/\/(api|static)\/.*/, function(req, res) {
    proxy.proxyRequest(req, res, {
        host: 'localhost',
        port: 8005
    });
});

app.all('*', function(req, res) {
    var browser = globalBrowser.fork();
    browser.wait(function() {
        browser.window.SIMPLE_JS = true;
        console.log('start wait');
        browser.window.Backbone.history.navigate(req.path, true);
        browser.wait(function() {
            browser.window.$('script').remove();
            res.send(browser.html());
        })
    })
});

var start = function() {
    console.log('ready');
    app.listen(3000);
}