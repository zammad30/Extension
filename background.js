// Service worker: receives scraped rows, dedupes, stores in chrome.storage.local.
// Also scrapes websites (current tab, or a URL it opens) so work continues after the popup closes.

const STORE_KEY = "businesses";

function cleanText(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

// Normalize a row. Empty values stay empty here; the UI shows "Not Available" for them.
function normalizeRow(row) {
  return {
    name: cleanText(row.name),
    phone: cleanText(row.phone),
    category: cleanText(row.category),
    rating: cleanText(row.rating),
    reviews: cleanText(row.reviews),
    businessLink: cleanText(row.businessLink),
    address: cleanText(row.address),
    siteLink: cleanText(row.siteLink),
    source: cleanText(row.source) || "Unknown",
    keyword: cleanText(row.keyword),
    location: cleanText(row.location),
    date: row.date || new Date().toISOString()
  };
}

function dedupeKey(r) {
  const phone = r.phone.replace(/[^\d]/g, "");
  if (r.name && phone) return `np:${r.name.toLowerCase()}|${phone}`;
  if (r.businessLink) return `bl:${r.businessLink.toLowerCase()}|${r.name.toLowerCase()}`;
  if (r.name && r.address) return `na:${r.name.toLowerCase()}|${r.address.toLowerCase()}`;
  return `n:${r.name.toLowerCase()}`;
}

// Fields refreshed on an existing row when a re-scrape finds a (non-empty) value.
const MERGE_FIELDS = ["phone", "category", "rating", "reviews", "address", "siteLink"];
// Names that are buttons/links on Yelp cards, not businesses (left over from version 1.0).
const JUNK_NAME = /^(more|order|see more.*)$/i;
// An "address" that is really a rating such as 5.0(33) (version 1.0 bug).
const BAD_ADDRESS = /^\d(\.\d)?\s*\(\d[\d,]*\)$/;

async function addRows(rawRows) {
  const rows = (rawRows || []).map(normalizeRow).filter((r) => r.name);
  const { [STORE_KEY]: stored = [] } = await chrome.storage.local.get(STORE_KEY);
  const existing = stored.filter((r) => !(r.source === "Yelp" && JUNK_NAME.test(r.name)));

  const index = new Map(existing.map((r, i) => [dedupeKey(r), i]));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const r of rows) {
    const key = dedupeKey(r);
    if (index.has(key)) {
      // Same business again: refresh its details instead of ignoring the new data.
      const cur = existing[index.get(key)];
      let changed = false;
      if (BAD_ADDRESS.test(cur.address || "") && !r.address) { cur.address = ""; changed = true; }
      for (const f of MERGE_FIELDS) {
        if (r[f] && r[f] !== cur[f]) { cur[f] = r[f]; changed = true; }
      }
      if (changed) updated++; else skipped++;
      continue;
    }
    r.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    index.set(key, existing.length);
    existing.push(r);
    added++;
  }

  await chrome.storage.local.set({ [STORE_KEY]: existing });
  return { added, updated, skipped, total: existing.length, found: rows.length };
}

// ---- Website scraping ----
async function scrapeTab(tabId) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, files: ["content/site.js"] });
  const rows = (res && res.result) || [];
  const { target } = await chrome.storage.local.get("target");
  rows.forEach((r) => {
    r.keyword = r.keyword || (target && target.keyword) || "";
    r.location = r.location || (target && target.location) || "";
  });
  const out = await addRows(rows);
  out.firstName = rows[0] ? rows[0].name : "";
  return out;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (id, info) => { if (id === tabId && info.status === "complete") done(); };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(done, 30000); // never wait forever
  });
}

async function scrapeUrl(url) {
  const tab = await chrome.tabs.create({ url, active: true });
  await waitForTabLoad(tab.id);
  await new Promise((r) => setTimeout(r, 2500)); // let dynamic pages render
  return scrapeTab(tab.id);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  let job = null;
  if (msg.type === "ADD_ROWS") job = addRows(msg.rows);
  else if (msg.type === "SCRAPE_TAB") job = scrapeTab(msg.tabId);
  else if (msg.type === "SCRAPE_URL") job = scrapeUrl(msg.url);
  if (!job) return;

  job.then(sendResponse).catch((e) => sendResponse({ error: e.message }));
  return true; // async response
});
