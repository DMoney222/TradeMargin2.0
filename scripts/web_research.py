#!/usr/bin/env python3
"""TradeMargin independent web research proof of concept.

Searches public, indexed product pages and reads structured Product/Offer data.
No retailer account, Apify token, or fake pricing. Sites may block requests.
This is a manually launched research job, NOT an on-click hosted browser.
"""
import datetime as dt
import html
import json
import os
import pathlib
import re
import urllib.parse
import urllib.request
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "web_research.json"
STORES = {
    "Kent": "kent.ca",
    "Home Depot Canada": "homedepot.ca",
    "RONA": "rona.ca",
    "Home Hardware": "homehardware.ca",
    "Canadian Tire": "canadiantire.ca",
}
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; TradeMarginResearch/0.1; +https://github.com/DMoney222/TradeMargin2.0)"}

class StructuredData(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inside = False
        self.parts = []
        self.scripts = []
    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("type", "").lower() == "application/ld+json":
            self.inside = True
            self.parts = []
    def handle_data(self, data):
        if self.inside:
            self.parts.append(data)
    def handle_endtag(self, tag):
        if tag == "script" and self.inside:
            self.scripts.append("".join(self.parts))
            self.inside = False

def get_page(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=14) as response:
        if response.status != 200:
            raise ValueError("HTTP " + str(response.status))
        return response.read(1_000_000).decode("utf-8", "replace")

def safe_site(url, site):
    parsed = urllib.parse.urlparse(url)
    return parsed.scheme == "https" and (parsed.hostname == site or (parsed.hostname or "").endswith("." + site))

def product_nodes(node):
    if isinstance(node, list):
        for x in node:
            yield from product_nodes(x)
    if isinstance(node, dict):
        typ = node.get("@type", "")
        if isinstance(typ, list):
            typ = " ".join(map(str, typ))
        if "Product" in str(typ):
            yield node
        for key in ("@graph", "mainEntity", "itemListElement"):
            if key in node:
                yield from product_nodes(node[key])

def extract_product(page, url, store, query):
    p = StructuredData()
    p.feed(page)
    rows = []
    for raw in p.scripts:
        try:
            data = json.loads(html.unescape(raw))
        except (ValueError, TypeError):
            continue
        for product in product_nodes(data):
            offers = product.get("offers", {})
            if isinstance(offers, list):
                offers = next((x for x in offers if isinstance(x, dict) and x.get("price")), {})
            if not isinstance(offers, dict):
                continue
            price = offers.get("price", offers.get("lowPrice"))
            try:
                amount = round(float(str(price).replace(",", "")), 2)
            except (ValueError, TypeError):
                continue
            currency = offers.get("priceCurrency")
            if currency not in ("CAD", None) or not 0 < amount < 100000:
                continue
            name = product.get("name")
            if not isinstance(name, str) or not name.strip():
                continue
            rows.append({"store": store, "name": name.strip(), "price": amount,
                         "url": url, "currency": "CAD" if currency == "CAD" else "unspecified",
                         "currency_verified": currency == "CAD", "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                         "source": "Retailer product structured data", "query": query,
                         "store_verified": False, "stock_verified": False})
    return rows

def discover(site, query):
    """Public Bing RSS discovery; may be unavailable or contain no product URLs."""
    terms = "site:" + site + " " + query
    url = "https://www.bing.com/search?format=rss&q=" + urllib.parse.quote(terms)
    page = get_page(url)
    import xml.etree.ElementTree as ET
    root = ET.fromstring(page)
    urls = []
    for row in root.findall(".//item/link"):
        link = (row.text or "").strip()
        if safe_site(link, site) and link not in urls:
            urls.append(link)
    return urls[:5]

def main():
    query = os.environ.get("RESEARCH_QUERY", "").strip()
    if not 3 <= len(query) <= 140:
        raise SystemExit("Provide RESEARCH_QUERY (3–140 characters)")
    if any(ord(c) < 32 for c in query):
        raise SystemExit("Invalid control character in search")
    results, status = [], {}
    for store, site in STORES.items():
        checked, reason = 0, ""
        try:
            for url in discover(site, query):
                try:
                    rows = extract_product(get_page(url), url, store, query)
                    results.extend(rows)
                    checked += 1
                except (OSError, ValueError, TimeoutError) as exc:
                    reason = str(exc)[:120]
            status[store] = {"checked_pages": checked, "products": sum(x["store"] == store for x in results),
                             "note": reason or ("No indexed product pages matched" if checked == 0 else "")}
        except Exception as exc:
            status[store] = {"checked_pages": 0, "products": 0, "note": str(exc)[:150]}
    data = {"query": query, "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "offers": results, "suppliers": status,
            "note": "Experimental public-web research only. Listings not automatically exact matches, local prices or stock. Validate dimensions, pack size and checkout price."}
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"query": query, "results": len(results), "suppliers": status}, indent=2))

if __name__ == "__main__":
    main()
