# TradeMargin overnight price-research progress

## Scope
Eight automated hourly engineering checks, local time America/Moncton:
November 22, 2026 at 10:55 p.m. through November 23, 2026 at 5:55 a.m.
Owner explicitly requested ongoing work on live material price checking.

## Starting verified state — November 22, 2026, approximately 9:55 p.m. AST
- Repository: `DMoney222/TradeMargin2.0` main; site: https://dmoney222.github.io/TradeMargin2.0/
- Cloudflare Worker: https://trademargin2-0.damonpatrickwalsh.workers.dev
- GitHub last observed Cloudflare Workers build, GitHub Pages deployment and pricing probe marked successful.
- Prior public live tests observed Kent CAD $7.99 for 5/4 × 6 × 8 pressure-treated deck boards and Kent CAD $23.79 for #8 × 3 deck screws, 500-pack. This is **not** proof of local stock or a guaranteed current checkout price.
- A prior live test observed Lyons Timber Mart (Ontario) CAD $8.25 for the same size deck boards. The UI marks this as an out-of-area price reference, not a Moncton pickup option.
- Automated HTTP requests to Home Hardware, Graybar Canada, WESCO Canada and Eddy Group returned HTTP 403 in earlier tests. Home Depot Canada responses were unreliable/timeouts; a test of one publicly discovered product-search endpoint did not establish access. Contractor distributors may also require approved accounts for trade pricing.
- Current UI has Google/Safari retailer search links, manual quote fields, item matching, and separate supplier rows for these merchants.
- These checks establish access limitations, not that a product is unavailable.

## Engineering priorities
1. Diagnose Home Depot Canada and Home Hardware public price sources; prefer authorized feeds or public structured-data listings, avoid blocked endpoints or invented prices.
2. Support electrical wholesaler product discovery and authenticated/account-priced quotes only via authorized integration. Never handle users' credentials without a secure opt-in integration.
3. Improve matching by electrical specifications, package size, dimensions, currency, store region and timestamps.
4. Add automated tests and execute real Cloudflare endpoint probes. Record each meaningful update below.

## Hourly log
(Each scheduled pass should append timestamp, findings, code commits, test and deployment verification; distinguish attempted fixes from verified outcomes.)
