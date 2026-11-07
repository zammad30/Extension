const $ = (id) => document.getElementById(id);
const STORE_KEY = "businesses";

// Sources always offered in the filter, even when no data has been saved for them yet.
const SOURCES = ["Google Maps", "Yelp", "Website"];
const NA = "Not Available";

// Value of a field, or "Not Available" when it is empty.
function val(r, key) {
  const v = r[key];
  return v === undefined || v === null || String(v).trim() === "" ? NA : String(v);
}

const COLUMNS = [
  ["name", "Business Name"],
  ["phone", "Phone Number"],
  ["category", "Category"],
  ["rating", "Rating"],
  ["reviews", "Reviews"],
  ["address", "Address"],
  ["businessLink", "Business Link"],
  ["siteLink", "Site Link"],
  ["source", "Source"],
  ["keyword", "Keyword"],
  ["location", "Location"],
  ["date", "Date"]
];

let all = [];

async function load() {
  const { [STORE_KEY]: rows = [] } = await chrome.storage.local.get(STORE_KEY);
  all = rows;
  buildFilters();
  render();
}

function buildFilters() {
  const sources = [...new Set([...SOURCES, ...all.map((r) => r.source).filter(Boolean)])];
  const keywords = [...new Set(all.map((r) => r.keyword).filter(Boolean))].sort();
  fillSelect($("sourceFilter"), sources, "All sources");
  fillSelect($("keywordFilter"), keywords, "All keywords");
}

function fillSelect(sel, values, allLabel) {
  const current = sel.value;
  sel.innerHTML = `<option value="">${allLabel}</option>` +
    values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  sel.value = values.includes(current) ? current : "";
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function getFiltered() {
  const q = $("search").value.trim().toLowerCase();
  const src = $("sourceFilter").value;
  const kw = $("keywordFilter").value;
  return all.filter((r) => {
    if (src && r.source !== src) return false;
    if (kw && r.keyword !== kw) return false;
    if (q) {
      const hay = [r.name, r.phone, r.address, r.category, r.location].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function link(url) {
  if (!url) return `<span class="na">${NA}</span>`;
  const short = url.replace(/^https?:\/\//, "").slice(0, 40);
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(short)}</a>`;
}

// Table cell: value, or a muted "Not Available".
function cell(r, key) {
  const v = val(r, key);
  return v === NA ? `<span class="na">${NA}</span>` : escapeHtml(v);
}

function render() {
  const rows = getFiltered();
  const tbody = $("rows");
  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${cell(r, "name")}</td>
      <td>${cell(r, "phone")}</td>
      <td>${cell(r, "category")}</td>
      <td>${cell(r, "rating")}</td>
      <td>${cell(r, "reviews")}</td>
      <td>${cell(r, "address")}</td>
      <td>${link(r.businessLink)}</td>
      <td>${link(r.siteLink)}</td>
      <td>${cell(r, "source")}</td>
      <td>${cell(r, "keyword")}</td>
      <td>${cell(r, "location")}</td>
      <td>${escapeHtml((r.date || "").slice(0, 10))}</td>
      <td><span class="del" data-id="${r.id}">Delete</span></td>
    </tr>`).join("");

  $("empty").classList.toggle("hidden", rows.length > 0);

  const bySource = {};
  all.forEach((r) => { bySource[r.source] = (bySource[r.source] || 0) + 1; });
  $("counts").innerHTML =
    `<span>Total: <b>${all.length}</b></span>` +
    Object.entries(bySource).map(([s, n]) => `<span>${escapeHtml(s)}: <b>${n}</b></span>`).join("") +
    (rows.length !== all.length ? `<span>Showing: <b>${rows.length}</b></span>` : "");

  tbody.querySelectorAll(".del").forEach((el) => {
    el.addEventListener("click", () => deleteRow(el.dataset.id));
  });
}

async function deleteRow(id) {
  all = all.filter((r) => r.id !== id);
  await chrome.storage.local.set({ [STORE_KEY]: all });
  buildFilters();
  render();
}

// ---- Export helpers ----
function matrix() {
  const header = COLUMNS.map(([, label]) => label);
  const rows = getFiltered().map((r) => COLUMNS.map(([key]) => (key === "date" ? r.date || NA : val(r, key))));
  return { header, rows };
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function toCsv() {
  const { header, rows } = matrix();
  const esc = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows].map((row) => row.map(esc).join(","));
  return "﻿" + lines.join("\r\n"); // BOM for Excel
}

$("csvBtn").addEventListener("click", () => {
  download(`businesses-${stamp()}.csv`, new Blob([toCsv()], { type: "text/csv" }));
});

$("xlsxBtn").addEventListener("click", () => {
  const { header, rows } = matrix();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Businesses");
  XLSX.writeFile(wb, `businesses-${stamp()}.xlsx`);
});

$("copyBtn").addEventListener("click", async () => {
  const { header, rows } = matrix();
  const tsv = [header, ...rows].map((row) => row.join("\t")).join("\n");
  try {
    await navigator.clipboard.writeText(tsv);
    $("copyBtn").textContent = "Copied!";
    setTimeout(() => ($("copyBtn").textContent = "Copy"), 1500);
  } catch (e) {
    alert("Copy failed: " + e.message);
  }
});

$("clearBtn").addEventListener("click", async () => {
  if (!confirm("Delete all saved businesses? This cannot be undone.")) return;
  all = [];
  await chrome.storage.local.set({ [STORE_KEY]: [] });
  buildFilters();
  render();
});

["search", "sourceFilter", "keywordFilter"].forEach((id) =>
  $(id).addEventListener("input", render));

// Live-update if scraping happens while dashboard is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORE_KEY]) load();
});

// ---- License gate ----
$("activateBtn").addEventListener("click", async () => {
  const res = await activateLicense($("keyInput").value);
  if (res.ok) start();
  else $("gateErr").textContent = res.error;
});

async function start() {
  $("gate").classList.add("hidden");
  $("app").classList.remove("hidden");
  load();
}

(async function initDashboard() {
  const license = await getStoredLicense();
  if (license) start();
  else $("gate").classList.remove("hidden");
})();
