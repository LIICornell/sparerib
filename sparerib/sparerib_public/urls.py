from django.conf.urls import patterns, include, url
from django.views.generic import TemplateView

class IndexView(TemplateView):
    template_name = "sparerib/index.html"

urlpatterns = patterns('',
    url(r'', IndexView.as_view())
)
