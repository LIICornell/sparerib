##Overview

This documentation describes the API for [Docket Wrench](http://docketwrench.sunlightfoundation.com), Sunlight Foundation's regulatory comment analysis tool.
For more information about Docket Wrench, its data collection methodology, etc., see its [About page](http://docketwrench.sunlightfoundation.com)

The base url for the API is `/docketwrench.sunlightfoundation.com/api/1.0` ; any
addresses in the below must be appended to the base url. All API calls
require an active [Sunlight API
key](http://services.sunlightlabs.com/accounts/register/) as a querystring argument. For instance, a call
to describe docket EPA-HQ-OAR-2009-0234 would look like `/docket/EPA-HQ-OAR-2009-0234?apikey=[API key]`. API [methods](#methods) are described below.

<a id="methods"></a>
##API Methods