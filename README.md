# TradeMargin 2.0

A free-to-use browser-based estimating app for tradespeople, with job-type selection, material lists, labour/markup/tax calculations, and multi-supplier shopping-cost comparisons.

**Website:** https://dmoney222.github.io/TradeMargin2.0/

## Supplier integration status (November 22, 2026)

**Five optional supplier adapters are now implemented in code, but none has passed a live authenticated pricing test in this repository.** The price feed has no confirmed prices until you configure and manually run a provider. Do not confuse an adapter with a verified working supplier connection.

| Supplier | Third-party adapter | Status | Store scope |
|---|---|---|---|
| Kent | `loudtzu/kent-ca-product-search` | Coded, not live-tested | Store-specific scope unverified |
| Home Depot Canada | `loudtzu/homedepot-ca-product-search` | Coded, not live-tested | Set `HOME_DEPOT_STORE_ID` |
| RONA | `fayoussef/rona-scraper` | Coded, not live-tested | Set `RONA_STORE_NUMBER` |
| Home Hardware | `loudtzu/home-hardware-product-search` | Coded, input schema needs live validation | Store-specific scope unverified |
| Canadian Tire | `loudtzu/canadian-tire-product-search` | Coded, not live-tested | Set `CANADIAN_TIRE_STORE_ID` |

*These are independent Apify scraping actors, NOT official retail APIs or trade partnerships.* They may charge fees, fail, or be subject to retailer terms. Review permissions and service pricing before using them. The app remains free to users, but operating a widespread up-to-date pricing feed may incur backend costs.

## Optional trial run (only with your authorization)

1. Create your own Apify account, review the provider/retailer terms, and obtain an API token.
2. Open this GitHub repository → **Settings → Secrets and variables → Actions**. Add the token as an **Actions secret** named `APIFY_TOKEN`. **Never place it in a public file, issue, chat or website code.**
3. In Actions **Variables**, optionally add `RONA_STORE_NUMBER`, `HOME_DEPOT_STORE_ID`, and `CANADIAN_TIRE_STORE_ID` once you've confirmed their genuine local store numbers. Otherwise any prices must be treated as **not verified for Moncton**.
4. Open **Actions → Refresh verified supplier prices → Run workflow**. You may provide a comma-separated subset such as `Kent,RONA` or leave blank for all five. This workflow **never runs on a schedule**, preventing surprise ongoing charges.
5. Check the run result and `data/prices.json`. The script caps searches at 12 queries and 35 listings per supplier per run, rejects entries without plausible positive CAD prices or valid retailer-hosted HTTPS product URLs, and retains failed supplier statuses.
6. The website's **Check available supplier price data** button reads that file; candidate matches still require human verification before being copied into an estimate.

The site is a public static website. It does not have a private secure server that searches suppliers on every customer click. The manual refresh publishes a **shared cached snapshot**, not real-time per-user pricing. The search query list is at `data/price_queries.json`.

## Coverage and reliability limitations

- A supplier's catalogue online does **not** guarantee reliable, authorized, free programmatic pricing.
- Actor inputs/outputs may change; verify each with a small live test before announcing compatibility.
- No local store address, route, driving time or inventory is verified without a separate store-data integration.
- Similar names do not establish the same size, grade, package, SKU or unit price. Product matching is deliberately a **suggestion**, not an automatic purchase recommendation.
- Kent and Home Hardware currently lack verified store-number targeting with the chosen adapters. Store-default catalog prices must not be presented as confirmed local store offers.
- Trade-specialist suppliers (Guillevin, Nedco, Westburne, EMCO, Wolseley) are not included until they have a supported authorized pricing source.
- The price feed remains empty until successful authenticated collection; missing data is displayed honestly rather than filled with estimated prices.
- Pricing numbers used for customer quotes should be verified and costs/overhead included before bidding.

## Architecture

- `index.html`: static all-trades app, saved estimates in local browser storage, user-verified candidate product matching.
- `scripts/refresh_prices.py`: backend-only adapter orchestrator; source URL, currency, time, basic schema validation, error isolation.
- `data/price_queries.json`: capped sample searches across several trades.
- `data/prices.json`: public read-only feed snapshot that the website loads.
- `.github/workflows/refresh-prices.yml`: **manual** collection with an external token; requires Actions write permissions.
- `.github/workflows/pages.yml`: publish the website.

**Roadmap:** official supplier data or retailer partnerships, shared product IDs and package-size normalization, permissioned update workers, location-verified stock, prices per customer-request, and user accounts/10-free-estimate policy. Those are not implemented yet.
