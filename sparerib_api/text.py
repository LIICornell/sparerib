from djangorestframework.views import View as DRFView
from regs_models import Doc
from django.http import HttpResponse
import re
from bs4 import BeautifulSoup

class TextView(DRFView):
    def get_view(self, document_id, file_type, view_type, object_id=None):
        doc = Doc.objects.get(id=document_id)
        if view_type == 'view':
            view = [view for view in doc.views if view.type == file_type][0]
        else:
            attachment = [attachment for attachment in doc.attachments if attachment.object_id == object_id][0]
            view = [view for view in attachment.views if view.type == file_type][0]

        return view

class RawTextView(TextView):
    def get(self, request, document_id, file_type, output_format, view_type, object_id=None):
        view = self.get_view(document_id, file_type, view_type, object_id)

        if output_format == 'txt':
            return HttpResponse(view.as_text(), content_type='text/plain')
        else:
            return HttpResponse(view.as_html(), content_type='text/html')

# text beautifiers
STYLE_EMBED = BeautifulSoup("""
<link rel='stylesheet' type='text/css' href='/static/css/style_iframe.css' />
<script type="text/javascript" src="//use.typekit.net/faj8hqr.js"></script>
<script type="text/javascript">try{Typekit.load();}catch(e){}</script>
""")
FINGERPRINTS = {'html': [], 'text': []}
def fingerprint(type, pattern):
    def decorator(func):
        FINGERPRINTS[type].append((re.compile(pattern, re.DOTALL), func))
        return func
    return decorator

@fingerprint("html", r"xmlns:xalan.*<h1>PUBLIC SUBMISSION</h1>")
def regsdotgov_standard_comment(content):
    # this is a common output type for comments from FDMS; ugly, but reasonably well-structured

    d = BeautifulSoup(content)

    # strip out its stylesheet and insert ours
    d.find("style").replace_with(STYLE_EMBED)

    # tweak the title and infobox
    title = d.select("table h1")[0]
    table = title.find_parent("table")
    box = table.select("td.aligntd.outline")[0]
    
    table.replace_with(title)

    new_box = BeautifulSoup("<div class='rdg-infobox'>" + box.encode_contents() + "</div>")
    title.insert_before(new_box)

    d.find("hr").insert_before(BeautifulSoup("<div class='clear'></div>"))

    group = d.new_tag("div")
    group['class'] = 'metadata'
    for tag in list(title.next_siblings):
        if hasattr(tag, 'name') and tag.name == "hr":
            if list(group.contents):
                tag.insert_before(group)
                group = d.new_tag("div")
        elif hasattr(tag, 'name') and tag.name == "h2":
            group['class'] = tag.text.replace(" ", "-").lower()
        else:
            group.append(tag)
    title.parent.append(group)


    return unicode(d)

class PrettyTextView(TextView):
    def get(self, request, document_id, file_type, output_format, view_type, object_id=None):
        view = self.get_view(document_id, file_type, view_type, object_id)
        content = view.content.read()

        for fingerprint in FINGERPRINTS[view.mode]:
            if fingerprint[0].search(content):
                return HttpResponse(fingerprint[1](content), content_type='text/html')

        return HttpResponse(content, content_type='text/html')