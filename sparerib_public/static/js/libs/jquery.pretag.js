(function() {
    RegExp.escape = function(text) {
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    }

    var subinput = '<input type="text" class="ui-intertag-subinput" />';
    var tag = '<span class="ui-tag"><span class="ui-label"></span><span class="ui-icon ui-icon-close"></span></span>';

    $.fn.intertag = function(options) {
        $(this).each(function() {
            options = $.extend({
                'source': function(request, response) { response([]); },
                'addTag': function(item, fromClick) {
                    var new_tag = $(tag);
                    new_tag.find('.ui-label').html(item.label);
                    new_tag.data('value', item.value);
                    if (item.type) {
                        new_tag.addClass('ui-tag-type-' + item.type);
                    }
                    new_tag.appendTo(tags);
                    container.trigger('tagschanged');
                },
                'getTags': function() {
                    return tags.find('.ui-tag');
                },
                'clearTags': function() {
                    tags.html("");
                },
                'setText': function(text) {
                    var input = container.find("input").eq(0);
                    if (text) {
                        input.val(text);
                    }
                },
                'getText': function(text) {
                    var input = container.find("input").eq(0);
                    return input.val();
                }
            }, options);

            var container = $('<div>').addClass('ui-intertag');
            var tags = $("<div class='ui-intertag-tags'></div>");
            container.append(tags);
            container.data('intertagOptions', options);

            var $this = $(this);
            $this.replaceWith(container);

            var menu_area = $("<div>").addClass("ui-menu-area");
            container.after(menu_area);

            container.get(0).type = "taginput";

            var resize_input = function() {
                var container_width = container.width();

                tags.find('.ui-tag .ui-label').css({'max-width':''});
                
                var tags_width = tags.width() - parseInt($input.css('padding-left'));
                if (tags_width> (container_width / 2)) {
                    var itags = tags.find('.ui-tag .ui-label');
                    itags.css({'max-width': (.4 * container_width) / itags.length});
                }

                tags_width = tags.width() - parseInt($input.css('padding-left'));
                $input.width(container.width() - tags.width() - parseInt($input.css('padding-left')) - 1);
            }
            container.on('tagschanged', resize_input);

            var $input = $(subinput).addClass('ui-intertag-first').addClass('ui-intertag-last');
            container.append($input);
            var clear = $('<div>').css('clear', 'both');
            container.append(clear);

            container.trigger('tagschanged');

            var caret = 0;
            $input.autocomplete({
                source: function(request, response) {
                    caret = this.element.caret().end;

                    var nrequest = $.extend({}, request, {'term': request.term.substring(0, caret)});
                    options.source.call(this, nrequest, response);
                },
                select: function(event, ui) {
                    var $this = $(this);
                    var val = $this.val();
                    var pre_tag = val.substring(0, caret).split(new RegExp(RegExp.escape(ui.item.term) + '$', 'ig'))[0];
                    var post_tag = val.substring(caret, val.length);

                    $this.val(pre_tag + post_tag);

                    options.addTag(ui.item, true);

                    $this.focus();
                    $this.caret(pre_tag.length,pre_tag.length);

                    return false;
                },
                focus: function(event, ui) {
                    return false;
                },
                open: function(event, ui) {
                    var menu = $(this).data('autocomplete').menu.element;
                    menu.find('li').each(function(idx, item) {
                        var $item = $(item);
                        var data = $item.data('uiAutocompleteItem');
                        if (data.type) {
                            $item.addClass('ui-tag-type-' + data.type)
                        }
                    });
                    menu.width(container.width() - (parseInt(menu.css('padding-left')) + parseInt(menu.css('padding-right'))));
                },
                appendTo: menu_area,
                position: {of: menu_area}
            })
            
            var size = Math.round(.8 * parseInt($this.css('fontSize')));

            $input.on('keydown.intertag', function(e) {
                if (e.which == 8) { // backspace
                    if ($input.caret().end == 0) {
                        removeTag(tags.children().eq(-1))
                    }
                }
            })

            var removeTag = function(tag_element) {
                tag_element.remove();
                container.trigger('tagschanged');
                $input.focus();
            }

            container.on('click.intertag', '.ui-icon-close', function() {
                removeTag($(this).parents('.ui-tag'));
            });


            container.on('click.intertag', function(event) {
                if (this == event.target) {
                    var inputs = $(this).find('input');
                    var last_input = inputs.eq(inputs.length - 1);
                    last_input.focus();

                    var length = last_input.val().length;
                    last_input.caret(length, length);
                }
            });
        });
    }

    $.valHooks['taginput'] = {
        get: function(el) {
            var $el = $(el);
            var options = $el.data('intertagOptions');
            var val = {tags: []};

            options.getTags().each(function(idx, tag) {
                var item = {};
                var $tag = $(tag);
                item.label = $tag.find('.ui-label').html();
                item.value = $tag.data('value');

                var classes = $tag.eq(0).attr('class').split(/\s+/);
                var type_classes = $.grep(classes, function(c) { return c.match(/^ui-tag-type-/) });
                if (type_classes.length) {
                    item.type = type_classes[0].substring(12, type_classes[0].length);
                }
                val.tags.push(item);
            });
            
            val.text = options.getText();
            
            return val;
        },
        set: function(el, val) {
            var $el = $(el);
            var options = $el.data('intertagOptions');
            
            options.clearTags();
            $.each(val.tags ? val.tags : [], function(idx, item) {
                options.addTag(item, false);
            });
            
            options.setText(val.text);
        }
    }
})(jQuery);