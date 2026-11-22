#!/usr/bin/env python3
"""TradeMargin price-feed refresh. Only source-verified product prices are exported.

Configure APIFY_TOKEN as a GitHub Actions secret. This starter adapter supports
a RONA product search actor. Other suppliers require separate vetted adapters.
This script does not invent prices or silently reuse estimates.
"""
import datetime as dt
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data/prices.json"
PRODUCTS = ROOT / "data/price_queries.json"
ACTOR = "fayoussef~rona-scraper"
API = f"https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items"
MAX_ITEMS = 100

def request_json(url, data=None):
    token = os.environ.get("APIFY_TOKEN", "")
    if not token:
        raise ValueError("APIFY_TOKEN not configured; feed not changed.")
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8") if data is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=300) as response:
        return json.loads(response.read().decode("utf-8"))

def parse_price(row):
    for key in ("price", "salePrice", "currentPrice", "sellingPrice"):
        value = row.get(key)
        if isinstance(value, dict):
            value = value.get("value") or value.get("amount")
        if isinstance(value, str):
            value = re.sub(r"[^0-9.]", "", value)
        try:
            n = float(value)
            if n > 0 and n < 10000000:
                return round(n, 2)
        except (TypeError, ValueError):
            pass
    return None

def main():
    queries = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    terms = [q["query"] for q in queries if q.get("query")][:20]
    if not terms:
        raise ValueError("No price queries configured")
    payload = {"searchTerms": terms, "maxItems": MAX_ITEMS,
               "keywordMatchesOnly": True, "productDetails": False}
    # Store-specific prices need a verified RONA store number. Never claim
    # results represent Moncton when the actor uses its default store.
    store_num = os.environ.get("RONA_STORE_NUMBER", "").strip()
    if store_num:
        payload["storeNumber"] = store_num
    data = request_json(API, payload)
    if not isinstance(data, list):
        raise RuntimeError("Supplier returned unexpected payload; feed unchanged.")
    offers = []
    for row in data:
        if not isinstance(row, dict):
            continue
        price = parse_price(row)
        url = next((row.get(k) for k in ("url", "productUrl", "product_url", "link") if isinstance(row.get(k), str) and row.get(k).startswith("https://")), None)
        title = next((row.get(k) for k in ("title", "name", "productName") if isinstance(row.get(k), str)), None)
        if not price or not title or not url or "rona.ca" not in url:
            continue
        offers.append({"store": "RONA", "name": title, "price": price, "url": url,
                       "sku": str(row.get("sku") or row.get("model") or ""),
                       "query": "", "location": f"RONA store {store_num}" if store_num else "RONA actor default store (not Moncton verified)"})
    if not offers:
        raise RuntimeError("No valid source-linked prices returned; feed unchanged.")
    output = {"updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
              "location": f"RONA store {store_num}" if store_num else "Store location not verified",
              "provider": "Apify RONA actor", "offers": offers,
              "note": "Search results require product-match and package-size verification; not guaranteed local inventory."}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(offers)} source-linked RONA listings.")

if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, urllib.error.HTTPError, urllib.error.URLError) as exc:
        print(f"Price refresh not completed: {exc}", file=sys.stderr)
        sys.exit(1)
