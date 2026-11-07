// Google Maps results scraper. Runs on google.com/maps pages.
// Selectors are grouped here so they are easy to update when Maps changes markup.

(function () {
  const S = window.BScraper;

  const SEL = {
    feed: 'div[role="feed"]',                       // scrollable results list
    card: 'div.Nv2PK',                              // one result card
    link: 'a.hfpxzc',                               // place link (aria-label = name)
    name: '.qBF1Pd',                                // name text
    rating: 'span[role="img"][aria-label*="star"]', // aria-label "4.8 stars 21 Reviews"
    line: '.W4Efsd',                                // text lines (nested; we use the innermost)
    website: 'a.lcr4fd, a[data-value="Website"]',   // website button
    adLink: 'a.bm892c[aria-label]'                  // sponsored block; label ends with the domain
  };

  const SEPARATOR = /[·⋅•]/;
  const HOURS_RE = /^(open|closed|closes|opens|temporarily closed|permanently closed)\b/i;
  const STREET_RE = /\d|\b(st|street|ave|avenue|rd|road|blvd|boulevard|broadway|plaza|sq|square|dr|drive|ln|lane|way|pl|place|hwy|pkwy|parkway)\b/i;

  function isPhone(text) {
    if (!/^[+()\d\s.-]+$/.test(text)) return false;
    const digits = text.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15;
  }

  // Real website link; Maps ad links go through /aclk, so use the domain shown on the ad instead.
  function getSiteLink(card) {
    const el = card.querySelector(SEL.website);
    const href = el ? el.getAttribute("href") || "" : "";
    if (href && !/\/aclk\b|google\.com\/aclk/.test(href)) return S.absUrl(href);

    const ad = card.querySelector(SEL.adLink);
    if (ad) {
      const last = S.cleanText(ad.getAttribute("aria-label").split("·").pop());
      if (/^[\w-]+(\.[\w-]+)+/.test(last)) return "https://" + last;
    }
    return "";
  }

  function parseCard(card, target) {
    const linkEl = card.querySelector(SEL.link);
    const nameEl = card.querySelector(SEL.name);
    const name = S.cleanText(
      (nameEl && nameEl.textContent) || (linkEl && linkEl.getAttribute("aria-label"))
    );
    if (!name) return null;

    // Business link without tracking parameters.
    const businessLink = linkEl ? S.absUrl(linkEl.getAttribute("href")).split("?")[0] : "";

    // Rating + review count.
    let rating = "";
    let reviews = "";
    const ratingEl = card.querySelector(SEL.rating);
    if (ratingEl) {
      const m = (ratingEl.getAttribute("aria-label") || "").match(/([\d.]+)\s*stars?\s*([\d,]+)?/i);
      if (m) {
        rating = m[1];
        reviews = (m[2] || "").replace(/,/g, "");
      }
    }
    if (!reviews) {
      const rc = card.querySelector(".UY7F9");
      if (rc) reviews = rc.textContent.replace(/[^\d]/g, "");
    }

    // Text lines: use the innermost line blocks, skip the rating line, split on "·".
    const leaves = Array.from(card.querySelectorAll(SEL.line)).filter((el) => !el.querySelector(SEL.line));
    const parts = [];
    leaves.forEach((el) => {
      if (el.querySelector('[role="img"]')) return; // rating line
      el.textContent.split(SEPARATOR).forEach((p) => {
        p = S.cleanText(p);
        if (p) parts.push(p);
      });
    });

    let phone = "";
    let category = "";
    let address = "";
    parts.forEach((p) => {
      if (!phone && isPhone(p)) { phone = p; return; }
      if (HOURS_RE.test(p) || isPhone(p)) return;
      if (!category) { category = p; return; }
      if (!address && STREET_RE.test(p)) address = p;
    });

    return {
      name,
      phone,
      category,
      rating,
      reviews,
      businessLink,
      address,
      siteLink: getSiteLink(card),
      source: "Google Maps",
      keyword: target.keyword,
      location: target.location,
      date: new Date().toISOString()
    };
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  const cardCount = () => document.querySelectorAll(SEL.card).length;

  function endReached() {
    const feed = document.querySelector(SEL.feed);
    return !!feed && /reached the end of the list/i.test(feed.textContent);
  }

  // Parse every card currently in the DOM into the `found` map.
  function grab(found, target) {
    document.querySelectorAll(SEL.card).forEach((card) => {
      const row = parseCard(card, target);
      if (!row) return;
      const key = row.businessLink || row.name;
      if (!found.has(key)) found.set(key, row);
    });
  }

  // Scroll the results list until Maps says it is finished (or stops loading).
  // Rows are collected while scrolling, in case Maps drops old cards from the DOM.
  async function collect(api, target, scroll) {
    const found = new Map();
    grab(found, target);
    if (!scroll) return [...found.values()];

    const feed = document.querySelector(SEL.feed);
    if (!feed) return [...found.values()];

    let idle = 0;
    for (let i = 0; i < 500 && !api.stopped; i++) {
      api.setStatus(`Loading results… ${found.size} found`);
      if (endReached()) break;

      const before = cardCount();
      feed.scrollTop = feed.scrollHeight;
      const cards = document.querySelectorAll(SEL.card);
      if (cards.length) cards[cards.length - 1].scrollIntoView({ block: "end" });
      feed.dispatchEvent(new WheelEvent("wheel", { deltaY: 1500, bubbles: true }));

      // Wait up to ~5s for new cards to appear.
      let grew = false;
      for (let w = 0; w < 16; w++) {
        await sleep(300);
        grab(found, target);
        if (cardCount() > before) { grew = true; break; }
        if (endReached()) break;
      }
      idle = grew ? 0 : idle + 1;
      if (idle >= 3) break; // nothing new after 3 tries
    }
    grab(found, target);
    return [...found.values()];
  }

  async function run(api, scroll) {
    api.stopped = false;
    api.setStatus(scroll ? "Loading results…" : "Scraping…");
    const target = await S.getTarget();
    const rows = await collect(api, target, scroll);
    if (!rows.length) {
      api.setStatus("No results found. Open a search results list first.");
      return;
    }
    const res = await S.sendRows(rows);
    api.setStatus(
      `${api.stopped ? "Stopped. " : ""}Found ${rows.length}. Added ${res.added}, updated ${res.updated || 0}, skipped ${res.skipped} dupes. Total ${res.total}.`
    );
  }

  S.createPanel("Maps Scraper", [
    { label: "Scrape visible", onClick: (api) => run(api, false) },
    { label: "Auto-scroll + scrape all", onClick: (api) => run(api, true) },
    { label: "Stop", onClick: (api) => { api.stopped = true; } }
  ]);
})();
