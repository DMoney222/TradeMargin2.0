# TradeMargin research API

This folder contains TradeMargin's own **public-web research service**. It reads public indexed retailer product pages and extracts explicitly CAD-priced Product/Offer JSON-LD. It does **not** require Apify, another paid search service or an installation on the user's iPad.

**Limitations:** Search engines can withhold links, retailers can block automated requests and many pages do not publish a structured price. The API only returns prices it actually found. There is no guarantee of all stores, local pricing, or stock. Free Workers have usage/resource limits.

## Deploy without downloading anything

1. Create/log into a Cloudflare account in Safari. Use the free Workers plan.
2. In GitHub **Settings → Secrets and variables → Actions**, set secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Generate the token in Cloudflare with **Workers Scripts: Edit** permissions scoped to your account. Never paste tokens into a website or this chat.
3. Create GitHub Actions **repository variable** `ENABLE_RESEARCH_DEPLOY=true`.
4. Open GitHub Actions → **Deploy TradeMargin research API** → Run workflow. The deployment output will show the `https://trademargin-research.<subdomain>.workers.dev` URL.
5. Open TradeMargin → **Research service URL** → paste that Worker URL and select Save. The website remembers it locally.
6. Test a material search. Matching retailer results appear below that material. Select a product to add its CAD price.

The Worker is a publicly reachable API, **not private browsing**. It restricts targets to the five configured retailer domains and returns retailer prices to any caller. For a commercial launch add a managed rate limit and authentication, monitoring, and a more reliable licensed product-search source.
