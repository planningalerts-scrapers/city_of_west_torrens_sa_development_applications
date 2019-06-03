require "epathway_scraper"

EpathwayScraper.scrape(
  "https://epathway.wtcc.sa.gov.au/ePathway/Production",
  list_type: :last_30_days
) do |record|
  if record["council_reference"] != "Not on file"
    EpathwayScraper.save(record)
  end
end
