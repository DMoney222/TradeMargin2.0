#!/usr/bin/env python3
"""Optional supplier-feed collector for TradeMargin.

Run manually from GitHub Actions only. An Apify account and its token are required.
No secrets are exposed to the public site. Every returned price must have a direct
product link and an explicit store scope. Results are NOT automatically exact matches.
"""
import datetime as dt
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
QUERY_FILE = ROOT / "data" / "price_queries.json"
OUTPUT = ROOT / "data" / "prices.json"
MAX_QUERIES = 12
MAX_PER_SUPPLIER = 35

# All five actors have public catalog/search listings, but are independent
# third-party services. "configured" does not imply tested, free, or authorized
# for unrestricted commercial use. Check their current terms before activating.
SUPPLIERS = {
    "Kent": {
        "actor": "loudtzu~kent-ca-product-search",
        "keyword_field": "searchTerms", "domain": "kent.ca",
        "store_env": None,
    },
    "Home Depot Canada": {
        "actor": "loudtzu~homedepot-ca-product-search",
        "keyword_field": "keywords", "domain": "homedepot.ca",
        "store_env": "HOME_DEPOT_STORE_ID",
    },
    "RONA": {
        "actor": "fayoussef~rona-scraper",
        "keyword_field": "searchTerms", "domain": "rona.ca",
        "store_env": "RONA_STORE_NUMBER",
    },
    "Home Hardware": {
        "actor": "loudtzu~home-hardware-product-search",
        "keyword_field": None, "domain": "homehardware.ca",
        "store_env": None,
    },
    "Canadian Tire": {
        "actor": "loudtzu~canadian-tire-product-search",
        "keyword_field": "keywords", "domain": "canadiantire.ca",
        "store_env": "CANADIAN_TIRE_STORE_ID",
    },
}

def is_valid_product_url(value, domain):
    if not isinstance(value, str):
        return False
    try:
        parts = urllib.parse.urlparse(value)
        host = (parts.hostname or "").lower()
        return parts.scheme == "https" and (host == domain or host.endswith("." + domain))
    except ValueError:
        return False

def price_as_number(item):
    for key in ("price", "currentPrice", "salePrice", "sellingPrice"):
        value = item.get(key)
        if isinstance(value, dict):
            value = value.get("value", value.get("amount"))
        if isinstance(value, str):
            value = re.sub(r"[^0-9.]", "", value)
        try:
            value = float(value)
            if 0 < value < 1_000_000:
                return round(value, 2)
        except (TypeError, ValueError):
            continue
    return None

def normalize_rows(supplier, config, rows, store_id, checked_at):
    result = []
    if not isinstance(rows, list):
        raise ValueError("Unexpected output format")
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = next((row.get(k) for k in ("name", "title", "productName", "product")
                     if isinstance(row.get(k), str) and row.get(k).strip()), None)
        url = next((row.get(k) for k in ("url", "productUrl", "product_url", "link")
                    if is_valid_product_url(row.get(k), config["domain"])), None)
        amount = price_as_number(row)
        if not name or not url or amount is None:
            continue
        currency = str(row.get("currency") or "CAD").upper()
        if currency != "CAD":
            continue
        store_scope = ("Store #" + store_id) if store_id else "Store not verified — website/default location"
        result.append({
            "store": supplier, "name": name.strip(), "price": amount, "url": url,
            "sku": str(row.get("sku") or row.get("productId") or row.get("modelNumber") or ""),
            "query": str(row.get("searchQuery") or row.get("searchTerm") or ""),
            "currency": "CAD", "unit": str(row.get("unitOfMeasure") or ""),
            "location": store_scope, "store_verified": bool(store_id),
            "stock": row.get("storeQuantity", row.get("storeStockLevel")),
            "checked_at": checked_at,
        })
    return result

