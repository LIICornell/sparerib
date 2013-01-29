D3Charts = {
    BARCHART_DEFAULTS: {
        chart_height: 195,
        chart_width: 235,
        chart_x: 215,
        chart_y: 10,
        bar_gutter: 5,
        right_gutter: 70,
        left_gutter: 15,
        row_height: 18,
        bar_height: 14,
        chart_padding: 4,
        colors : ["#efcc01", "#f27e01"],
        axis_color: "#827d7d",
        text_color: "#666666",
        link_color: "#0a6e92"
    },
    _get_barchart_size: function(opts) {
        return {
            'width': opts.chart_x + opts.chart_width + opts.right_gutter,
            'height': opts.chart_height
        }
    },
    barchart: function(div, data, opts) {
        if (typeof opts === 'undefined') opts = {};
        _.defaults(opts, D3Charts.BARCHART_DEFAULTS);

        totals = _.map(data, function(item) { return d3.sum(item.values); })

        var size = D3Charts._get_barchart_size(opts);
        var chart = d3.select('#' + div).append("svg")
            .classed("chart-canvas", true)
            .attr("width", size.width)
            .attr("height", size.height);

        var width = d3.scale.linear()
            .domain([0, d3.max(totals)])
            .range([0, opts.chart_width]);
        
        var yPos = d3.scale.ordinal()
            .domain(d3.range(totals.length))
            .rangeBands([opts.chart_y + opts.chart_padding, opts.chart_y + (opts.row_height * data.length) + opts.chart_padding]);

        
        // bars
        chart.selectAll("g")
            .data(data)
        .enter().append("g")
            .attr("transform", function(d, i) {
                return "translate(" + opts.chart_x + "," + yPos(i) + ")";
            })
        .selectAll("path")
            .data(function(d) { return _.map(_.range(d.values.length), function(j) { return d3.sum(d.values.slice(0, j + 1))}).reverse(); })
        .enter().append("path")
            .attr("d", function(d, i) {
                var x = 0;
                var y = 0;
                var h = opts.bar_height;

                var r = 4;

                var w = width(d, i);

                var array = [].concat(
                    ["M", x, y],
                    ["L", d3.max([x + w - r, 0]), y, "Q", x + w, y, x + w, y + r],
                    ["L", x + w, d3.max([y + h - r, 0]), "Q", x + w, y + h, d3.max([x + w - r, 0]), y + h],
                    ["L", x, y + h, "Z"]
                );

                return array.join(" ");
            })
            .attr("fill", function(d, i) { return opts.colors[data[0].values.length - i - 1] });
        
        // numbers
        var format = d3.format(',.0f');
        chart.selectAll("text.chart-number")
            .data(totals)
        .enter().append("text")
            .classed('chart-number', true)
            .attr("x", function(d, i) { return opts.chart_x + width(d, i) + opts.bar_gutter; })
            .attr("y", function(d, i) { return yPos(i) + yPos.rangeBand() / 2; })
            .attr("dy", ".15em") // vertical-align: middle
            .attr('fill', opts.text_color)
            .text(function(d, i) { return '$' + format(d); })
            .style('font', '11px arial,sans-serif');
        
        // labels
        chart.selectAll("g.chart-label")
            .data(data)
        .enter().append("g")
            .classed('chart-label', true)
            .attr("transform", function(d, i) { return "translate(" + opts.left_gutter + "," + (yPos(i) + yPos.rangeBand() / 2) + ")"; })
            .each(function(d, i) {
                var parent = d3.select(this);
                if (d.href) {
                    parent = parent.append("a")
                    parent.attr('xlink:href', d.href);
                }
                parent.append("text")
                    .attr("y", ".15em") // vertical-align: middle
                    .attr('fill', parent.node().tagName.toLowerCase() == 'a' ? opts.link_color : opts.text_color)
                    .text(function(d, i) { return d.name; })
                    .style('font', '11px arial,sans-serif');
            })
        
        // axes
        chart.append("line")
            .attr("x1", opts.chart_x - .5)
            .attr("x2", opts.chart_x - .5)
            .attr("y1", opts.chart_y)
            .attr("y2", opts.chart_y + (data.length * opts.row_height) + opts.chart_padding)
            .style("stroke", opts.axis_color)
            .style("stroke-width", "1");
        
        chart.append("line")
            .attr("x1", opts.chart_x)
            .attr("x2", opts.chart_x + opts.chart_width + opts.right_gutter)
            .attr("y1", opts.chart_y + (data.length * opts.row_height) + opts.chart_padding - .5)
            .attr("y2", opts.chart_y + (data.length * opts.row_height) + opts.chart_padding - .5)
            .style("stroke", opts.axis_color)
            .style("stroke-width", "1");
    },

    PIECHART_DEFAULTS: {
        chart_height: 116,
        chart_width: 240,
        chart_r: 54,
        chart_cx: 58,
        chart_cy: 58,
        colors : ["#efcc01", "#f2e388"],
        text_color: "#666666",
        amount_color: '#000000',
        row_height: 14,
        legend_padding: 15,
        legend_r: 5,
        show_legend: true,
        show_animation: true,
        sort: true
    },
    _get_piechart_size: function(opts) {
        return {
            'width': opts.chart_width,
            'height': opts.chart_height
        }
    },
    piechart: function(div, data, opts) {
        if (typeof opts === 'undefined') opts = {};
        _.defaults(opts, D3Charts.PIECHART_DEFAULTS);

        var twopi = 2 * Math.PI;
        
        var size = D3Charts._get_piechart_size(opts);
        var _div = typeof div === "string" ? d3.select("#" + div) : d3.select(div);
        var chart = _div
            .append("svg")
                .classed('chart-canvas', true)
                .attr("width", size.width)
                .attr("height", size.height);
        
        // pie
        _.each(data, function(d, i) { d.color = opts.colors[i]; });
        if (opts.sort) data = _.sortBy(data, function(d) { return d.value; }).reverse();
        var values = _.map(data, function(d) { return d.value; })

        var aScale = d3.scale.linear()
            .domain([0, d3.sum(values)])
            .range([0, twopi]);
        
        var marker = -1 * aScale(values[0]) / 2;
        var sectors = []
        for (var i = 0; i < values.length; i++) {
            var sector = {
                'startAngle': marker,
                'innerRadius': 0,
                'outerRadius': opts.chart_r
            }
            marker += aScale(values[i]);
            sector['endAngle'] = marker;
            sectors.push(sector);
        }

        var circle = chart.append("g")
                .attr("transform", "translate(" + opts.chart_cx + "," + opts.chart_cy + ")")

        var arc = d3.svg.arc();
                            
        var arcs = circle.selectAll("g.slice")
            .data(sectors)
            .enter()
                .append("g")
                .classed("slice", true)
                .attr("data-slice", function(d, i) { return i; });
            
            var paths = arcs.append("path")
                .attr("fill", function(d, i) { return data[i].color; } )
                .attr("d", arc)
                .each(function(d, i) {
                    d3.select(this).classed("slice-" + data[i].key, true);
                });

            if (opts.show_animation) {
                paths.on("mouseover", function(d, i) {
                    chart.selectAll('g[data-slice="' + i + '"] path')
                        .attr('transform', 'scale(1.05)');
                    chart.selectAll('g[data-slice="' + i + '"] circle')
                        .attr('transform', 'scale(1.5)');
                    chart.selectAll('text[data-slice="' + i + '"]')
                        .style('display', null);
                    chart.selectAll('g[data-slice="' + i + '"] text')
                        .style('font-weight', 'bold');
                })
                .on("mouseout", function(d, i) {
                    chart.selectAll('g[data-slice="' + i + '"] path, g[data-slice="' + i + '"] circle')
                        .transition()
                            .duration(200)
                            .attr('transform', 'scale(1)');
                    chart.selectAll('text[data-slice="' + i + '"]')
                        .style('display', 'none');
                    chart.selectAll('g[data-slice="' + i + '"] text')
                        .style('font-weight', null);
                });
            }


            /* arcs.append("text")
                .attr("transform", function(d) {
                    //we have to make sure to set these before calling arc.centroid
                    d.innerRadius = 0;
                    d.outerRadius = opts.chart_r;
                    return "translate(" + arc.centroid(d) + ")";
                })
                .attr("text-anchor", "middle")
                .text(function(d, i) { return data[i].key; })
                .attr('fill', opts.text_color)
                .style('font', '11px arial,sans-serif'); */
        
        if (opts.show_legend) {
            // legend
            var legend_x = opts.chart_cx + opts.chart_r + opts.legend_padding;
            var legend_y = opts.chart_cy - (data.length * opts.row_height / 2);
            var legend = chart.append("g")
                .attr("transform", "translate(" + legend_x + "," + legend_y + ")");
            
            var sum = d3.sum(values);
            var legendItems = legend.selectAll("g.legend-item")
                .data(data)
                .enter()
                    .append("g")
                    .classed("legend-item", true)
                    .attr("data-slice", function(d, i) { return i; })
                    .attr("transform", function(d, i) { return "translate(0," + ((i + .5) * opts.row_height) + ")"; })
            
                legendItems.append("circle")
                    .attr("fill", function(d, i) { return d.color; })
                    .attr("cx", 0)
                    .attr("cy", 0)
                    .attr("r", opts.legend_r);
                
                legendItems.append("text")
                    .attr("y", ".45em") // vertical-align: middle
                    .attr("x", opts.legend_padding)
                    .attr('fill', opts.text_color)
                    .text(function(d, i) { return d.key? d.key + " (" + Math.round(100 * d.value / sum) + "%)" : ""; })
                    .style('font', '11px arial,sans-serif');
        }
        
        if (opts.show_animation) {
            // amounts
            var format = d3.format(',.0f');
            var amounts = chart.selectAll("text.amount")
                .data(data)
                .enter()
                    .append("text")
                    .classed("amount", true)
                    .attr("x", opts.chart_cx)
                    .attr("y", opts.chart_cy)
                    .attr("dy", ".5em") // vertical-align: middle
                    .attr('fill', opts.amount_color)
                    .attr('data-slice', function(d, i) { return i; })
                    .text(function(d, i) { return format(d.value); })
                    .style('font', 'bold 12px arial,sans-serif')
                    .style('text-anchor', 'middle')
                    .style('display', 'none');
        }

        return chart;
    },
    TIMELINE_DEFAULTS: {
        chart_height: 195,
        chart_width: 300,
        chart_x: 85,
        chart_y: 10,
        right_gutter: 135,
        label_padding: 10,
        box_label_padding: 5,
        box_label_max_width: 200,
        show_legend: 'left',
        legend_padding: 15,
        legend_r: 5,
        dot_r: 5,
        row_height: 14,
        colors : ["#e96d24", "#15576e", "#f2e388", "#f2f1e4", "#efcc01"],
        axis_color: "#827d7d",
        tick_color: '#dcddde',
        text_color: "#666666",
        link_color: "#0a6e92",
        tick_length: 5,
        overlay_colors: {},
        x_tick_count: 5,
        y_tick_count: 5,
        stroke_width: 3,
        overlay_stroke_width: 2
    },
    _get_timeline_size: function(opts) {
        return {
            'width': opts.chart_x + opts.chart_width + opts.right_gutter,
            'height': opts.chart_y + opts.chart_height + opts.tick_length + opts.label_padding + opts.row_height + (opts.show_legend == 'bottom' ? opts.legend_padding + opts.row_height : 0)
        }
    },
    _timeline_tick_format: function(ticks) {
        /* swiped from d3 and tweaked */
        var formats = [
          [d3.time.format.utc("%Y"), function(d) { return true; }],
          [d3.time.format.utc("%b %Y"), function(d) { return d.getUTCMonth(); }],
          [d3.time.format.utc("%b %d, %Y"), function(d) { return d.getUTCDate() != 1; }],
          [d3.time.format.utc("%a %d"), function(d) { return d.getUTCDay() && d.getUTCDate() != 1; }],
          [d3.time.format.utc("%I %p"), function(d) { return d.getUTCHours(); }],
          [d3.time.format.utc("%I:%M"), function(d) { return d.getUTCMinutes(); }],
          [d3.time.format.utc(":%S"), function(d) { return d.getUTCSeconds(); }],
          [d3.time.format.utc(".%L"), function(d) { return d.getUTCMilliseconds(); }]
        ];

         
        var level = 0;
        _.each(ticks, function(date) {
            var i = formats.length - 1, f = formats[i];
            while (!f[1](date)) f = formats[--i];
            level = Math.max(level, i);
        });
        return formats[level][0];
    },
    timeline_chart: function(div, data, opts) {
        if (typeof opts === 'undefined') opts = {};
        _.defaults(opts, D3Charts.TIMELINE_DEFAULTS);

        var size = D3Charts._get_timeline_size(opts);
        var _div = d3.select('#' + div).style('position', 'relative');
        var chart = _div.append("svg")
            .classed("chart-canvas", true)
            .attr("width", size.width)
            .attr("height", size.height);
        
        // scalers
        var all_timelines = _.flatten(_.map(data, function(d) { return d.timeline; }));
        y = d3.scale.linear().domain([0, d3.max(_.map(all_timelines, function(d) { return d.count; }))]).range([opts.chart_height, 0]);

        var all_dates = _.flatten(_.map(all_timelines, function(d) { return [new Date(d.date_range[0]), new Date(d.date_range[1])]; }));
        x = d3.time.scale.utc().domain([d3.min(all_dates), d3.max(all_dates)]).range([opts.chart_x, opts.chart_x + opts.chart_width]);

        // attach mean dates to all the data to make the rest of it easier, and tack zeros onto the beginning and end
        _.each(data, function(series) {
            _.each(series.timeline, function(point) {
                var d0 = new Date(point.date_range[0]), d1 = new Date(point.date_range[1]);
                point.mean_date = new Date(d0.getTime() + ((d1 - d0)/2));
            })

            series.timeline = [{'count': 0, 'mean_date': new Date(series.timeline[0].date_range[0])}].concat(series.timeline, [{'count': 0, 'mean_date': new Date(series.timeline[series.timeline.length - 1].date_range[1])}])
        })

        // y-ticks
        var y_ticks = chart.append('g')
            .classed('ticks', true)
            .attr('transform', 'translate(0,' + (opts.chart_y) + ')')
            .selectAll('line.graph-tick')
            .data(y.ticks(opts.y_tick_count))
            .enter();
                y_ticks.append('line')
                    .classed('graph-tick', true)
                    .attr("x1", opts.chart_x - opts.tick_length)
                    .attr("x2", opts.chart_x + opts.chart_width)
                    .attr("y1", y)
                    .attr("y2", y)
                    .style("stroke", function(d, i) { return i == 0 ? opts.axis_color : opts.tick_color })
                    .style("stroke-width", "1")
                var format = d3.format(',.0f');
                y_ticks.append('text')
                    .classed('chart-number', true)
                    .attr("x", opts.chart_x - opts.label_padding)
                    .attr("y", y)
                    .attr("dy", ".45em") // vertical-align: middle
                    .attr('fill', opts.text_color)
                    .text(function(d, i) { return format(d); })
                    .style('font', '11px arial,sans-serif')
                    .style('text-anchor', 'end');
        
        // x-ticks
        var x_tick_dates = x.ticks(opts.x_tick_count);
        var tickFormat = D3Charts._timeline_tick_format(x_tick_dates);
        var x_ticks = chart.append('g')
            .classed('ticks', true)
            .selectAll('line.graph-tick')
            .data(x_tick_dates)
            .enter();
                x_ticks.append('line')
                    .classed('graph-tick', true)
                    .attr("x1", x)
                    .attr("x2", x)
                    .attr("y1", opts.chart_y + opts.chart_height)
                    .attr("y2", opts.chart_y + opts.chart_height + opts.tick_length)
                    .style("stroke", opts.axis_color)
                    .style("stroke-width", "1")
                x_ticks.append('text')
                    .classed('chart-number', true)
                    .attr("x", x)
                    .attr("y", opts.chart_y + opts.chart_height + opts.tick_length + opts.label_padding)
                    .attr("dy", ".45em") // vertical-align: middle
                    .attr('fill', opts.text_color)
                    .text(function(d, i) { return tickFormat(d); })
                    .style('font', '11px arial,sans-serif')
                    .style('text-anchor', 'middle');
        
        // lines
        var line = d3.svg.line()
            .x(function(d,i) { return x(d.mean_date); })
            .y(function(d,i) { return y(d.count); })
            .interpolate('monotone');
        
        chart.append('g')
            .classed('lines', true)
            .attr('transform', 'translate(0,' + (opts.chart_y) + ')')
            .selectAll('path.graph-line')
            .data(data)
                .enter()
                .append('path')
                .classed('graph-line', true)
                .attr('d', function(d, i) { return line(d.timeline); })
                .style('stroke-width', opts.stroke_width)
                .style('stroke', function(d, i) { return opts.colors[i]; })
                .style('fill-opacity', 0);
        
        // floating box
        var make_box = function(x, y, color, text, left) {
            if (typeof left === "undefined") {
                left = true;
            }

            var box = _div.append('div')
                .classed('graph-float', true);
                            
            var label = box.append("span")
                .classed('chart-number', true)
                .text(text)
                .style('color', opts.text_color);
            
            var width = Math.min(label.node().getClientRects()[0].width, opts.box_label_max_width);
            box.style('width', width + 'px')
                .style('background', '#fff')
                .style('border', "1px solid " + color)
                .style('position', 'absolute')
                .style('padding', opts.box_label_padding + 'px')
                .style('font', '11px arial,sans-serif');

            box.style('top', y - ((box.node().getClientRects()[0].height) / 2) + 'px');
            if (left) {
                box.style('left', (x - width - (2 * opts.label_padding)) + 'px');
            } else {
                box.style('left', (parseFloat(x) + opts.label_padding) + 'px');
            }
            
            return box;
        };

        // dots
        var dotMouseOver = function(d, i) {
            var dthis = d3.select(this);
            var parent = d3.select(this.parentNode);
            var overlay = parent.classed('overlay');

            var series = parent.attr('data-series');
            var color = overlay ? dthis.attr('stroke') : opts.colors[parseInt(series)];
            dthis.attr('data-default-fill', dthis.attr('fill'));
            dthis.attr('fill', color);
            this.floatingBox = overlay ?
                make_box(dthis.attr('cx'), parseFloat(dthis.attr('cy')), color, d.name, false) :
                make_box(dthis.attr('cx'), parseFloat(dthis.attr('cy')) + opts.chart_y, color, format(d.count));

            var item = chart.selectAll("g.legend-item" + (overlay ?
                '.legend-overlay[data-series="' + series + '"][data-type="' + parent.attr('data-type') + '"]' :
                '.legend-timeline[data-series="' + series + '"]'
            ));

            var circle = item.selectAll('circle')
                .attr('transform', 'scale(1.5)');
            circle.node() && clearTimeout(circle.node().timeout);
            item.selectAll('text')
                .style('font-weight', 'bold');
        }, dotMouseOut = function(d, i) {
            var dthis = d3.select(this);
            var parent = d3.select(this.parentNode);
            var overlay = parent.classed('overlay');

            var series = d3.select(this.parentNode).attr('data-series');
            d3.select(this).attr("fill", dthis.attr('data-default-fill'));
            this.floatingBox.remove();

            var item = chart.selectAll("g.legend-item" + (overlay ?
                '.legend-overlay[data-series="' + series + '"][data-type="' + parent.attr('data-type') + '"]' :
                '.legend-timeline[data-series="' + series + '"]'
            ));

            var circle = item.selectAll('circle');
            if (circle.node()) circle.node().timeout = setTimeout(function() {
                circle.transition()
                    .duration(200)
                    .attr('transform', 'scale(1)');
                item.selectAll('text')
                    .style('font-weight', null);
            }, 100)
        };

        chart.append('g')
            .classed('graph-dots', true)
            .attr('transform', 'translate(0,' + (opts.chart_y) + ')')
            .selectAll('g.series-dots')
            .data(data)
                .enter()
                .append('g')
                .attr('data-series', function(d, i) { return i; })
                .classed('series-dots', true)
                .selectAll('circle')
                .data(function(d, i) { return d.timeline; })
                .enter()
                    .append('circle')
                    .attr("fill", function(d, i) { return d.selected ? opts.colors[parseInt(d3.select(this.parentNode).attr('data-series'))] : 'rgba(0,0,0,0)'; })
                    .attr("cx", function(d,i) { return x(d.mean_date); })
                    .attr("cy", function(d,i) { return y(d.count); })
                    .attr("r", function(d, i) { return d.selected ? 2 * opts.overlay_stroke_width : opts.dot_r; })
                    .style('stroke', 'rgba(0,0,0,0)')
                    .style('stroke-width', 8)
                    .on('mouseover', dotMouseOver)
                    .on('mouseout', dotMouseOut);

        // axes
        chart.append("line")
            .attr("x1", opts.chart_x - .5)
            .attr("x2", opts.chart_x - .5)
            .attr("y1", opts.chart_y)
            .attr("y2", opts.chart_y + opts.chart_height + opts.tick_length)
            .style("stroke", opts.axis_color)
            .style("stroke-width", "1");
        
        // overlays
        var overlayGroups = chart.selectAll("g.overlay-group")
            .data(data)
            .enter()
            .append("g")
            .classed("overlay-group", true)
            .each(function(d, i) {
                if (typeof d.overlays !== "undefined" && d.overlays) {
                    var group = d3.select(this).selectAll("g.overlay")
                        .data(d.overlays.slice(0,10))
                        .enter()
                        .append("g")
                        .classed("overlay", true)
                        .attr('data-series', i)
                        .attr("data-type", function(d, i) { return d.type; })
                        .each(function(d, i) {
                            var overlay = d3.select(this);
                            var x1 = x(new Date(d.date_range[0]));
                            var x2 = d.date_range[1] ? x(new Date(d.date_range[1])) : null;
                            var y0 = ((1 - (0.05 * (i + 1))) * opts.chart_height) + opts.chart_y;
                            var color = typeof opts.overlay_colors[d.type] === "undefined" ? "red": opts.overlay_colors[d.type];

                            if (x2) {
                                // horizontal long line
                                overlay.append("line")
                                    .attr("x1", x1)
                                    .attr("x2", x2)
                                    .attr("y1", y0)
                                    .attr("y2", y0)
                                    .style("stroke", color)
                                    .style("stroke-width", d.selected ? 2 * opts.overlay_stroke_width : opts.overlay_stroke_width);

                                // vertical end-tick
                                overlay.append("line")
                                    .attr("x1", x2)
                                    .attr("x2", x2)
                                    .attr("y1", y0 - opts.tick_length)
                                    .attr("y2", y0 + opts.tick_length)
                                    .style("stroke", color)
                                    .style("stroke-width", d.selected ? 2 * opts.overlay_stroke_width : opts.overlay_stroke_width);

                            }
                            // start circle
                            overlay.append("circle")
                                .attr("cx", x1)
                                .attr("cy", y0)
                                .attr("r", opts.dot_r)
                                .attr("stroke", color)
                                .attr("fill", "#ffffff")
                                .style("stroke-width", d.selected ? 2 * opts.overlay_stroke_width : opts.overlay_stroke_width)
                                .on('mouseover', dotMouseOver)
                                .on('mouseout', dotMouseOut);
                    });

                }
            })

        // legend
        if (opts.show_legend) {
            if (opts.show_legend == 'left') {
                var legend_x = opts.chart_x + opts.chart_width + opts.legend_padding;
                var legend_y = opts.chart_y + (opts.chart_height / 2) - (data.length * opts.row_height / 2);
            } else {
                var legend_x = opts.chart_x;
                var legend_y = opts.chart_y + opts.chart_height + opts.label_padding + (2 * opts.legend_padding);
            }
            var legend = chart.append("g")
                .attr("transform", "translate(" + legend_x + "," + legend_y + ")");
            
            if (opts.show_legend == 'left') {
                var legend_offset = .5 * opts.row_height;
            } else {
                var legend_offset = 0;
            }

            var legendSeries = legend.selectAll("g.legend-series")
                .data(data)
                .enter()
                    .append("g")
                    .classed("legend-series", true)
                    .attr("data-series", function(d, i) { return i; });

            var legendItems = legendSeries.selectAll("g.legend-item")
                .data(function(d, i) { return [d].concat(typeof d.overlays !== "undefined" && d.overlays.length ?
                    _.uniq(d.overlays, false, function(x) { return x.type }) :
                    []
                )})
                .enter()
                    .append("g")
                    .classed("legend-item", true)
                    .each(function(d, i) {
                        var dthis = d3.select(this);
                        dthis.attr('data-series', d3.select(this.parentNode).attr('data-series'));
                        if (i == 0) {
                            dthis.classed('legend-timeline', true);
                        } else {
                            dthis.classed('legend-overlay', true);
                            dthis.attr('data-type', d.type);
                        }
                    })
            
                legendItems.append("circle")
                    .attr("fill", function(d, i) { return i == 0 ?
                        opts.colors[parseInt(d3.select(this.parentNode.parentNode).attr("data-series"))] : 
                        typeof opts.overlay_colors[d.type] === "undefined" ? "red": opts.overlay_colors[d.type];
                    })
                    .attr("cx", 0)
                    .attr("cy", 0)
                    .attr("r", opts.legend_r)
                    .each(function() {
                        this.timeout = null;
                    })
                
                legendItems.each(function(d, i) {
                    var parent = d3.select(this);

                    if (d.href) {
                        parent = parent.append("a")
                        parent.attr('xlink:href', d.href);
                    }
                
                    var text = parent.append("text")
                        .attr("y", ".45em") // vertical-align: middle
                        .attr("x", opts.legend_padding)
                        .attr('fill', parent.node().tagName.toLowerCase() == 'a' ? opts.link_color : opts.text_color)
                        .text(function(d, i) { return d.timeline ? d.name : d.type_label; })
                        .style('font', '11px arial,sans-serif');

                    // do this in a timeout to make sure we can computer the lengths accurately
                    setTimeout(function() {
                        if (opts.show_legend == 'left') {
                            parent.attr("transform", "translate(0," + legend_offset + ")");
                            legend_offset += opts.row_height;
                        } else {
                            parent.attr("transform", "translate(" + legend_offset + ",0)");
                            legend_offset += (2 * opts.legend_r) + (3 * opts.legend_padding) + text.node().getComputedTextLength();
                        }
                    }, 0);
                });
        }
    }
}

