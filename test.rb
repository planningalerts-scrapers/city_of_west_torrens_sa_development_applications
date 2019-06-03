require 'scraperwiki'
require 'yaml'

File.delete("./data.sqlite") if File.exist?("./data.sqlite")

system(". ~/.nvm/nvm.sh; nvm run 10.6.0 scraper.js")

results = ScraperWiki.select("* from data order by council_reference")

File.open("results_js.yml", "w") do |f|
  f.write(results.to_yaml)
end
