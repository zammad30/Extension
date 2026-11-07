// Shared helpers + floating panel for in-page scrapers (Yelp, Maps).
// Exposes window.BScraper.

(function () {
  if (window.BScraper) return;

  function cleanText(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function absUrl(href) {
    if (!href) return "";
    try {
      return new URL(href, location.href).href.split("#")[0];
    } catch (e) {
      return href;
    }
  }

  async function getTarget() {
    try {
      const { target } = await chrome.storage.local.get("target");
      return target || { keyword: "", location: "" };
    } catch (e) {
      return { keyword: "", location: "" };
    }
  }

  function sendRows(rows) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ADD_ROWS", rows }, (res) => {
        resolve(res || { added: 0, skipped: 0, total: 0 });
      });
    });
  }

  // Build a small fixed panel in the bottom-right corner.
  function createPanel(title, buttons) {
    const existing = document.getElementById("bscraper-panel");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "bscraper-panel";
    panel.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:2147483647",
      "background:#111827", "color:#fff", "font:13px/1.4 system-ui,sans-serif",
      "padding:12px", "border-radius:10px", "box-shadow:0 6px 24px rgba(0,0,0,.35)",
      "width:230px"
    ].join(";");

    const h = document.createElement("div");
    let version = "";
    try { version = " v" + chrome.runtime.getManifest().version; } catch (e) { /* extension was reloaded: refresh this page */ }
    h.textContent = title + version;
    h.style.cssText = "font-weight:600;margin-bottom:8px;";
    panel.appendChild(h);

    buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.textContent = b.label;
      btn.style.cssText = [
        "display:block", "width:100%", "margin:4px 0", "padding:8px",
        "border:0", "border-radius:6px", "cursor:pointer",
        "background:#2563eb", "color:#fff", "font-size:13px"
      ].join(";");
      btn.addEventListener("click", () => b.onClick(api));
      panel.appendChild(btn);
    });

    const status = document.createElement("div");
    status.style.cssText = "margin-top:8px;font-size:12px;color:#cbd5e1;min-height:16px;";
    panel.appendChild(status);

    const close = document.createElement("div");
    close.textContent = "×";
    close.title = "Hide";
    close.style.cssText = "position:absolute;top:6px;right:10px;cursor:pointer;font-size:16px;color:#94a3b8;";
    close.addEventListener("click", () => panel.remove());
    panel.appendChild(close);

    document.body.appendChild(panel);

    const api = {
      stopped: false, // set true by a "Stop" button; long loops should check it
      setStatus(msg) { status.textContent = msg; }
    };
    return api;
  }

  window.BScraper = { cleanText, absUrl, getTarget, sendRows, createPanel };
})();
