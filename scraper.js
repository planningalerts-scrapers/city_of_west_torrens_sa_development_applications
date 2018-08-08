// Parses the development applications at the South Australian City of West Torrens web site and
// places them in a database.
//
// In each VSCode session: to automatically compile this TypeScript script into JavaScript whenever
// the TypeScript is changed and saved, press Ctrl+Shift+B and select "tsc:watch - tsconfig.json".
// This starts a task that watches for changes to the TypeScript script.
//
// Michael Bone
// 5th August 2018
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cheerio = require("cheerio");
const request = require("request-promise-native");
const sqlite3 = require("sqlite3");
const moment = require("moment");
sqlite3.verbose();
const DevelopmentApplicationsDefaultUrl = "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/default.aspx";
const DevelopmentApplicationsEnquiryListsUrl = "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquiryLists.aspx";
const DevelopmentApplicationsEnquirySearchUrl = "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquirySearch.aspx";
const DevelopmentApplicationsEnquirySummaryViewUrl = "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquirySummaryView.aspx";
const CommentUrl = "mailto:csu@wtcc.sa.gov.au";
// Sets up an sqlite database.
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        let database = new sqlite3.Database("data.sqlite");
        database.serialize(() => {
            database.run("create table if not exists [data] ([council_reference] text primary key, [address] text, [description] text, [info_url] text, [comment_url] text, [date_scraped] text, [date_received] text, [on_notice_from] text, [on_notice_to] text)");
            resolve(database);
        });
    });
}
// Inserts a row in the database if it does not already exist.
async function insertRow(database, developmentApplication) {
    return new Promise((resolve, reject) => {
        let sqlStatement = database.prepare("insert or ignore into [data] values (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        sqlStatement.run([
            developmentApplication.applicationNumber,
            developmentApplication.address,
            developmentApplication.reason,
            developmentApplication.informationUrl,
            developmentApplication.commentUrl,
            developmentApplication.scrapeDate,
            developmentApplication.receivedDate,
            null,
            null
        ], function (error, row) {
            if (error) {
                console.error(error);
                reject(error);
            }
            else {
                if (this.changes > 0)
                    console.log(`    Inserted: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" into the database.`);
                else
                    console.log(`    Skipped: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" because it was already present in the database.`);
                sqlStatement.finalize(); // releases any locks
                resolve(row);
            }
        });
    });
}
// Parses the "js=" token from a page.
function parseToken(body) {
    let $ = cheerio.load(body);
    for (let script of $("script").get()) {
        let text = $(script).text();
        let startIndex = text.indexOf(".aspx?js=");
        if (startIndex >= 0) {
            startIndex += ".aspx?js=".length;
            let endIndex = text.replace(/"/g, "'").indexOf("'", startIndex);
            if (endIndex > startIndex)
                return text.substring(startIndex, endIndex);
        }
    }
    return null;
}
// Parses the development applications.
async function main() {
    // Ensure that the database exists.
    let database = await initializeDatabase();
    // Create one cookie jar and use it throughout.
    let jar = request.jar();
    // Retrieve the main page.
    console.log(`Retrieving page: ${DevelopmentApplicationsDefaultUrl}`);
    let body = await request({
        url: DevelopmentApplicationsDefaultUrl,
        jar: jar
    });
    // Obtain the "js=" token from the page and re-submit the page with the token in the query
    // string.  This then indicates that JavaScript is available in the "client" and so all
    // subsequent pages served by the web server will include JavaScript.
    let token = parseToken(body);
    if (token !== null) {
        let tokenUrl = `${DevelopmentApplicationsDefaultUrl}?js=${token}`;
        console.log(`Retrieving page: ${tokenUrl}`);
        await request({
            url: tokenUrl,
            jar: jar
        });
    }
    // Retrieve the enquiry page.
    console.log(`Retrieving page: ${DevelopmentApplicationsEnquiryListsUrl}`);
    body = await request({
        url: DevelopmentApplicationsEnquiryListsUrl,
        jar: jar
    });
    let $ = cheerio.load(body);
    let eventValidation = $("input[name='__EVENTVALIDATION']").val();
    let viewState = $("input[name='__VIEWSTATE']").val();
    // Click the "Date" tab.
    console.log("Switching to the \"Date\" tab.");
    body = await request({
        url: DevelopmentApplicationsEnquirySearchUrl,
        jar: jar,
        method: "POST",
        followAllRedirects: true,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        form: {
            __EVENTARGUMENT: "2",
            __EVENTTARGET: "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$tabControlMenu",
            __EVENTVALIDATION: eventValidation,
            __LASTFOCUS: "",
            __VIEWSTATE: viewState,
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mEnquiryListsDropDownList": 10,
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$ctl04$mFormattedNumberTextBox": ""
        }
    });
    $ = cheerio.load(body);
    eventValidation = $("input[name='__EVENTVALIDATION']").val();
    viewState = $("input[name='__VIEWSTATE']").val();
    // Search for development applications in a date range.
    let dateFrom = moment().subtract(1, "months").format("DD/MM/YYYY");
    let dateTo = moment().format("DD/MM/YYYY");
    console.log(`Searching for applications in the date range ${dateFrom} to ${dateTo}.`);
    body = await request({
        url: DevelopmentApplicationsEnquirySearchUrl,
        jar: jar,
        method: "POST",
        followAllRedirects: true,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        form: {
            __EVENTVALIDATION: eventValidation,
            __VIEWSTATE: viewState,
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mEnquiryListsDropDownList": "10",
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mSearchButton": "Search",
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$ctl14$DateSearchRadioGroup": "mLast30RadioButton",
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$ctl14$mFromDatePicker$dateTextBox": dateFrom,
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$ctl14$mToDatePicker$dateTextBox": dateTo
        }
    });
    $ = cheerio.load(body);
    eventValidation = $("input[name='__EVENTVALIDATION']").val();
    viewState = $("input[name='__VIEWSTATE']").val();
    // Prepare to process multiple pages of results.  Determine the page count from the first page.
    let pageNumber = 1;
    let pageCount = $("a.otherpagenumber").get().length + 1;
    do {
        // Parse a page of development applications.
        console.log(`Parsing page ${pageNumber} of ${pageCount}.`);
        pageNumber++;
        for (let tableRow of $("tr").get()) {
            let tableCells = $(tableRow).children("td").get();
            if (tableCells.length >= 4) {
                let applicationNumber = $(tableCells[0]).text().trim();
                let receivedDate = moment($(tableCells[1]).text().trim(), "D/MM/YYYY", true); // allows the leading zero of the day to be omitted
                let reason = $(tableCells[2]).text().trim();
                let address = $(tableCells[3]).text().trim();
                if (/[0-9]+\/[0-9]+.*/.test(applicationNumber) && receivedDate.isValid()) {
                    await insertRow(database, {
                        applicationNumber: applicationNumber,
                        address: address,
                        reason: reason,
                        informationUrl: DevelopmentApplicationsDefaultUrl,
                        commentUrl: CommentUrl,
                        scrapeDate: moment().format("YYYY-MM-DD"),
                        receivedDate: receivedDate.isValid() ? receivedDate.format("YYYY-MM-DD") : ""
                    });
                }
            }
        }
        if (pageNumber > pageCount)
            break;
        // Navigate to the next page of development applications.
        console.log(`Retrieving the next page of applications (page ${pageNumber} of ${pageCount}).`);
        body = await request({
            url: `${DevelopmentApplicationsEnquirySummaryViewUrl}?PageNumber=${pageNumber}`,
            jar: jar,
            method: "POST",
            followAllRedirects: true,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            form: {
                __EVENTARGUMENT: "",
                __EVENTTARGET: `ctl00$MainBodyContent$mPagingControl$pageButton_${pageNumber}`,
                __EVENTVALIDATION: eventValidation,
                __LASTFOCUS: "",
                __VIEWSTATE: viewState
            }
        });
        $ = cheerio.load(body);
        eventValidation = $("input[name='__EVENTVALIDATION']").val();
        viewState = $("input[name='__VIEWSTATE']").val();
    } while (pageCount === null || pageNumber <= pageCount || pageNumber >= 100); // enforce a hard limit of 100 pages (as a safety precaution)
}
main().then(() => console.log("Complete.")).catch(error => console.error(error));
//# sourceMappingURL=scraper.js.map