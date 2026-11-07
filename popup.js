const $ = (id) => document.getElementById(id);

function show(view) {
  $("licenseView").classList.toggle("hidden", view !== "license");
  $("mainView").classList.toggle("hidden", view !== "main");
}

// Show the URL field for "Other website", the keyword/location fields for Maps/Yelp.
function updateSourceUi() {
  const isSite = $("source").value === "site";
  $("searchFields").classList.toggle("hidden", isSite);
  $("siteFields").classList.toggle("hidden", !isSite);
  $("startBtn").textContent = isSite ? "Open website & scrape" : "Open search & scrape";
}

async function init() {
  const license = await getStoredLicense();
  show(license ? "main" : "license");

  const { target } = await chrome.storage.local.get("target");
  if (target) {
    $("keyword").value = target.keyword || "";
    $("location").value = target.location || "";
    $("source").value = target.source || "maps";
    $("siteUrl").value = target.siteUrl || "";
  }
  updateSourceUi();
}

$("source").addEventListener("change", updateSourceUi);

// ---- License ----
$("activateBtn").addEventListener("click", async () => {
  const res = await activateLicense($("keyInput").value);
  const el = $("licenseStatus");
  if (res.ok) {
    el.textContent = "Activated.";
    el.classList.remove("err");
    show("main");
  } else {
    el.textContent = res.error;
    el.classList.add("err");
  }
});

$("deactivate").addEventListener("click", async () => {
  await deactivateLicense();
  show("license");
});

// ---- Scrape the current tab (websites) ----
async function scrapeCurrentTab() {
  const status = $("status");
  status.textContent = "Scraping current tab…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || /^(chrome|edge|about|chrome-extension):/.test(tab.url || "")) {
      status.textContent = "Open a website first.";
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: "SCRAPE_TAB", tabId: tab.id });
    showSiteResult(res);
  } catch (e) {
    status.textContent = "Error: " + e.message;
  }
}

function showSiteResult(res) {
  const status = $("status");
  if (!res || res.error) status.textContent = "Error: " + ((res && res.error) || "no response");
  else if (!res.found) status.textContent = "Nothing found on this page.";
  else status.textContent = `Found ${res.found}. Added ${res.added}, updated ${res.updated || 0}, skipped ${res.skipped} dupes. Total ${res.total}.`;
}

$("siteBtn").addEventListener("click", scrapeCurrentTab);

// ---- Start button ----
function buildUrl(source, keyword, location) {
  if (source === "yelp") {
    return `https://www.yelp.com/search?find_desc=${encodeURIComponent(keyword)}&find_loc=${encodeURIComponent(location)}`;
  }
  const q = [keyword, location].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
}

$("startBtn").addEventListener("click", async () => {
  const source = $("source").value;
  const keyword = $("keyword").value.trim();
  const location = $("location").value.trim();
  let siteUrl = $("siteUrl").value.trim();

  if (source === "site") {
    await chrome.storage.local.set({ target: { keyword, location, source, siteUrl } });
    if (!siteUrl) return scrapeCurrentTab();
    if (!/^https?:\/\//i.test(siteUrl)) siteUrl = "https://" + siteUrl;
    $("status").textContent = "Opening site… results are saved automatically.";
    // The background worker finishes the job even though this popup closes when the tab opens.
    chrome.runtime.sendMessage({ type: "SCRAPE_URL", url: siteUrl });
    return;
  }

  if (!keyword) {
    $("status").textContent = "Enter a keyword first.";
    return;
  }
  await chrome.storage.local.set({ target: { keyword, location, source, siteUrl } });
  await chrome.tabs.create({ url: buildUrl(source, keyword, location) });
  $("status").textContent = "Opened search. Use the panel on the page to scrape.";
});

// ---- Dashboard ----
$("dashBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

init();
