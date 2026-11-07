# Business Scraper

A Chrome extension (Manifest V3) that scrapes business details from **Yelp**, **Google Maps**, and **any business website**, stores them locally, and exports to **CSV** / **XLSX** with a **copy** option.

## Features

- **Three sources** (all listed in the popup's *Source* dropdown and in the dashboard's source filter, even before any data exists)
  - **Google Maps** — scrapes the results list; **Auto-scroll + scrape all** keeps scrolling until Maps says the list has ended (or stops loading), with a **Stop** button.
  - **Yelp** — scrapes the search-results cards; optionally opens each business page to read phone, address and website.
  - **Other website** — returns *every* result it can find on a page (all stories on a news page, directory listings, etc.), not just one. It reads structured data (JSON-LD), `<article>` cards, headings with links, and headline-style links. If the page has none of those, it saves one row for the page itself.
- **Fields captured:** Business Name, Phone Number, Category/Service, Rating, Reviews, Address/Area, Business Link, Site Link (plus Source, Keyword, Location, Date).
- **"Not Available"** is shown (dashboard, CSV, XLSX, Copy) for any field with no data.
- **Keyword + Location targeting** — type what and where, pick a source, and it opens the right search page. For *Other website*, enter a URL (or leave it empty to scrape the current tab).
- **Local storage** — everything is saved in `chrome.storage.local` on your machine. Nothing is sent anywhere.
- **Dashboard** — a full-page tab with per-source counts, search, filters, a results table, delete/clear, and exports.
- **Export** — CSV, XLSX (via bundled SheetJS), and Copy (tab-separated, pastes straight into Excel/Sheets).
- **License gate** — the extension is locked until a valid key is entered (keys are hardcoded, see below).
- **Dedupe** — duplicate businesses are skipped automatically (matched on name + phone, business link, or name + address).

## Install

1. Open `chrome://extensions` in Chrome (or Edge).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select the `E:\Extension` folder.
4. Pin the extension and click its icon.

## License keys

Enter any one of these when prompted (edit the list in [`license.js`](license.js)):

```
SCRAPER-PRO-2026-ALPHA
SCRAPER-PRO-2026-BRAVO
SCRAPER-PRO-2026-CHARLIE
SCRAPER-PRO-2026-DELTA
SCRAPER-PRO-2026-ECHO
```

Keys are checked case-insensitively. "Deactivate license" in the popup clears the stored key.

## How to use

### Yelp / Google Maps
1. Click the extension icon, pick the **Source**, then enter a **Keyword** (e.g. `Doctor`) and **Location** (e.g. `New York`).
2. Click **Open search & scrape**. The search page opens in a new tab.
3. A small panel appears in the bottom-right of that page:
   - **Google Maps:** **Auto-scroll + scrape all** loads the whole list then saves it (progress is shown; **Stop** saves what was loaded so far). **Scrape visible** saves only what is already on screen. Google itself caps a search at roughly 120 results.
   - **Yelp:** **Scrape this page + details** (slower: reads each business page for phone/address/website) or **Scrape this page (fast)**; use **Next page →** and scrape again for more.

### Any website
- Choose **Other website**, type a URL and click **Open website & scrape** (it opens the page and saves every result found), **or**
- open a page yourself and click **Scrape current website** in the popup (or choose *Other website* with the URL left empty).

### Dashboard & export
- Click **Open dashboard** in the popup.
- Search and filter by source/keyword, then **Export CSV**, **Export XLSX**, or **Copy**. Delete individual rows or **Clear all**.

## File layout

```
manifest.json          Extension manifest (MV3)
license.js             Hardcoded keys + activation helpers
popup.html / popup.js  Popup UI (targeting, site scrape, dashboard link, license)
dashboard.html         Dashboard page
dashboard.js           Dashboard logic + CSV/XLSX/copy export
style.css              Dashboard styles
background.js          Service worker: dedupes and stores scraped rows
content/common.js      Shared helpers + in-page floating panel
content/yelp.js        Yelp results scraper
content/maps.js        Google Maps results scraper
content/site.js        Website metadata scraper (injected on demand)
lib/xlsx.full.min.js   SheetJS (bundled locally; MV3 forbids remote code)
icons/                 Extension icons
```

## Notes & limitations

- **After updating the extension:** reload it in `chrome://extensions` **and refresh (or reopen) any open Maps/Yelp tabs** — open tabs keep running the old scraper. The panel title shows the running version (`v1.1.0`); if it doesn't, the page is still on old code.
- **Re-scraping updates rows:** a business that is already saved gets its phone, address, category, rating etc. refreshed instead of being skipped (the panel shows "updated N"). This repairs rows saved by version 1.0, where the rating ended up in the Address column; leftover Yelp "more"/"Order" rows are removed automatically on the next scrape.
- **Ads on Maps:** sponsored results are included; their website link is the advertiser's domain, because Google hides the real link behind a tracking redirect.
- **Yelp** often blocks automated requests (HTTP 403). If it blocks the detail lookups, the extension saves the basic info and shows "Not Available" for phone/address.
- **Selectors can break.** Yelp and Google Maps change their page markup periodically. The CSS selectors for each are grouped in a `SEL` object at the top of `content/yelp.js` and `content/maps.js` so they're quick to fix.
- Scraping Yelp and Google Maps may conflict with their Terms of Service. Use responsibly and at modest volume.
- All data stays local; there is no backend and no network calls except loading the pages you visit.
