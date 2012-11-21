(function($) {

W = 890;
H = 240;
var FRACTION = 0.4;
var ROWSIZE = 105;
var CHILD_MAX_R = 50;
var MAX_R = 0.4 * H;
var PERCENT_MARGIN = 10;
var PERCENT_OFFSET = 40;

var drawBubbles = function(chartElement, bubbleData) {

    // some hackery to scale radii to make the area of the circles be about FRACTION of the area of the whole view
    var areas = d3.sum(_.map(bubbleData, function(d) { return d.size * Math.PI; }));
    var areaFactor = factor = Math.sqrt(FRACTION / (areas / (W * H)));

    var firstChildren = _.reduce(_.pluck(bubbleData, "children"), function(memo, arr) { return memo.concat(arr); }, []);
    var childRadiusFactor = Math.min.apply(this, _.map(firstChildren, function(d) { return CHILD_MAX_R / Math.sqrt(d.size); }));

    var radiusFactor = Math.min.apply(this, _.map(bubbleData, function(d) { return MAX_R / Math.sqrt(d.size); }));

    var factor = _.min([radiusFactor, childRadiusFactor, areaFactor]);

    var colorScale = d3.scale.linear().domain([0.5,0.9]).range(['#bbd5d4', '#579594']);

    var svg = d3.selectAll(chartElement).append('svg')
        .classed('chart', true)
        .style('width', '1024px')
        .style('height', '768px');

    svg.append('rect')
        .attr('width', W)
        .attr('height', H)
        .style('fill', 'none')
        .style('stroke', '#000000')
        .style('stroke-width', '1');

    var xpos = 0;
    var ypos = [H / 3, (2 * H) / 3];
    var nodes = [
        /* {'radius': 0, 'x': W, 'y': 0, 'fixed': true} */
    ].concat(
        _.map(bubbleData, function(d, i) { var r = Math.sqrt(d.size) * factor; xpos += 2 * r; return {'radius': r, 'x': xpos - r, 'y': ypos[i % 2], 'source': d, 'hoverState': false}; })
    )

    var fixedRx = 0, fixedRy = 0;

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
                .attr('r', child.radius);

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
        var prect = parent[0][0].getBoundingClientRect();
        var px = (prect.left + prect.right) / 2;
        var py = (prect.top + prect.bottom) / 2;
        circles.each(function(d, i) {
            var circle = this;
            var rect = circle.getBoundingClientRect();
            var x = ((rect.left + rect.right) / 2) - px;
            var y = ((rect.top + rect.bottom) / 2) - py;
            d3.select(circle.lineToParent)
                .attr('x1', x)
                .attr('y1', y);
            _.each(circle.linesToChildren, function(line) {
                d3.select(line)
                    .attr('x2', x)
                    .attr('y2', y);
            });
        })
    }

    var mainGroup = svg.append('g');
    var circles = mainGroup.selectAll('.circle').data(nodes.slice(0)).enter()
        .append('g')
        .classed('circle', true)
        .each(function(d, i) {

            var dthis = d3.select(this);

            var lines = dthis.append("g").classed('level-lines', true);
            
            var circleSelection = dthis.append('circle')
                .classed('parent', true)
                .style('stroke', '#cccccc')
                .style('stroke-width', '1')
                .attr('r', function(d) { return d.radius - 1; });
            var circleElement = circleSelection[0][0];

            var vSelect = function(circle) {
                circle.style('fill', '#e9b627').classed('selected', true);
            }
            var vDeselect = function(circle) {
                circle.style('fill', circle.attr('data-depth-color')).classed('selected', false);
            }

            var releaseMove = function(d, i) {
                if (d.fixed) return;

                borders.transition().duration(100).attr("opacity", 0);

                var circle = mainGroup.selectAll('.parent');
                mainGroup.selectAll('.level').attr('transform', "");
                mainGroup.selectAll('.level-scale').each(function() {
                    var dthis = d3.select(this);
                    var sf = dthis.attr('data-scale-factor');
                    dthis.attr('transform', 'scale(' + sf + ',' + sf + ')');
                })
                updateLines(mainGroup.selectAll('circle'));
                var fixed = false;

                circles.each(function(_d, i) {
                    if (d === _d) return;
                    if (_d.fixed) {
                        fixed = true;
                        _d.fixed = false;
                        var cgroup = d3.select(this);
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

                if (fixed) {
                    force.resume();
                    var _this = this;
                    setTimeout(function() {
                        move.call(_this, d, i);
                    }, 250)
                } else {
                    move.call(this, d, i);
                }
            }

            var move = function(d, i) {
                if (!dthis.data()[0].hoverState) parentHoverIn.call(dthis[0][0]);

                var ts = parseFloat(dthis.attr('data-tree-size'));
                
                d.fixed = true;
                fixedRy = d.radius;
                fixedRx = Math.max(d.radius, ts / 2) + PERCENT_OFFSET;

                var ix = d3.interpolateNumber(d.x, fixedRx);
                var iy = d3.interpolateNumber(d.y, H - d.radius);

                var duration = 500;
                var ease = d3.ease("cubic-in-out");
                d3.timer(function(elapsed) {
                    var _t = elapsed / duration;
                    var t = _.min([1,_t]);
                    var e = ease(t);

                    d.x = ix(e);
                    d.y = iy(e);
                    d.px = d.x;
                    d.py = d.y;

                    if (_t > t) {
                        setTimeout(function() {
                            dthis.selectAll('circle').classed('group-selected', true);
                            vSelect(dthis.selectAll('.parent'));
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
                        var lineEnd = parseFloat(dthis.attr('data-tree-size')) + PERCENT_OFFSET + PERCENT_MARGIN;
                        borders.selectAll('line')
                            .attr('x2', lineEnd);
                        borders.selectAll('text.percent-0')
                            .attr("y", H - dthis.datum().radius);
                        
                        borders.transition().duration(100).attr('opacity', 1);
                        group.selectAll('.child-number').transition().duration(100).attr('opacity', 1);
                        
                        return true;
                    }
                });
            }
            
            var childSGroup = dthis.append("g").classed('level-scale', true).attr('opacity', '0');
            var children = drawChildren(d.source.children, childSGroup, lines);
            dthis.attr('data-tree-size', children.treeSize);

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

            updateLines(mainGroup.selectAll('circle'));

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
            };
            var childHoverOut = function() {
                var circle = d3.select(this);
                if (!circle.classed('group-selected') || circle.classed('selected')) return;

                circle.style('fill', circle.attr('data-depth-color'));
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
                    .style('fill', function(d, i) { return d3.select(this).attr('data-color'); });

                data.hoverState = false;
            };

            dthis.on('click', releaseMove)
            dthis.on('mouseover', parentHoverIn).on('mouseout', parentHoverOut);
        });

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
                .attr("stroke", "#222222")
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
}

window.SpareribBubbles = {
    'drawBubbles': drawBubbles
};

})(jQuery);