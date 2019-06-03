require 'scraperwiki'
require 'yaml'

File.delete("./data.sqlite") if File.exist?("./data.sqlite")

puts "Running javascript scraper..."
system(". ~/.nvm/nvm.sh; nvm run 10.6.0 scraper.js")

results_js = ScraperWiki.select("* from data order by council_reference")

ScraperWiki.close_sqlite

File.open("results_js.yml", "w") do |f|
  f.write(results_js.to_yaml)
end

File.delete("./data.sqlite") if File.exist?("./data.sqlite")

puts "Running ruby scraper..."
system("bundle exec ruby scraper.rb")

results_ruby = ScraperWiki.select("* from data order by council_reference")

File.open("results_ruby.yml", "w") do |f|
  f.write(results_ruby.to_yaml)
end

if results_ruby == results_js
  puts "Succeeded"
else
  raise "Failed"
end
