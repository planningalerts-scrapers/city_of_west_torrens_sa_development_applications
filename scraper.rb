require "epathway_scraper"

EpathwayScraper.scrape_and_save(
  "https://epathway.wtcc.sa.gov.au/ePathway/Production",
  list_type: :last_30_days, state: "SA"
)
