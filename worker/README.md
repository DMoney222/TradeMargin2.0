# TradeMargin 2.0 — Research API

TradeMargin's **automatic material-price research** is deployed as a Cloudflare Worker:

**https://trademargin2-0.damonpatrickwalsh.workers.dev**

The website is **https://dmoney222.github.io/TradeMargin2.0/**. Its default research endpoint is already configured. Users do **not** need to download anything, enter API tokens, or set up hosting.

## Architecture

- `worker/src/index.js`: Product discovery and HTML/JSON-LD extraction. Uses verified CAD product/offer metadata where available. Includes targeted product-page checks and Kent's onsite product catalogue with search-index fallback.
- `index.html`: Per-material search UI; validates category, treatment, dimensions and screw lengths and groups returned prices under the matching supplier. A selected price is added to the estimate.
- `data/verified_listings.json`: Dated, manually checked *historical retailer listing examples*. **Never label these as live quotations or Moncton stock.**
- `data/prices.json`: Older Apify-collected retailer listing data.
- `worker/tests/research.test.mjs`: Self-contained Node.js mock tests (run by GitHub Actions).
- `worker/probe/live.mjs`: External end-to-end test against the published Worker (run by GitHub Actions).

## Deployment

Cloudflare **Workers Builds** is connected to this GitHub repository and automatically builds the Worker named `trademargin2-0` when changes are pushed to `main`. GitHub commit checks report **Workers Builds: trademargin2-0**. The website is published independently by the GitHub Pages workflow.

Manual GitHub Actions deployment is **not** required. If builds stop, open the Cloudflare dashboard for the `trademargin2-0` Worker and inspect its Builds tab, repository and branch. `wrangler.toml` is configured for that worker name.

## Important limitations

This is **not** a headless Google Chrome or Safari session. The free Worker fetches public pages. It cannot compel retailers to give access to their websites or local prices. Verified tests on November 22, 2026 returned a real Kent 5/4 × 6 × 8 pressure-treated board price, while Home Depot, RONA and Home Hardware returned HTTP 403 to the Worker. Other sources and catalogue snapshots are shown with their provenance and verification warnings.

Cloudflare free plans and public search indexes have usage, rate and reliability limits. At scale, implement authenticated accounts and proper rate limiting, and obtain licensed retailer price feeds or authorized retail integrations. Never represent scraped data as guaranteed accurate local checkout prices or inventory.
