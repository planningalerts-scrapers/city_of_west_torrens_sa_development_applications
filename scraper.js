// Parses the development applications at the South Australian City of West Torrens web site and
// places them in a database.
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
// Sets up an sqlite database.
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        let database = new sqlite3.Database("data.sqlite");
        database.serialize(() => {
            database.all("PRAGMA table_info('data')", (error, rows) => {
                if (rows.some(row => row.name === "on_notice_from"))
                    database.run("drop table [data]"); // ensure that the on_notice_from (and on_notice_to) columns are removed
                database.run("create table if not exists [data] ([council_reference] text primary key, [address] text, [description] text, [info_url] text, [date_scraped] text, [date_received] text)");
                resolve(database);
            });
        });
    });
}
// Inserts a row in the database if it does not already exist.
async function insertRow(database, developmentApplication) {
    return new Promise((resolve, reject) => {
        let sqlStatement = database.prepare("insert or replace into [data] values (?, ?, ?, ?, ?, ?)");
        sqlStatement.run([
            developmentApplication.applicationNumber,
            developmentApplication.address,
            developmentApplication.description,
            developmentApplication.informationUrl,
            developmentApplication.scrapeDate,
            developmentApplication.receivedDate
        ], function (error, row) {
            if (error) {
                console.error(error);
                reject(error);
            }
            else {
                console.log(`    Saved: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and description \"${developmentApplication.description}\" into the database.`);
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
    let body = await request({ url: DevelopmentApplicationsDefaultUrl, jar: jar });
    // Obtain the "js=" token from the page and re-submit the page with the token in the query
    // string.  This then indicates that JavaScript is available in the "client" and so all
    // subsequent pages served by the web server will include JavaScript.
    let token = parseToken(body);
    if (token !== null) {
        let tokenUrl = `${DevelopmentApplicationsDefaultUrl}?js=${token}`;
        console.log(`Retrieving page: ${tokenUrl}`);
        await request({ url: tokenUrl, jar: jar });
    }
    // Retrieve the enquiry lists page.
    console.log(`Retrieving page: ${DevelopmentApplicationsEnquiryListsUrl}`);
    body = await request({ url: DevelopmentApplicationsEnquiryListsUrl, jar: jar });
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
        form: {
            __EVENTARGUMENT: "2",
            __EVENTTARGET: "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$tabControlMenu",
            __EVENTVALIDATION: eventValidation,
            __VIEWSTATE: viewState
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
    let pageCountText = $("#ctl00_MainBodyContent_mPagingControl_pageNumberLabel").text();
    let pageCount = Math.max(1, Number(pageCountText.match(/[0-9]+$/)[0])) || 1; // "|| 1" ensures that NaN becomes 1
    do {
        // Parse a page of development applications.
        console.log(`Parsing page ${pageNumber} of ${pageCount}.`);
        pageNumber++;
        for (let tableRow of $("tr").get()) {
            let tableCells = $(tableRow).children("td").get();
            if (tableCells.length >= 4) {
                let applicationNumber = $(tableCells[0]).text().trim();
                let receivedDate = moment($(tableCells[1]).text().trim(), "D/MM/YYYY", true); // allows the leading zero of the day to be omitted
                let description = $(tableCells[2]).text().trim();
                let address = $(tableCells[3]).text().trim();
                if (/[0-9]+\/[0-9]+.*/.test(applicationNumber) && receivedDate.isValid()) {
                    await insertRow(database, {
                        applicationNumber: applicationNumber,
                        address: address,
                        description: description,
                        informationUrl: DevelopmentApplicationsDefaultUrl,
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
            form: {
                __EVENTARGUMENT: "",
                __EVENTTARGET: `ctl00$MainBodyContent$mPagingControl$pageButton_${pageNumber}`,
                __EVENTVALIDATION: eventValidation,
                __VIEWSTATE: viewState
            }
        });
        $ = cheerio.load(body);
        eventValidation = $("input[name='__EVENTVALIDATION']").val();
        viewState = $("input[name='__VIEWSTATE']").val();
    } while (pageCount === null || pageNumber <= pageCount || pageNumber >= 100); // enforce a hard limit of 100 pages (as a safety precaution)
}
main().then(() => console.log("Complete.")).catch(error => console.error(error));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyYXBlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNjcmFwZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsZ0dBQWdHO0FBQ2hHLDZCQUE2QjtBQUM3QixFQUFFO0FBQ0YsZUFBZTtBQUNmLGtCQUFrQjtBQUVsQixZQUFZLENBQUM7O0FBRWIsbUNBQW1DO0FBQ25DLGtEQUFrRDtBQUNsRCxtQ0FBbUM7QUFDbkMsaUNBQWlDO0FBRWpDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUVsQixNQUFNLGlDQUFpQyxHQUFHLHNFQUFzRSxDQUFDO0FBQ2pILE1BQU0sc0NBQXNDLEdBQUcsMEZBQTBGLENBQUM7QUFDMUksTUFBTSx1Q0FBdUMsR0FBRywyRkFBMkYsQ0FBQztBQUM1SSxNQUFNLDRDQUE0QyxHQUFHLGdHQUFnRyxDQUFDO0FBRXRKLDhCQUE4QjtBQUU5QixLQUFLLFVBQVUsa0JBQWtCO0lBQzdCLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDbkMsSUFBSSxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ25ELFFBQVEsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFO1lBQ3BCLFFBQVEsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLEVBQUU7Z0JBQ3RELElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUssZ0JBQWdCLENBQUM7b0JBQy9DLFFBQVEsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFFLHdFQUF3RTtnQkFDaEgsUUFBUSxDQUFDLEdBQUcsQ0FBQywwS0FBMEssQ0FBQyxDQUFDO2dCQUN6TCxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDdEIsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDLENB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