SpareribCharts = {
    type_colors: {"public_submission": "#899553", "proposed_rule": "#EBB701", "rule" : "#539594", 'supporting_material': '#cccccc', 'other': '#333333', 'notice': '#47535F'},
    type_breakdown_piechart: function(div, data) { 
        var in_data = []

        var opts = {
            chart_height: 250,
            chart_width: 420,
            chart_r: 80,
            chart_cx: 84,
            chart_cy: 104,
            colors : [],
            text_color: "#666666",
            amount_color: '#000000',
            row_height: 14,
            legend_padding: 15,
            legend_r: 5
        }

        _.each(data, function(row) {
            if (row['count'] > 0 && row['type'] != 'None') {
                in_data.push({'key': row['type'].replace('_', ' '), 'value': row['count']});
                opts.colors.push(SpareribCharts.type_colors[row['type']]);
            }
        })
        D3Charts.piechart(div, in_data, opts);
    },
    cluster_colors: {"clustered": "#e9b627", "unclustered": "#579594"},
    cluster_piechart: function(div, data) {
        var in_data = []

        var opts = {
            chart_height: 275,
            chart_width: 890,
            chart_r: 70,
            chart_cx: 445,
            chart_cy: 120,
            colors : [],
            text_color: "#666666",
            amount_color: '#000000',
            row_height: 14,
            legend_padding: 15,
            legend_r: 5,
            show_legend: false,
            show_animation: false,
            sort: false
        }

        _.each(data, function(row) {
            if (row['percentage'] > 0 && row['type'] != 'None') {
                in_data.push({'key': row['type'].replace('_', ' '), 'value': row['percentage']});
                opts.colors.push(SpareribCharts.cluster_colors[row['type']]);
            }
        })
        return D3Charts.piechart(div, in_data, opts);
    },
    timeline_chart: function(div, data, in_opts) {
        var opts = {
            chart_height: 125,
            chart_width: 515,
            chart_x: 40,
            chart_y: 5,
            right_gutter: 5,
            label_padding: 10,
            legend_padding: 15,
            legend_r: 5,
            dot_r: 5,
            row_height: 14,
            colors : [SpareribCharts.type_colors.public_submission, SpareribCharts.type_colors.notice, SpareribCharts.type_colors.rule],
            axis_color: "#827d7d",
            tick_color: '#dcddde',
            text_color: "#666666",
            link_color: "#0a6e92",
            tick_length: 5,
            overlay_colors: SpareribCharts.type_colors,
            show_legend: 'bottom'
        }
        if (typeof in_opts !== "undefined") {
            opts = _.extend(opts, in_opts);
        }

        D3Charts.timeline_chart(div, data, opts);
    },
    tiny_timeline_chart: function(div, data) {
        var opts = {
            chart_height: 45,
            chart_width: 180,
            chart_x: 40,
            chart_y: 5,
            right_gutter: 5,
            label_padding: 10,
            legend_padding: 15,
            legend_r: 3,
            dot_r: 3,
            row_height: 14,
            colors : [SpareribCharts.type_colors.public_submission, SpareribCharts.type_colors.notice, SpareribCharts.type_colors.rule],
            axis_color: "#827d7d",
            tick_color: '#dcddde',
            text_color: "#666666",
            link_color: "#0a6e92",
            tick_length: 5,
            overlay_colors: SpareribCharts.type_colors,
            show_legend: false,
            x_tick_count: 2,
            y_tick_count: 2,
            stroke_width: 2,
            overlay_stroke_width: 2
        }

        D3Charts.timeline_chart(div, data, opts);
    },
    brace: function(svg, x, y, width, direction) {
        var CURVE_R = 15;

        var arm = width / 2;
        var armf = Math.max(arm - (2 * CURVE_R), 0);

        var transforms = {
            'down': "",
            'up': "rotate(180," + x + ", " + y + ")",
            'left': "rotate(90," + x + ", " + y + ")",
            'right': "rotate(270," + x + ", " + y + ")"
        }

        return svg.append("path")
            .style("stroke", "#cbc5b9")
            .style("stroke-width", "1px")
            .style("fill", "none")
            .attr("d",
                "M" + x + "," + y + " " +
                "a " + CURVE_R + "," + CURVE_R + " 0 0,0 " + CURVE_R + "," + CURVE_R + " " +
                "l " + armf + ",0 " +
                "a " + CURVE_R + "," + CURVE_R + " 0 0,1 " + CURVE_R + "," + CURVE_R + " " +
                "M" + x + "," + y + " " +
                "a " + CURVE_R + "," + CURVE_R + " 0 0,1 -" + CURVE_R + "," + CURVE_R + " " +
                "l -" + armf + ",0 " +
                "a " + CURVE_R + "," + CURVE_R + " 0 0,0 -" + CURVE_R + "," + CURVE_R + " "
            )
            .attr("transform", transforms[direction]);
    },
    drawHS: function(svg, x1, y1, x2, y2) {
        var xm = (x1 + x2) / 2;
        var ym = (y1 + y2) / 2;

        return svg.append("path")
            .style("stroke", "#cbc5b9")
            .style("stroke-width", "1px")
            .style("fill", "none")
            .attr("d",
                "M" + x1 + "," + y1 + " " +
                "Q" + xm + "," + y1 + " " + xm + "," + ym + " " +
                "Q" + xm + "," + y2 + " " + x2 + "," + y2
            );
    },
    drawVS: function(svg, x1, y1, x2, y2) {
        var xm = (x1 + x2) / 2;
        var ym = (y1 + y2) / 2;

        return svg.append("path")
            .style("stroke", "#cbc5b9")
            .style("stroke-width", "1px")
            .style("fill", "none")
            .attr("d",
                "M" + x1 + "," + y1 + " " +
                "Q" + x1 + "," + ym + " " + xm + "," + ym + " " +
                "Q" + x2 + "," + ym + " " + x2 + "," + y2
            );
    },
    drawVSR: function(svg, x1, y1, x2, y2) {
        var A = 100;
        var xm = (x1 + x2) / 2;
        var ym = (y1 + y2) / 2;

        if (y2 > y1) {
            var a = Math.min(A, ym - y1);
            var yr = y1 + a;
            var ys = y2 - a;
        } else {
            var a = Math.min(A, ym - y2);
            var yr = y1 - a;
            var ys = y2 + a;
        }

        return svg.append("path")
            .style("stroke", "#cbc5b9")
            .style("stroke-width", "1px")
            .style("fill", "none")
            .attr("d",
                "M" + x1 + "," + y1 + " " +
                "Q" + x1 + "," + yr + " " + xm + "," + ym + " " +
                "Q" + x2 + "," + ys + " " + x2 + "," + y2
            );
    }
}