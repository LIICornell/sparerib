import urllib2, json

out = open("index.md", "w")

out.write(open("boilerplate.md").read())
out.write("\n\n")

data = json.load(urllib2.urlopen("http://localhost:8005/api/1.0/iodocs"))

for method in data['endpoints'][0]['methods']:
    ps = ""
    uri = method['URI']
    for param in method['parameters']:
        ps += "<strong>%s</strong>: %s " % (param['Name'], param['Description'] if param['Description'] else '<em>No Description</em>')
        if param['Required'] == 'Y':
            ps += "<em>(path parameter; <strong>required</strong>)</em>"
        else:
            ps += "<em>(query parameter; optional)</em>"
        ps += "\n\n"

        uri = uri.replace(":%s" % param['Name'], '[%s]' % param['Name'])

    out.write("""
### %s

    %s
*Methods Supported:* GET

%s

#### Parameters
%s""" % (method['MethodName'], uri, method['Synopsis'], ps))

    