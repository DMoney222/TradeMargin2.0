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

### November 22, 2026 — initial follow-up before overnight runs

- **Scope reaffirmed:** Owner requested continued problem solving for all suppliers for the next eight hours. Existing hourly overnight automation was updated to cover every named retailer, verify actual results, and continue improvements without claiming inaccessible sources work.
- **Concrete accuracy fix:** Worker version `3.6.0` now requires an **exact fastener package count** when the requested material specifies a pack size. This prevents a 100-pack of deck screws being mistaken for a 500-pack of the same gauge and length. Client-side `classifyMatch` uses the same check so old saved supplier listings cannot bypass it.
- **Commits:** `30e8a09` Worker logic, `eb3771f` frontend logic, `4ab4d51` automated test fixtures for 100-vs-500 packs.
- **Tests:** GitHub workflow "Verify TradeMargin search API" completed **successfully** for commit `4ab4d51`. The later GitHub Pages/Cloudflare automatic deployments should be checked separately; a passing mock test is **not** proof of live retailer access.
- **Vendor limitations:** Home Depot Canada, Home Hardware, Graybar, WESCO, Eddy, BMR and other sources remain unverified for automated prices where earlier checks encountered timeouts, HTTP 403, or account-gated prices. Do not bypass protections. Home Depot Canada, Home Hardware and wholesalers remain priorities.
- **Remaining accuracy issue:** When a user enters generic "deck screws" without a package quantity, offers of unlike pack sizes may still be incomparable. Warn users to specify an exact pack size before comparing, and improve unit-price normalization in a future pass.

### November 22, 2026 — 10:55 p.m. AST (first scheduled review)

- **Repository inspected:** main branch Worker `3.6.0` (`worker/src/index.js`), seven Worker mock tests, and overnight log. GitHub Pages workflow run [45097587373](https://github.com/DMoney222/TradeMargin2.0/actions/runs/45097587373) completed successfully for commit `e4bc5b1`; this confirms Pages publication, **not** Cloudflare Worker deployment or live supplier prices.
- **Live probe limitation:** Attempt to fetch the Cloudflare Worker `/health` URL through available web access failed at the tool/network layer. No valid HTTP status or response body was obtained; do not claim the Worker is down or healthy on this basis. Container outbound DNS to raw.githubusercontent.com also failed, preventing local download and execution of the test suite in this run. No untested code was committed.
- **Accuracy bug identified for next tested fix:** `productData()` currently accepts `o.lowPrice` when `o.price` is absent, including on JSON-LD `AggregateOffer` objects. A category/product price range can therefore be displayed as if it were a purchasable exact offer. Require a real `Offer` with an explicit `price`, or label price ranges separately and exclude them from bid comparisons. Add regression tests for `AggregateOffer`, `lowPrice`, and valid `Offer`.
- **Additional correctness issue:** The request cache key includes only version and normalized query, not geographic location; current results are explicitly not store-specific, so do not present them as local pickup quotes. If store-specific pricing is introduced, add store/postal code to the cache key and source provenance.
- **Supplier status:** No new supplier was verified in this pass. Graybar and Eddy are deliberately marked account-required; WESCO and other sites still need evidence-based diagnosis. Kent/Lyons prior prices are historical observations, not current checkout confirmations.
- **Next action:** Execute isolated tests and commit the aggregate-price guard, then verify the Worker deployment and public endpoints from an environment with outbound HTTP access. Keep protected/account pricing out of the public-price pipeline.
