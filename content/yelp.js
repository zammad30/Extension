// Yelp search-results scraper. Runs on yelp.com pages.
// Selectors are grouped here so they are easy to update when Yelp changes markup.

(function () {
  const S = window.BScraper;

  const SEL = {
    nameLink: 'a[href*="/biz/"]',          // name/heading link on each card
    card: 'li, div[data-testid*="serp"]',  // card container to search within
    categoryLink: 'a[href*="find_desc="]', // category tag links inside a card
    rating: '[aria-label*="star rating"]', // e.g. aria-label="4.5 star rating"
    address: 'address'                     // address block if present
  };

  // Link texts that are not business names ("more", "See more reviews", ...).
  const JUNK_NAME = /^(more|order|order now|start order|see more.*|read more|write a review|call|directions|get directions|menu|website|\d+\s+reviews?|.*\bphotos?)$/i;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Business URL without query string, so the same business is never listed twice.
  function cleanBizUrl(href) {
    try {
      const u = new URL(href, location.href);
      if (!u.pathname.startsWith("/biz/")) return "";
      return u.origin + u.pathname;
    } catch (e) {
      return "";
    }
  }

  function scrapePage(target) {
    const rows = [];
    const seen = new Set();
    const seenCards = new Set();

    document.querySelectorAll(SEL.nameLink).forEach((a) => {
      const name = S.cleanText(a.textContent);
      if (!name || JUNK_NAME.test(name)) return;

      const link = cleanBizUrl(a.getAttribute("href"));
      if (!link || seen.has(link)) return;

      // One row per result card: later links in the same card ("Order", "more") are not businesses.
      const card = a.closest(SEL.card) || a.parentElement;
      if (card && seenCards.has(card)) return;
      seen.add(link);
      if (card) seenCards.add(card);
      let category = "";
      let address = "";
      let rating = "";
      let reviews = "";

      if (card) {
        const cats = Array.from(card.querySelectorAll(SEL.categoryLink))
          .map((c) => S.cleanText(c.textContent))
          .filter(Boolean);
        category = [...new Set(cats)].join(", ");

        const addrEl = card.querySelector(SEL.address);
        if (addrEl) address = S.cleanText(addrEl.textContent);

        const ratingEl = card.querySelector(SEL.rating);
        const rm = ratingEl && (ratingEl.getAttribute("aria-label") || "").match(/[\d.]+/);
        if (rm) rating = rm[0];

        const vm = card.textContent.match(/\(?\b(\d[\d,]*)\s*reviews?\)?/i);
        if (vm) reviews = vm[1].replace(/,/g, "");
      }

      rows.push({
        name,
        phone: "",
        category,
        rating,
        reviews,
        businessLink: link,
        address,
        siteLink: "",
        source: "Yelp",
        keyword: target.keyword,
        location: target.location,
        date: new Date().toISOString()
      });
    });

    return rows;
  }

  // Open a business page in the background and read phone / address / website from it.
  // Returns {} when Yelp blocks the request, so the row is simply saved without those fields.
  async function fetchDetails(url) {
    const out = { blocked: false };
    try {
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 403 || res.status === 429) { out.blocked = true; return out; }
      if (!res.ok) return out;

      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        try {
          const data = JSON.parse(s.textContent);
          const nodes = Array.isArray(data) ? data : data["@graph"] || [data];
          nodes.forEach((n) => {
            if (n.telephone && !out.phone) out.phone = String(n.telephone);
            if (n.address && !out.address) {
              const a = n.address;
              out.address = typeof a === "string" ? a : [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(", ");
            }
            if (n.aggregateRating) {
              out.rating = out.rating || String(n.aggregateRating.ratingValue || "");
              out.reviews = out.reviews || String(n.aggregateRating.reviewCount || "");
            }
          });
        } catch (e) { /* ignore bad JSON-LD */ }
      });

      if (!out.phone) {
        const pm = html.match(/"(?:displayPhone|phone)"\s*:\s*"([^"]{7,25})"/);
        if (pm) out.phone = pm[1];
      }
      if (!out.address) {
        const addr = doc.querySelector(SEL.address);
        if (addr) out.address = S.cleanText(addr.textContent);
      }

      // Business website is behind Yelp's /biz_redir?url=... link.
      const redir = doc.querySelector('a[href*="/biz_redir"]');
      if (redir) {
        try {
          const u = new URL(redir.getAttribute("href"), location.origin);
          out.siteLink = u.searchParams.get("url") || "";
        } catch (e) { /* ignore */ }
      }
    } catch (e) { /* network error: leave details empty */ }
    return out;
  }

  async function run(api, withDetails) {
    api.stopped = false;
    api.setStatus("Scraping…");
    const target = await S.getTarget();
    const rows = scrapePage(target);
    if (!rows.length) {
      api.setStatus("No results found on this page.");
      return;
    }

    if (withDetails) {
      let blocked = 0;
      for (let i = 0; i < rows.length && !api.stopped; i++) {
        api.setStatus(`Reading details ${i + 1}/${rows.length}…`);
        const d = await fetchDetails(rows[i].businessLink);
        if (d.blocked) {
          if (++blocked >= 2) { api.setStatus("Yelp blocked detail requests; saving basic info."); await sleep(1200); break; }
        } else {
          blocked = 0;
        }
        ["phone", "address", "siteLink", "rating", "reviews"].forEach((k) => {
          if (d[k] && !rows[i][k]) rows[i][k] = d[k];
        });
        await sleep(700 + Math.random() * 600); // be gentle with Yelp
      }
    }

    const res = await S.sendRows(rows);
    api.setStatus(`${api.stopped ? "Stopped. " : ""}Found ${rows.length}. Added ${res.added}, updated ${res.updated || 0}, skipped ${res.skipped} dupes. Total ${res.total}.`);
  }

  function nextPage(api) {
    const next = document.querySelector('a[aria-label="Next"], a[aria-label="Next Page"]');
    if (next) next.click();
    else api.setStatus("No next page link found.");
  }

  // Only show the panel on search-results pages.
  if (/\/search/.test(location.pathname) || location.search.includes("find_desc")) {
    S.createPanel("Yelp Scraper", [
      { label: "Scrape this page + details", onClick: (api) => run(api, true) },
      { label: "Scrape this page (fast)", onClick: (api) => run(api, false) },
      { label: "Next page →", onClick: nextPage },
      { label: "Stop", onClick: (api) => { api.stopped = true; } }
    ]);
  }
})();
