// Hardcoded license keys. Add or change keys here.
// Keys are compared case-insensitively after trimming.
const VALID_LICENSE_KEYS = [
  "SCRAPER-PRO-2026-ALPHA",
  "SCRAPER-PRO-2026-BRAVO",
  "SCRAPER-PRO-2026-CHARLIE",
  "SCRAPER-PRO-2026-DELTA",
  "SCRAPER-PRO-2026-ECHO"
];

function normalizeKey(key) {
  return (key || "").trim().toUpperCase();
}

function isValidKey(key) {
  return VALID_LICENSE_KEYS.includes(normalizeKey(key));
}

// Returns the stored license object or null.
async function getStoredLicense() {
  const { license } = await chrome.storage.local.get("license");
  if (license && isValidKey(license.key)) return license;
  return null;
}

async function activateLicense(key) {
  if (!isValidKey(key)) return { ok: false, error: "Invalid license key." };
  const license = { key: normalizeKey(key), activatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ license });
  return { ok: true, license };
}

async function deactivateLicense() {
  await chrome.storage.local.remove("license");
}
