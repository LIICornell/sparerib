#!/usr/bin/env ruby

# Usage:
#
# Compile all .md scripts in this directory:
#   ./compile.rb
#
# Compile a particular .md script in this directory:
#   ./compile.rb index
# or:
#   ./compile.rb index.md

require 'yaml'

name = "Docket Wrench API"
twitter = "sunlightlabs"

header = '
  <link rel="shortcut icon" type="image/ico" href="http://s3.amazonaws.com/assets.sunlightfoundation.com/brisket/1.0/images/favicon.ico">
  <link rel="stylesheet" type="text/css" href="documentup.css">
  <script type="text/javascript" src="//use.typekit.net/blp6kvr.js"></script>
  <script type="text/javascript">try{Typekit.load();}catch(e){}</script>
'

if ARGV[0]
  files = [File.basename(ARGV[0], ".md")]
else
  files = Dir.glob("*.md").map {|f| File.basename f, ".md"}
end

output_dir = ".."

files.each do |filename|
  output_file = "#{output_dir}/#{filename}.html"
  system "curl -X POST \
    --data-urlencode content@#{filename}.md \
    --data-urlencode name=\"#{name}\" \
    --data-urlencode twitter=#{twitter} \
    \"http://documentup.com/compiled\" > #{output_file}"

  content = File.read output_file

  # add in our own header (custom styles)
  content.sub! /<link.*?<\/head>/im, "#{header}\n</head>"

  content.sub! "<body><div id=\"container\">", "<body><div class=\"sf-header\"><div class=\"container\"><a class=\"sf-logo\" href=\"http://www.sunlightfoundation.com\">Sunlight Foundation</a></div></div><div id=\"container\">"

  # link the main header to the index page
  content.sub! "<a href=\"#\" id=\"logo\">", "<h1><a href=\"index.html\" id=\"logo\">"

  content.sub! "</div><ul id=\"sections\">", "</h1></div><ul id=\"sections\">"

  # custom title for non-index pages
  if filename != "index"
    title = filename.split("_").map(&:capitalize).join " "
    content.sub! "<title>#{name}</title>", "<title>#{name} | #{title}</title>"
  end

  # add mention of DocumentUp to the template, since we're not hosted there
  content.sub! /<\/iframe>.*?<\/div>/im, "</iframe></div><div class=\"thanks\">powered by <a href=\"http://documentup.com\">DocumentUp</a></div>"

  # get rid of braces around unindented (partial) JSON blocks
  content.gsub!(/(<code class=\"json\">){\s*\n([^\s])(.*?)}(<\/code>)/im) { [$1, $2, $3, $4].join("") }

  File.open(output_file, "w") {|file| file.write content}
end
