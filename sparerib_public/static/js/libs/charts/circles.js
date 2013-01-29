(function($) {

W = 890;
H = 240;
var FRACTION = 0.4;
var ROWSIZE = 105;
var CHILD_MAX_R = 50;
var MAX_R = 0.4 * H;
var PERCENT_MARGIN = 10;
var PERCENT_OFFSET = 40;
var BRACE_HEIGHT = 50;
var TOTAL_W = W;
var TOTAL_H = H + (ROWSIZE * 4) + BRACE_HEIGHT + 10;
var PHRASE_CIRCLE_R = 4;
var SELECTED_COLOR = "#e9b627";

var THREE_PI_OVER_FOUR = (3 * Math.PI) / 4;

var getBounds = function(delement) {
    var bounds = delement.getBoundingClientRect ? delement.getBoundingClientRect() : delement[0][0].getBoundingClientRect();
    return {'top': bounds.top + window.scrollY, 'left': bounds.left + window.scrollX, 'width': bounds.width, 'height': bounds.height};
}

var drawBubbles = function(opts) {

    var chartElement = opts.element;
    var bubbleData = opts.data;

    // some hackery to scale radii to make the area of the circles be about FRACTION of the area of the whole view
    var areas = d3.sum(_.map(bubbleData, function(d) { return d.size * Math.PI; }));
    var areaFactor = factor = Math.sqrt(FRACTION / (areas / (W * H)));

    var firstChildren = _.reduce(_.pluck(bubbleData, "children"), function(memo, arr) { return memo.concat(arr); }, []);
    var childRadiusFactor = Math.min.apply(this, _.map(firstChildren, function(d) { return CHILD_MAX_R / Math.sqrt(d.size); }));

    var radiusFactor = Math.min.apply(this, _.map(bubbleData, function(d) { return MAX_R / Math.sqrt(d.size); }));

    var factor = _.min([radiusFactor, childRadiusFactor, areaFactor]);

    var colorScale = d3.scale.linear().domain([0.5,0.9]).range(['#bbd5d4', '#579594']);

    var container = d3.selectAll(chartElement);
    var svg = container.append('svg')
        .classed('circle-chart', true)
        .style('width', TOTAL_W + 'px')
        .style('height', TOTAL_H + 'px');

    svg.append('line')
        .attr("x1", 0).attr('x2', W)
        .attr('y1', H).attr("y2", H)
        .style('fill', 'none')
        .style('stroke', '#cbc5b9')
        .style('stroke-width', '1');

    var $container = $(chartElement);
    $container.css('position', 'relative');

    var svgRect = getBounds(container);

    var xpos = 0;
    var ypos = [H / 3, (2 * H) / 3];
    var nodes = [
        /* {'radius': 0, 'x': W, 'y': 0, 'fixed': true} */
    ].concat(
        _.map(bubbleData, function(d, i) { var r = Math.sqrt(d.size) * factor; xpos += 2 * r; return {'radius': r, 'x': xpos - r, 'y': ypos[i % 2], 'source': d, 'hoverState': false}; })
    )

    var fixedRx = 0, fixedRy = 0;
    var selected = null;
    var phraseTm = null;

    var force = d3.layout.force()
        .gravity(0.1)
        .charge(-300)
        .nodes(nodes)
        .size([W, H]);

    force.start();

    var drawChildren = function(_children, target, lines) {
        var children = _.sortBy(_.map(_children, function(d) { return {'radius': Math.sqrt(d.size) * factor, 'source': d}; }), function(x) { return -1 * x.radius; });
        var cradius = d3.sum(_.map(children, function(d) { return d.radius; }));
        var xpos = 0;
        var maxDepth = 0;
        var childVGroup = target.append('g').classed('level', true);
        var childHGroup = childVGroup.append('g');
        var cutoff = false;
        var oLines = [];
        _.each(children, function(child, i) {
            var g = childHGroup.append("g");

            var depthColor = colorScale(child.source.cutoff);
            var circle = g.append('circle')
                .classed('child-circle', true)
                .style('stroke', '#eeeeee')
                .style('fill', depthColor)
                .attr('data-depth-color', depthColor)
                .style('stroke-width', '1')
                .attr('r', child.radius)
                .attr('data-cluster-id', child.source.name)
                .attr('data-cluster-cutoff', child.source.cutoff)
                .attr('id', "cluster-" + String(child.source.name) + "-" + String(100 * child.source.cutoff));

            var line = lines.append('line')
                .attr('stroke', '#d5d1c8')
                .attr('stroke-width', '2');

            var number = g.append("text")
                .classed('child-number', true)
                .attr("x", 0)
                .attr("y", 0)
                .attr('opacity', 0)
                .text("" + child.source.size)
                .style("stroke", "#222222")
                .style("alignment-baseline", "middle")
                .style("text-anchor", "middle")
                .style("font-family", "helvetica, sans-serif")
                .style("font-size", "11px")
                .style("cursor", "default");

            circle[0][0].lineToParent = line[0][0];
            oLines.push(line[0][0]);

            var csize = 0;
            if (child.source.children && child.source.children.length) {
                var grandchildren = drawChildren(child.source.children, g, lines);
                csize = grandchildren.treeSize;
                circle[0][0].linesToChildren = grandchildren.lines;
                maxDepth = _.max([maxDepth, child.source.cutoff, grandchildren.maxDepth]);
            } else {
                circle[0][0].linesToChildren = [];
                maxDepth = Math.max(maxDepth, child.source.cutoff);
            }

            child.treeSize = Math.max(2 * child.radius + 2, csize);
            xpos +=  child.treeSize / 2;
            g.attr('transform', "translate(" + xpos + ",0)");
            xpos += child.treeSize / 2;

            if (!cutoff) {
                cutoff = true;
                childVGroup.attr('data-cutoff', child.source.cutoff);
            }
        })
        var treeSize = xpos;
        childHGroup.attr('transform', 'translate(-' + (treeSize / 2) + ",0)");
        return {'treeSize': treeSize, 'lines': oLines, 'maxDepth': maxDepth};
    }

    var updateLines = function(circles) {
        var parent = circles.filter('.parent');
        var prect = getBounds(parent);
        var px = prect.left + (prect.width / 2);
        var py = prect.top + (prect.height / 2);
        circles.each(function(d, i) {
            var circle = this;
            var rect = getBounds(circle);
            var x = (rect.left + (rect.width / 2)) - px;
            var y = (rect.top + (rect.height / 2)) - py;
            d3.select(circle.lineToParent)
                .attr('x1', x)
                .attr('y1', y);
            _.each(circle.linesToChildren, function(line) {
                d3.select(line)
                    .attr('x2', x)
                    .attr('y2', y);
            });
            if (circle.docsGroup) docsConnect(d3.select(circle));
        })
    }

    var mainGroup = svg.append('g');
    var maxTreeSize = 0;
    var circles = mainGroup.selectAll('.circle').data(nodes.slice(0)).enter()
        .append('g')
        .classed('circle', true)
        .each(function(d, i) {

            var dthis = d3.select(this);
            dthis.attr('id', 'cluster-group-' + d.source.name);

            var lines = dthis.append("g").classed('level-lines', true);
            lines.attr('visibility', 'hidden');
            
            var circleSelection = dthis.append('circle')
                .classed('parent', true)
                .style('stroke', '#cccccc')
                .style('stroke-width', '1')
                .attr('r', function(d) { return d.radius - 1; })
                .attr('data-cluster-id', function(d) { return d.source.name; })
                .attr('data-cluster-cutoff', function(d) { return d.source.cutoff; })
                .attr('id', function(d) { return "cluster-" + String(d.source.name) + "-" + String(100 * d.source.cutoff) });
            var circleElement = circleSelection[0][0];

            var vSelect = function(circle) {
                circle.style('fill', SELECTED_COLOR).classed('selected', true);
                selected = circle;
                phraseConnect(circle, false);
                docsConnect(circle);
                $container.trigger('selectcluster', [{'clusterId': circle.attr('data-cluster-id'), 'cutoff': circle.attr('data-cluster-cutoff'), 'inChain': circle.classed('in-chain')}]);
            }
            var vDeselect = function(circle) {
                circle
                    .style('fill', circle.attr('data-depth-color'))
                    .classed('selected', false);
                selected = null;
                if (phraseLine[0][0].clusterCircle == circle[0][0]) phraseConnect(null, false);
                docsDisconnect(circle);
                $container.trigger('deselectcluster', [{'clusterId': circle.attr('data-cluster-id'), 'cutoff': circle.attr('data-cluster-cutoff'), 'inChain': circle.classed('in-chain')}]);
            }

            var releaseMove = function(d, i, toSelect) {
                if (d.fixed) return;

                borders.transition().duration(100).attr("opacity", 0);

                removeAllFromChain();

                var circle = mainGroup.selectAll('.parent');
                mainGroup.selectAll('.level').attr('transform', "");
                mainGroup.selectAll('.level-scale').each(function() {
                    var dthis = d3.select(this);
                    var sf = dthis.attr('data-scale-factor');
                    dthis.attr('transform', 'scale(' + sf + ',' + sf + ')');
                })
                updateLines(mainGroup.selectAll('circle'));
                mainGroup.selectAll('.level-lines').attr('visibility', 'hidden');
                var fixed = false;

                circles.each(function(_d, i) {
                    if (d === _d) return;
                    if (_d.fixed) {
                        fixed = true;
                        _d.fixed = false;
                        var cgroup = d3.select(this);
                        cgroup.classed('group-selected', false);
                        cgroup.selectAll('circle')
                            .classed('group-selected', false)
                            .filter('.selected')
                            .each(function(d, i) {
                                var circle = d3.select(this);
                                vDeselect(circle);
                            });
                        cgroup.selectAll('.child-number').transition().duration(100).attr('opacity', 0);
                    }
                    if (_d.hoverState) {
                        parentHoverOut.call(this);
                    }
                })

                move.call(this, d, i, toSelect);
            }

            var move = function(d, i, toSelect) {
                if (!dthis.data()[0].hoverState) parentHoverIn.call(dthis[0][0]);

                var ts = parseFloat(dthis.attr('data-tree-size'));
                
                d.fixed = true;
                fixedRy = d.radius;
                fixedRx = Math.max(d.radius, ts / 2) + PERCENT_OFFSET;

                var ix = d3.interpolateNumber(d.x, fixedRx);
                var iy = d3.interpolateNumber(d.y, H - d.radius);

                toSelect = toSelect ? toSelect : dthis.selectAll('.parent');
                selected = toSelect;

                var duration = 500;
                var ease = d3.ease("cubic-in-out");
                d3.timer(function(elapsed) {
                    // cancel the timer if we've been superceded
                    if (!d.fixed) return true;

                    // otherwise, animate as planned
                    var _t = elapsed / duration;
                    var t = _.min([1,_t]);
                    var e = ease(t);

                    d.x = ix(e);
                    d.y = iy(e);
                    d.px = d.x;
                    d.py = d.y;

                    if (_t > t) {
                        setTimeout(function() {
                            dthis.classed('group-selected', true).selectAll('circle').classed('group-selected', true);
                            vSelect(toSelect);
                            drop(dthis);
                        }, 0)
                        return true;
                    }
                });

                force.resume();
            }

            var drop = function(group) {
                var duration = 750;
                var bounceEase = d3.ease("bounce");
                var cubicEase = d3.ease("cubic-in-out");
                var topRadius = parseFloat(group.selectAll('circle.parent').attr('r'));

                var levels = group.selectAll('.level');
                var scales = group.selectAll('.level-scale');
                var circles = group.selectAll('circle');

                var si = d3.interpolateNumber(parseFloat(scales.attr('data-scale-factor')), 1);
                
                updateLines(circles);
                group.selectAll('.level-lines').attr('visibility', 'visible');

                d3.timer(function(elapsed) {
                    var _t = elapsed / duration;
                    var t = _.min([1,_t]);
                    var e = bounceEase(t);

                    var st = _.min([1, elapsed / (duration / 4)]);
                    var se = cubicEase(st);

                    levels.each(function() {
                        var dthis = d3.select(this);
                        var drop = e * (ROWSIZE + (dthis.attr('data-cutoff') == "0.6" ? topRadius - (ROWSIZE / 2): 0));

                        dthis.attr('transform', 'translate(0,' + drop + ')');
                    })

                    var scale = si(se);
                    scales.attr('transform', 'scale(' + scale + "," + scale + ")");

                    updateLines(circles);

                    if (_t > t) {
                        var lineEnd = Math.max(parseFloat(dthis.attr('data-tree-size')), 2 * dthis.datum().radius) + PERCENT_OFFSET + PERCENT_MARGIN;
                        borders.selectAll('line')
                            .attr('x2', lineEnd);
                        borders.selectAll('text.percent-0')
                            .attr("y", H - dthis.datum().radius);
                        
                        borders.transition().duration(100).attr('opacity', 1);
                        group.selectAll('.child-number').transition().duration(100).attr('opacity', 1);
                        
                        return true;
                    } else if (!d.fixed) {
                        // looks like someone else was selected before we finished, so undo our damage and kill the timer
                        levels.attr('transform', "");
                        scales.each(function() {
                            var dthis = d3.select(this);
                            var sf = dthis.attr('data-scale-factor');
                            dthis.attr('transform', 'scale(' + sf + ',' + sf + ')');
                        })
                        updateLines(circles);
                        group.selectAll('.level-lines').attr('visibility', 'hidden');
                        return true;
                    }
                });
            }
            
            var childSGroup = dthis.append("g").classed('level-scale', true).attr('opacity', '0');
            var children = drawChildren(d.source.children, childSGroup, lines);
            dthis.attr('data-tree-size', children.treeSize);
            if (children.treeSize > maxTreeSize) maxTreeSize = children.treeSize;

            var scaleFactor = Math.min(2 * d.radius / children.treeSize, 1);
            childSGroup.attr('transform', 'scale(' + scaleFactor + "," + scaleFactor + ')');
            childSGroup.attr('data-scale-factor', scaleFactor);

            circleElement.lineToParent = null;
            circleElement.linesToChildren = children.lines;

            var maxDepth = Math.max(d.source.cutoff, children.maxDepth);
            var color = colorScale(maxDepth);
            circleSelection.attr('data-color', color);
            circleSelection.style('fill', color);
            circleSelection.attr('data-depth-color', colorScale(d.source.cutoff));

            var allCircles = dthis.selectAll('circle');
            allCircles.attr('data-group-id', d.source.name);
            updateLines(allCircles);

            var number = dthis.append("text")
                .classed('parent-number', true)
                .attr("x", 0)
                .attr("y", 0)
                .text("" + d.source.size)
                .style("stroke", "#222222")
                .style("alignment-baseline", "middle")
                .style("text-anchor", "middle")
                .style("font-family", "helvetica, sans-serif")
                .style("font-size", "12px")
                .style("cursor", "default");

            
            var childHoverIn = function() {
                var circle = d3.select(this);
                if (!circle.classed('group-selected') || circle.classed('selected')) return;

                circle.style('fill', d3.rgb(circle.attr('data-depth-color')).brighter(0.3));

                phraseConnect(circle, false);
            };
            var childHoverOut = function() {
                var circle = d3.select(this);
                if (!circle.classed('group-selected') || circle.classed('selected')) return;

                circle.style('fill', circle.attr('data-depth-color'));
                phraseConnect(selected ? selected : null, false);
            }
            var childClick = function() {
                var circle = d3.select(this);
                if (!circle.classed('group-selected') || circle.classed('selected')) return;
                
                dthis.selectAll('circle.selected').each(function() { vDeselect(d3.select(this)); })
                vSelect(circle);
            };

            dthis.selectAll('circle')
                .on('mouseover', childHoverIn)
                .on('mouseout', childHoverOut)
                .on('click', childClick);

            dthis.selectAll('text')
                .on('mouseover', function() { childHoverIn.call(d3.selectAll(this.parentNode.childNodes).filter('circle')[0][0]); })
                .on('mouseout', function() { childHoverOut.call(d3.selectAll(this.parentNode.childNodes).filter('circle')[0][0]); })
                .on('click', function() { childClick.call(d3.selectAll(this.parentNode.childNodes).filter('circle')[0][0]); })

            var parentHoverIn = function(d, i) {
                if (phraseTm) {
                    clearTimeout(phraseTm);
                    phraseTm = null;
                }
                
                var dthis = d3.select(this);
                var data = dthis.data()[0];
                if (data.fixed || data.hoverState) return;
                var trans = dthis.transition()
                    .duration(100);
                trans
                    .select('.level-scale')
                    .attr('opacity', 1);

                trans
                    .selectAll('.parent')
                    .style('fill', function(d, i) { return d3.select(this).attr('data-depth-color'); });

                data.hoverState = true;

                phraseConnect(dthis.selectAll('.parent'), false);
            };
            var parentHoverOut = function(d, i) {
                var dthis = d3.select(this);
                var data = dthis.data()[0];
                if (data.fixed || !data.hoverState) return;
                var trans = dthis.transition()
                    .duration(100);
                trans
                    .select('.level-scale')
                    .attr('opacity', 0);
                trans
                    .selectAll('.parent')
                    .style('fill', function(d, i) {
                        var dthis = d3.select(this);
                        return dthis.classed("selected") ? SELECTED_COLOR : dthis.attr('data-color');
                    });

                data.hoverState = false;

                // do the phrase connection reset on a timeout to prevent bouncing
                if (!phraseTm) {
                    phraseTm = setTimeout(function() {
                        phraseConnect(selected ? selected : null, false);
                        phraseTm = null;
                    }, 200)
                }
            };

            dthis.on('click', releaseMove)
            dthis.on('mouseover', parentHoverIn).on('mouseout', parentHoverOut);
        });
    
    var connected = null;
    var phraseConnect = function(circle, update) {
        if (circle == null) {
            var x = phraseLine.attr("x2");
            var y = phraseLine.attr("y2");
            phraseLine.attr("x1", x).attr("y1", y);
            phraseDot.attr("cx", x).attr("cy", y);
            phraseLine[0][0].clusterCircle = null;

            $container.trigger('hovercluster', [{'clusterId': null, 'cutoff': null, 'inChain': false}]);
            connected = null;
            return;
        }

        if (phraseLine[0][0].clusterCircle == circle[0][0] && !update) return;

        phraseLine[0][0].clusterCircle = circle[0][0];
        var rect = getBounds(circle);

        var cx = rect.left + (rect.width / 2) - svgRect.left;
        var x = cx + parseInt(circle.attr('r')) - (2 * PHRASE_CIRCLE_R);
        var y = rect.top + (rect.height / 2) - svgRect.top;
        phraseDot.attr("cx", x).attr("cy", y);

        /* figure out where the end of the line should go so it doesn't intersect the circle */
        var theta = Math.atan((pbShape.center.x - x)/(pbShape.center.y - y));
        var theta_star = (Math.PI / 2) - theta;
        if (theta_star > (3 * Math.PI / 4)) theta_star += Math.PI;

        var lx = (PHRASE_CIRCLE_R * Math.cos(theta_star)) + x;
        var ly = (PHRASE_CIRCLE_R * Math.sin(theta_star)) + y;

        phraseLine.attr("x1", lx).attr("y1", ly);

        if (connected == null || connected[0][0] != circle[0][0]) {
            $container.trigger('hovercluster', [{'clusterId': circle.attr('data-cluster-id'), 'cutoff': circle.attr('data-cluster-cutoff'), 'inChain': circle.classed('in-chain')}]);
            connected = circle;
        }
    }

    var docsConnect = function(circle) {
        docsBrace.style('visibility', 'visible');

        var cel = circle[0][0];

        var x = (2 * PHRASE_CIRCLE_R) - parseInt(circle.attr('r'));
        var y = 0;

        if (!cel.docsGroup) {
            var docsGroup = svg.append("g");
            cel.parentNode.insertBefore(docsGroup[0][0], cel.nextSibling);

            var docsDot = docsGroup.append("circle")
                .attr("cx", x)
                .attr("cy", y)
                .attr("r", PHRASE_CIRCLE_R)
                .style("stroke", "#473f3d")
                .style("stroke-width", "2px")
                .style("fill", "none");
            cel.docsGroup = docsGroup;
        } else {
            cel.docsGroup.selectAll("path").remove();
        }

        var circleBounds = getBounds(circle);
        var center = {'x': circleBounds.left + (circleBounds.width / 2), 'y': circleBounds.top + (circleBounds.height / 2)};
        var vs = SpareribCharts.drawVSR(cel.docsGroup, x, PHRASE_CIRCLE_R, docsBraceCoords.x - (center.x - svgRect.left), docsBraceCoords.y - (center.y - svgRect.top));
        vs
            .style("stroke", "#89827b")
            .style("stroke-width", "2px")
            .attr("stroke-dasharray","2,5")
            .attr("stroke-linecap", "round");
    }

    var docsDisconnect = function(circle) {
        docsBrace.style('visibility', 'hidden');

        var group = circle[0][0].docsGroup;
        if (group) {
            group.remove();
            circle[0][0].docsGroup = null;
        }
    }
    
    force.on("tick", function(e) {
        /* collision detection */
        var q = d3.geom.quadtree(nodes),
            i = 0,
            n = nodes.length;

        _.each(nodes, function(n) {
            if (!n.fixed) q.visit(collide(n));
        });

        svg.selectAll(".circle")
            .attr("transform", function(d, i) {
                if (!d.fixed) {
                    d.x = Math.max(d.radius, Math.min(W - d.radius, d.x));
                    d.y = Math.max(d.radius, Math.min(H - d.radius - (d.x < fixedRx ? fixedRy : 0), d.y));
                }
                return "translate(" + d.x + "," + d.y + ")" 
            });

        if (phraseLine[0][0].clusterCircle) phraseConnect(d3.select(phraseLine[0][0].clusterCircle), true);
    });

    function collide(node) {
        var r = node.radius + 16,
            nx1 = node.x - r,
            nx2 = node.x + r,
            ny1 = node.y - r,
            ny2 = node.y + r;
        return function(quad, x1, y1, x2, y2) {
            if (quad.point && (quad.point !== node)) {
                var x = node.x - quad.point.x,
                    y = node.y - quad.point.y,
                    l = Math.sqrt(x * x + y * y),
                    r = node.radius + quad.point.radius;
                if (l < r) {
                    l = (l - r) / l * .5;
                    if (quad.point.fixed) {
                        /* if one of them is fixed, only move the non-fixed one */
                        node.x -= x *= l * 2;
                        node.y -= y *= l * 2;
                    } else {
                        node.x -= x *= l;
                        node.y -= y *= l;
                        quad.point.x += x;
                        quad.point.y += y;
                    }
                }
            }
            return x1 > nx2
                || x2 < nx1
                || y1 > ny2
                || y2 < ny1;
        };
    }

    var addToChain = function(clusters) {
        _.each(clusters, function(cluster) {
            var domId = "#cluster-" + cluster.id + "-" + (cluster.cutoff * 100);
            var element = svg.selectAll(domId);
            var formatElement = function() {
                element
                    .classed('in-chain', true)
                    .style('stroke-width', '2px')
                    .style('stroke', '#e9b627');
            }
            if (element.classed('group-selected')) {
                formatElement();
            } else {
                // wait for the animation to complete and check again
                setTimeout(function() {
                    if (element.classed('group-selected')) {
                        formatElement();
                    }
                }, 500)
            }
        })
    };

    var removeAllFromChain = function() {
        svg.selectAll('.in-chain')
            .classed('in-chain', false)
            .style('stroke-width', '1px')
            .style('stroke', '#eeeeee');
    }

    /* percents */
    var borders = svg.append("g").attr("opacity", 0);
    for (var i = 0; i < 5; i++) {
        if (i > 0) {
            var lineOffset = (i * ROWSIZE) + H;
            var border = borders.append("line")
                .attr("x1", PERCENT_MARGIN)
                .attr("x2", 100)
                .attr("y1", lineOffset)
                .attr("y2", lineOffset)
                .attr("stroke", "#cbc5b9")
                .attr("stroke-width", "1");
        }

        var numberOffset = ((i - .5) * ROWSIZE) + H;
        var number = borders.append("text")
            .classed('percent-' + i, true)
            .attr("x", PERCENT_MARGIN)
            .attr("y", numberOffset)
            .text((50 + (10 * i)) + "%")
            .style("stroke", "#222222")
            .style("alignment-baseline", "middle")
            .style("font-family", "helvetica, sans-serif")
            .style("font-size", "12px");
    }

    /* phrase box */
    var tpbWidth = TOTAL_W - (maxTreeSize + PERCENT_MARGIN + PERCENT_OFFSET) - 20;
    var pbWidth = Math.min(535, tpbWidth);
    var pbHeight = TOTAL_H - H - 40 - BRACE_HEIGHT;
    var pbShape = {
        'x': TOTAL_W - pbWidth,
        'y': TOTAL_H - pbHeight - 20 - BRACE_HEIGHT,
        'width': pbWidth,
        'height': pbHeight
    };
    pbShape.center = {
        'x': pbShape.x + (pbShape.width / 2),
        'y': pbShape.y + (pbShape.height / 2),
    }
    var phraseGroup = svg.append("g");
    var phraseLine = phraseGroup.append("line")
        .attr("x1", pbShape.center.x)
        .attr("y1", pbShape.center.y)
        .attr("x2", pbShape.center.x)
        .attr("y2", pbShape.center.y)
        .style("stroke", "#89827b")
        .style("stroke-width", "2px")
        .attr("stroke-dasharray","2,5")
        .attr("stroke-linecap", "round");
    phraseLine[0][0].clusterCircle = null;
    var phraseDot = phraseGroup.append("circle")
        .attr("cx", pbShape.center.x)
        .attr("cy", pbShape.center.y)
        .attr("r", PHRASE_CIRCLE_R)
        .style("stroke", "#473f3d")
        .style("stroke-width", "2px")
        .style("fill", "none");

    var phraseText = "<strong>Distinguishing phrases of selected comment group:</strong>";
    var $phraseDiv = $("<div>")
        .css({
            'position': 'absolute',
            'top': (pbShape.y + 20) + "px",
            'left': pbShape.x + "px",
            'width': (pbShape.width - 32) + "px",
            'height': (pbShape.height - 52) + "px",
            'border': "1px solid #cbc5b9",
            'font-family': "helvetica, sans-serif",
            'font-size': '12px',
            'padding': '15px',
            'overflow-y': 'auto'
        })
        .addClass("phrase-box")
        .addClass("loading")
        .html(phraseText);
    $container.append($phraseDiv);

    var docsBraceCoords = {'x': 110, 'y': TOTAL_H - BRACE_HEIGHT + 5, 'width': 215};
    var docsBrace = SpareribCharts.brace(svg, docsBraceCoords.x, docsBraceCoords.y, docsBraceCoords.width, "down");
    docsBrace.style('visibility', 'hidden');

    return {
        'addToChain': addToChain,
        'removeAllFromChain': removeAllFromChain,
        'setPhrasesLoading': function(state) {
            $phraseDiv.toggleClass("loading", state);
            // if we've loaded the phrases and there's already a circle selected, trigger hover behavior for it
            var circle = svg.selectAll('circle.selected');
            if (state && !circle.empty()) {
                $container.trigger('hovercluster', [{'clusterId': circle.attr('data-cluster-id'), 'cutoff': circle.attr('data-cluster-cutoff'), 'inChain': circle.classed('in-chain')}]);
            }
        },
        'setPhrases': function(phrases) { $phraseDiv.html(phraseText + (phrases.length ? "<ul><li>" + phrases.join("</li><li>") + "</li></ul>" : ""))},
        'select': function(id, cutoff) {
            var circle = d3.selectAll('#cluster-' + id + "-" + (100 * cutoff));
            var groupId = circle.attr('data-group-id');
            var group = d3.selectAll("#cluster-group-" + id);
            group.on("click")(group.datum(), 0, circle);
        }
    }

}

window.SpareribBubbles = {
    'drawBubbles': drawBubbles
};

})(jQuery);