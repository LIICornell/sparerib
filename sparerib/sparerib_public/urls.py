from django.conf.urls import patterns, include, url
from django.views.generic import TemplateView

class IndexView(TemplateView):
    template_name = "sparerib/index.html"

urlpatterns = patterns('',
    url(r'^docket/(?P<docket_id>[A-Z0-9-]+$)', IndexView.as_view()),
    url(r'^document/(?P<document_id>[A-Z0-9-]+$)', IndexView.as_view()),
    url(r'^$', IndexView.as_view())
)