def api_call(token, config, terms, store_id):
    body = {"maxItems": min(MAX_PER_SUPPLIER, max(5, len(terms) * 3))}
    if config["keyword_field"]:
        body[config["keyword_field"]] = terms
    else:
        # This Home Hardware actor supports category URLs only.
        # Do not waste credits by sending unsupported keyword searches.
        raise ValueError("Home Hardware requires category URLs; keyword search is unsupported")
    supplier_actor = config["actor"]
    if supplier_actor.startswith("fayoussef~"):
        body.update({"keywordMatchesOnly": True, "productDetails": False})
        if store_id:
            body["storeNumber"] = store_id
    elif store_id:
        body["storeId"] = store_id
    api_url = ("https://api.apify.com/v2/acts/" + supplier_actor
               + "/run-sync-get-dataset-items?timeout=240")
    request = urllib.request.Request(
        api_url, data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=270) as response:
        return json.loads(response.read().decode("utf-8"))

def collect(token, selected=None, runner=api_call):
    terms = [str(row["query"]).strip() for row in
             json.loads(QUERY_FILE.read_text(encoding="utf-8"))
             if isinstance(row, dict) and row.get("query")]
    terms = list(dict.fromkeys(terms))[:MAX_QUERIES]
    if not terms:
        raise ValueError("No product queries")
    checked_at = dt.datetime.now(dt.timezone.utc).isoformat()
    selected = selected or list(SUPPLIERS)
    all_offers = []
    statuses = {}
    for supplier in selected:
        if supplier not in SUPPLIERS:
            raise ValueError("Unknown supplier: " + supplier)
        config = SUPPLIERS[supplier]
        store_id = os.environ.get(config["store_env"], "").strip() if config["store_env"] else ""
        try:
            rows = runner(token, config, terms, store_id)
            offers = normalize_rows(supplier, config, rows, store_id, checked_at)
            all_offers.extend(offers)
            statuses[supplier] = {"status": "results" if offers else "no_valid_prices",
                                  "offers": len(offers), "store": store_id or "unverified"}
        except (ValueError, TimeoutError, urllib.error.URLError,
                json.JSONDecodeError) as exc:
            statuses[supplier] = {"status": "error", "offers": 0,
                                  "detail": str(exc)[:200], "store": store_id or "unverified"}
    if not all_offers:
        raise RuntimeError("No source-linked CAD offers from any supplier; existing feed unchanged. " +
                           json.dumps(statuses))
    # Compare only the same source product at the same store scope. Never
    # call a missing product a price change, or compare prices across stores.
    previous = {}
    if OUTPUT.exists():
        try:
            old = json.loads(OUTPUT.read_text(encoding="utf-8"))
            for row in old.get("offers", []):
                key = (row.get("store"), row.get("url"), row.get("location"))
                if key[0] and key[1]:
                    previous[key] = row
        except (ValueError, OSError):
            pass
    changes = []
    for row in all_offers:
        key = (row["store"], row["url"], row["location"])
        older = previous.get(key)
        if not older:
            continue
        try:
            before = float(older["price"])
        except (ValueError, TypeError, KeyError):
            continue
        after = float(row["price"])
        if round(before, 2) == round(after, 2):
            continue
        change = {
            "store": row["store"], "name": row["name"], "url": row["url"],
            "location": row["location"], "previous_price": before,
            "new_price": after, "difference": round(after - before, 2),
            "previous_checked_at": older.get("checked_at", old.get("updated_at")),
            "checked_at": checked_at,
        }
        row["previous_price"] = before
        row["price_change"] = change["difference"]
        changes.append(change)
    data = {
        "changes": changes,
        "change_count": len(changes),
        "updated_at": checked_at,
        "location": "Store-local only when explicit store ID configured",
        "provider": "Independent Apify actors (not retailer partnerships)",
        "offers": all_offers,
        "suppliers": statuses,
        "note": ("Candidate listings only; verify product identity, pack size, retailer permissions, "
                 "current store pricing and stock. Unverified/default stores are not Moncton offers."),
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    return data

def main():
    token = os.environ.get("APIFY_TOKEN", "").strip()
    if not token:
        raise ValueError("APIFY_TOKEN secret not configured; no supplier calls made")
    selected = [s.strip() for s in os.environ.get("SUPPLIERS", "").split(",") if s.strip()]
    data = collect(token, selected or None)
    print("Supplier status:", json.dumps(data["suppliers"]))
    print("Offers:", len(data["offers"]))

if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as exc:
        print("Price feed not changed:", exc, file=sys.stderr)
        sys.exit(1)
