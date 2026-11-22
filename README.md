# TradeMargin 2.0

Trade-first estimating app for Canadian contractors: job-type templates, material lists, labour/markup/tax, supplier offers and shopping-stop cost optimizer.

## Website
https://dmoney222.github.io/TradeMargin2.0/

## Supplier pricing — current status
The app **does not yet automatically have live prices**. It has a real feed loader and an optional GitHub Actions data-collection integration. It never presents made-up sample prices as live results.

Click **Check available supplier price data** in an estimate to read `data/prices.json`. Candidate product listings are displayed with source URLs and timestamps. The estimator requires the user to confirm a product, unit and location before applying a price. This is deliberate: similar items, packs and locations can have different prices.

### Optional RONA price collection setup
TradeMargin has an **experimental RONA Apify actor connector** in `scripts/refresh_prices.py`, and a manual-only GitHub Action in `.github/workflows/refresh-prices.yml`.

1. Obtain an Apify account and token; usage may cost money. Review the actor's terms, pricing and reliability independently.
2. Add `APIFY_TOKEN` as a GitHub repository **Actions secret** under Settings → Secrets and variables → Actions. Do **not** put it in JavaScript, this repository, an issue, or a chat message.
3. Optionally set `RONA_STORE_NUMBER` as a repository Actions **variable** to a verified local store number. Without this, the connector's default store **is not Moncton**.
4. Open Actions → **Refresh verified supplier prices** → Run workflow. If returned data is valid, the workflow commits an updated `data/prices.json`; otherwise it fails without inventing data.
5. Edit `data/price_queries.json` to set a limited set of product searches. The current example queries are not comprehensive. The refresh costs and coverage depend on the provider.

**Important:** The RONA actor's output schema can change, and its adapter has not been validated against a live token. The first run may require adapting the parser. It does not guarantee product matching, stock or locally verified availability. This is a starting integration, not a completed all-supplier service.

### Adding other suppliers
Kent, Home Depot Canada, Home Hardware, electrical distributors, plumbing wholesalers and other trade suppliers need separate authorized product feeds / provider integrations, source URLs, product/pack matching, and location-aware prices. There is **no universal, unrestricted free pricing API** known to support every supplier. Avoid scraping sites in violation of their terms, and do not assume all stores have publicly available API pricing.

## Limitations
- All estimate data is stored locally in your device browser.
- Quotes do not include full contractor overhead or net-profit accounting.
- Quotes and supplier comparisons need human validation before being sent to customers.
