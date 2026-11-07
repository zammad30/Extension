// Website scraper. Injected into a tab on demand; the last expression is an ARRAY of rows.
//
// Order of attempts:
//  1. JSON-LD: business nodes and ItemList entries (structured data).
//  2. Repeated items on the page: <article> cards, then headings that contain links
//     (this is what returns every story on pages like Google News).
//  3. Fallback: one row describing the page / site itself.

(() => {
  const MAX_ITEMS = 300;
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const abs = (h) => { try { return new URL(h, location.href).href.split("#")[0]; } catch (e) { return ""; } };
  const meta = (sel) => { const el = document.querySelector(sel); return el ? clean(el.getAttribute("content")) : ""; };

  const host = location.hostname.replace(/^www\./, "");
  const siteName = meta('meta[property="og:site_name"]') || clean(document.title) || host;
  const now = new Date().toISOString();

  const makeRow = (o) => ({
    name: clean(o.name),
    phone: clean(o.phone),
    category: clean(o.category) || siteName,
    rating: "",
    reviews: "",
    businessLink: o.link || location.href.split("#")[0],
    address: clean(o.address),
    siteLink: location.origin,
    source: "Website",
    date: now
  });

  const addressText = (a) => {
    if (!a) return "";
    if (typeof a === "string") return clean(a);
    return clean([a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry].filter(Boolean).join(", "));
  };

  const rows = [];
  const seen = new Set();
  const push = (row) => {
    if (!row.name || rows.length >= MAX_ITEMS) return;
    const key = (row.businessLink + "|" + row.name).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  // ---- 1. JSON-LD ----
  const flatten = (data) => (Array.isArray(data) ? data : data && data["@graph"] ? data["@graph"] : [data]);
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    let data;
    try { data = JSON.parse(s.textContent); } catch (e) { return; }
    flatten(data).forEach((node) => {
      if (!node || typeof node !== "object") return;
      const type = [].concat(node["@type"] || []).join(",").toLowerCase();

      if (node.itemListElement) {
        [].concat(node.itemListElement).forEach((el) => {
          const item = el.item && typeof el.item === "object" ? el.item : el;
          push(makeRow({ name: item.name || el.name, link: abs(item.url || el.url || ""), phone: item.telephone, address: addressText(item.address) }));
        });
      } else if ((/business|store|restaurant|organization|clinic|physician|dentist|hospital|school/.test(type)) && node.name && (node.telephone || node.address)) {
        push(makeRow({ name: node.name, phone: node.telephone, address: addressText(node.address), category: [].concat(node["@type"]).join(", "), link: abs(node.url || "") }));
      }
    });
  });

  // ---- 2. Repeated items on the page ----
  if (rows.length < 2) {
    const bestLink = (root) => {
      // Prefer a link inside a heading, otherwise the link with the longest text.
      const inHeading = root.querySelector("h1 a[href], h2 a[href], h3 a[href], h4 a[href], a[href] h1, a[href] h2, a[href] h3, a[href] h4");
      let a = inHeading && (inHeading.tagName === "A" ? inHeading : inHeading.closest("a"));
      if (a && clean(a.textContent).length >= 8) return a;
      let best = null;
      root.querySelectorAll("a[href]").forEach((l) => {
        if (!/^https?:|^\.?\//.test(l.getAttribute("href"))) return;
        if (!best || clean(l.textContent).length > clean(best.textContent).length) best = l;
      });
      return best;
    };

    document.querySelectorAll('article, [role="article"]').forEach((art) => {
      const a = bestLink(art);
      if (!a) return;
      const name = clean(a.textContent);
      if (name.length < 12) return;
      const tel = art.querySelector('a[href^="tel:"]');
      // Publisher / source name if the card shows one (e.g. news sources), else the site name.
      const src = art.querySelector(".vr1PYe, [data-n-tid], .source, [class*='source'], [class*='publisher']");
      push(makeRow({
        name,
        link: abs(a.getAttribute("href")),
        phone: tel ? tel.getAttribute("href").replace("tel:", "") : "",
        category: src ? clean(src.textContent) : ""
      }));
    });

    // Headings with links (blogs, directories, listings that don't use <article>).
    if (rows.length < 5) {
      document.querySelectorAll("h1 a[href], h2 a[href], h3 a[href], h4 a[href]").forEach((a) => {
        const name = clean(a.textContent);
        if (name.length < 15) return;
        push(makeRow({ name, link: abs(a.getAttribute("href")) }));
      });
    }

    // Headline-like links anywhere in the page content (e.g. the current Google News layout).
    if (rows.length < 5) {
      document.querySelectorAll("a[href]").forEach((a) => {
        if (a.closest("nav, header, footer, aside, [role='navigation'], [role='banner'], [role='contentinfo']")) return;
        const name = clean(a.textContent).replace(/\s*(chevron_right|arrow_forward|open_in_new)$/i, "");
        if (name.length < 25 || name.length > 250 || name.split(" ").length < 4) return;
        if (!/^https?:|^\.?\//.test(a.getAttribute("href"))) return;

        // Publisher name: look for a source label in the nearest few ancestors.
        let src = null;
        for (let p = a.parentElement, i = 0; p && i < 5 && !src; p = p.parentElement, i++) {
          src = p.querySelector(".vr1PYe, [class*='source'], [class*='publisher']");
        }
        push(makeRow({ name, link: abs(a.getAttribute("href")), category: src ? clean(src.textContent) : "" }));
      });
    }
  }

  // ---- 3. Fallback: the page itself ----
  if (!rows.length) {
    let phone = "";
    const tel = document.querySelector('a[href^="tel:"]');
    if (tel) phone = clean(tel.getAttribute("href").replace("tel:", ""));
    const ip = document.querySelector('[itemprop="address"]');
    push(makeRow({
      name: siteName,
      phone,
      address: ip ? clean(ip.textContent) : "",
      category: meta('meta[property="og:type"]') || host
    }));
  }

  return rows;
})();
