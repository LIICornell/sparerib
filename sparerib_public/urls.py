from django.conf.urls import patterns, include, url
from django.conf import settings
from django.views.generic import TemplateView

class IndexView(TemplateView):
    template_name = "sparerib/index.html"
    def get_context_data(self):
        return {"AC_URL": getattr(settings, "AC_URL", "/ac?term=")}

urlpatterns = patterns('',
    url(r'', IndexView.as_view())
)
