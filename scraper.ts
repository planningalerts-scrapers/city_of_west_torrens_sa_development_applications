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

import * as cheerio from "cheerio";
import * as request from "request-promise-native";
import * as sqlite3 from "sqlite3";
import * as moment from "moment";

sqlite3.verbose();

const DevelopmentApplicationsMainUrl = "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/default.aspx?js=-1882816898";
const DevelopmentApplicationsEnquiryUrl = "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquiryLists.aspx";
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
        ], function(error, row) {
            if (error) {
                console.error(error);
                reject(error);
            } else {
                if (this.changes > 0)
                    console.log(`    Inserted: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" into the database.`);
                else
                    console.log(`    Skipped: application \"${developmentApplication.applicationNumber}\" with address \"${developmentApplication.address}\" and reason \"${developmentApplication.reason}\" because it was already present in the database.`);
                sqlStatement.finalize();  // releases any locks
                resolve(row);
            }
        });
    });
}

// Gets a random integer in the specified range: [minimum, maximum).

function getRandom(minimum, maximum) {
    return Math.floor(Math.random() * (Math.floor(maximum) - Math.ceil(minimum))) + Math.ceil(minimum);
}

// Parses the development applications.

async function main() {
    // Ensure that the database exists.

    let database = await initializeDatabase();

    // Retrieve the main page.

    console.log(`Retrieving page: ${DevelopmentApplicationsMainUrl}`);
    let jar = request.jar();
    let body = await request({
        url: DevelopmentApplicationsMainUrl,
        headers: {
            "Accept": "text/html, application/xhtml+xml, application/xml; q=0.9, */*; q=0.8",
            "Accept-Encoding": "",
            "Accept-Language": "en-US, en; q=0.5",
            "Connection": "Keep-Alive",
            "Host": "epathway.wtcc.sa.gov.au",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134"
        },
        jar: jar
    });
    let $ = cheerio.load(body);
    
    // Retrieve the enquiry page.

    console.log(`Retrieving page: ${DevelopmentApplicationsEnquiryUrl}`);
    body = await request({
        url: DevelopmentApplicationsEnquiryUrl,
        headers: {
            "Accept": "text/html, application/xhtml+xml, application/xml; q=0.9, */*; q=0.8",
            "Accept-Encoding": "",
            "Accept-Language": "en-US, en; q=0.5",
            "Connection": "Keep-Alive",
            "Host": "epathway.wtcc.sa.gov.au",
            "Referer": "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/default.aspx",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134"
        },
        jar: jar
    });
    console.log(body);
    $ = cheerio.load(body);

    // let eventValidation = $("input[name='__EVENTVALIDATION']").val();
    // let viewState = $("input[name='__VIEWSTATE']").val();

    // console.log(eventValidation);
    // console.log(viewState);

    // Need referer: https://github.com/planningalerts-scrapers/wollongong/blob/master/scraper.rb
    
    console.log("Test 1");
    body = await request({
        url: "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquirySearch.aspx",
        headers: {
            "Referer": "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/default.aspx",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134"
        },
        jar: jar
    });
    // console.log(body);
    $ = cheerio.load(body);

    let eventValidation = $("input[name='__EVENTVALIDATION']").val();
    let viewState = $("input[name='__VIEWSTATE']").val();

    console.log("Test 2");
    body = await request({
        url: "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquirySearch.aspx",
        method: "POST",
        followAllRedirects: true,
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "Accept-Encoding": "",
            "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
            "Cache-Control": "max-age=0",
            "Connection": "keep-alive",
            "Content-Type": "application/x-www-form-urlencoded",
            "Host": "epathway.wtcc.sa.gov.au",
            "Origin": "https://epathway.wtcc.sa.gov.au",
            "Referer": "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquirySearch.aspx",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.84 Safari/537.36"
        },
        jar: jar,
        form: {
            __EVENTVALIDATION: eventValidation,
            __VIEWSTATE: viewState,
            __VIEWSTATEGENERATOR: "4A3184D0"
        }
    });
    console.log(body);
    $ = cheerio.load(body);

    eventValidation = $("input[name='__EVENTVALIDATION']").val();
    viewState = $("input[name='__VIEWSTATE']").val();

    console.log("Test 2.1");
    body = await request({
        url: "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquirySearch.aspx",
        method: "POST",
        followAllRedirects: true,
        headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "Accept-Encoding": "",
            "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
            "Cache-Control": "max-age=0",
            "Connection": "keep-alive",
            "Content-Type": "application/x-www-form-urlencoded",
            "Host": "epathway.wtcc.sa.gov.au",
            "Origin": "https://epathway.wtcc.sa.gov.au",
            "Referer": "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquirySearch.aspx",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.84 Safari/537.36"
        },
        jar: jar,
        form: {
            __EVENTARGUMENT: "2",
            __EVENTTARGET: "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$tabControlMenu",
            __EVENTVALIDATION: eventValidation,
            __LASTFOCUS: "",
            __VIEWSTATE: viewState,
            __VIEWSTATEGENERATOR: "4A3184D0",
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mEnquiryListsDropDownList": 10,
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$ctl04$mFormattedNumberTextBox": "",
            "ctl00$mHeight": "907",
            "ctl00$mWidth": "1280"
        }
    });
    console.log(body);
    $ = cheerio.load(body);

    // eventValidation = $("input[name='__EVENTVALIDATION']").val();
    // viewState = $("input[name='__VIEWSTATE']").val();

    // console.log("Test 2.2");
    // body = await request({
    //     url: "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquirySearch.aspx?ctl00%24MainBodyContent%24mGeneralEnquirySearchControl%24mTabControl%24ti=2",
    //     headers: { "Content-Type": "application/x-www-form-urlencoded" },
    //     jar: jar,
    //     form: {
    //         __EVENTARGUMENT: "2",
    //         __EVENTTARGET: "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$tabControlMenu",
    //         __EVENTVALIDATION: eventValidation,
    //         __LASTFOCUS: "",
    //         __VIEWSTATE: viewState,
    //         __VIEWSTATEGENERATOR: "4A3184D0",
    //         "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mEnquiryListsDropDownList": 10,
    //         "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$ctl04$mFormattedNumberTextBox": "",
    //         "ctl00$mHeight": "907",
    //         "ctl00$mWidth": "1280"
    //     }
    // });
    // console.log(body);
    // $ = cheerio.load(body);

    eventValidation = $("input[name='__EVENTVALIDATION']").val();
    viewState = $("input[name='__VIEWSTATE']").val();

    console.log("Test 3");
    body = await request({
        url: "https://epathway.wtcc.sa.gov.au/ePathway/Production/Web/GeneralEnquiry/EnquirySummaryView.aspx",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        jar: jar,
        form: {
            __EVENTVALIDATION: eventValidation,
            __VIEWSTATE: viewState,
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mEnquiryListsDropDownList": "10",
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mSearchButton": "Search",
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$ctl14$DateSearchRadioGroup": "mLast30RadioButton",
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$ctl14$mFromDatePicker$dateTextBox": "08/07/2018",
            "ctl00$MainBodyContent$mGeneralEnquirySearchControl$mTabControl$ctl14$mToDatePicker$dateTextBox": "06/08/2018",
            "ctl00$mHeight": "907",
            "ctl00$mWidth": "1280"
    } });
    console.log(body);
    $ = cheerio.load(body);

    // // Find all CSV URLs on the main page.

    // let urls: string[] = [];
    // for (let element of $("a.resource-url-analytics").get())
    //     if (!urls.some(url => url === element.attribs.href))
    //         urls.push(element.attribs.href);

    // if (urls.length === 0) {
    //     console.log(`No CSV files to parse were found on the page: ${DevelopmentApplicationsUrl}`);
    //     return;
    // }

    // // Retrieve two of the development application CSV files (the most recent and one other random
    // // selection).  Retrieving all development application CSV files may otherwise use too much
    // // memory and result in morph.io terminating the current process.
    
    // let selectedUrls = [ urls.pop() ];
    // if (urls.length >= 1)
    //     selectedUrls.push(urls[getRandom(0, urls.length)]);

    // for (let url of selectedUrls) {
    //     console.log(`Retrieving: ${url}`);
    //     let body = await request({ url: url });
    //     let rows = parse(body);
    //     if (rows.length === 0)
    //         continue;

    //     // Determine which columns contain the required development application information.

    //     let applicationNumberColumnIndex = -1;
    //     let receivedDateColumnIndex = -1;
    //     let reasonColumnIndex = -1;
    //     let addressColumnIndex1 = -1;
    //     let addressColumnIndex2 = -1;

    //     for (let columnIndex = 0; columnIndex < rows[0].length; columnIndex++) {
    //         let cell: string = rows[0][columnIndex];
    //         if (cell === "ApplicationNumber")
    //             applicationNumberColumnIndex = columnIndex;
    //         else if (cell === "LodgementDate")
    //             receivedDateColumnIndex = columnIndex;
    //         else if (cell === "ApplicationDesc")
    //             reasonColumnIndex = columnIndex;
    //         else if (cell === "PropertyAddress")
    //             addressColumnIndex1 = columnIndex;
    //         else if (cell === "PropertySuburbPostCode")
    //             addressColumnIndex2 = columnIndex;
    //     }

    //     if (applicationNumberColumnIndex < 0 || (addressColumnIndex1 < 0 && addressColumnIndex2 < 0)) {
    //         console.log(`Could not parse any development applications from ${url}.`);
    //         continue;
    //     }

    //     // Extract the development application information.

    //     let developmentApplications = [];
    //     for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    //         let row = rows[rowIndex];
    //         let applicationNumber = row[applicationNumberColumnIndex].trim();
    //         let address1 = (addressColumnIndex1 < 0) ? "" : row[addressColumnIndex1].trim();
    //         let address2 = (addressColumnIndex2 < 0) ? "" : row[addressColumnIndex2].trim();
    //         let reason = (reasonColumnIndex < 0) ? "" : row[reasonColumnIndex].trim();
    //         let receivedDate = moment(((receivedDateColumnIndex < 0) ? null : row[receivedDateColumnIndex].trim()), "D/MM/YYYY HH:mm:ss A", true);  // allows the leading zero of the day to be omitted
    //         let address = address1 + ((address1 !== "" && address2 !== "") ? " " : "") + address2;
    //         address = address.trim().replace(/\s\s+/g, " ");  // reduce multiple consecutive spaces in the address to a single space

    //         if (applicationNumber !== "" && address !== "")
    //             await insertRow(database, {
    //                 applicationNumber: applicationNumber,
    //                 address: address,
    //                 reason: reason,
    //                 informationUrl: url,
    //                 commentUrl: CommentUrl,
    //                 scrapeDate: moment().format("YYYY-MM-DD"),
    //                 receivedDate: receivedDate.isValid() ? receivedDate.format("YYYY-MM-DD") : ""
    //             });
    //     }
    // }
}

main().then(() => console.log("Complete.")).catch(error => console.error(error));
