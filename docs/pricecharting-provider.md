# PriceCharting provider verification

Reviewed on **2026-08-12**. The sandbox could not resolve `pricecharting.com`, so the official pages
could not be archived or read directly. The findings below were cross-checked through web-search
indexes that cited those first-party pages. Re-verify the live documents and retain an approved copy
before production deployment.

## First-party sources

- [API documentation](https://www.pricecharting.com/api-documentation)
- [Subscription information](https://www.pricecharting.com/pricecharting-pro)
- [Terms of service](https://www.pricecharting.com/page/terms-of-service)
- [Price-guide terms](https://www.pricecharting.com/page/guide-terms-of-service)

## Verified for the MVP

- API access requires an eligible paid subscription and a private token.
- Read requests use `https://www.pricecharting.com/api/product` with `t` plus `id` or `upc`, and
  `/api/products` with `t` plus `q`.
- The documented standard rate is one request per second.
- Product data includes an ID, product name, console name, and integer US-cent current prices.
- Documented price concepts include loose, complete-in-box, new, and graded. Box-only and
  manual-only fields appear in available API descriptions but must be reconfirmed against the live
  subscribed documentation before relying on them contractually.
- Product ID and UPC are supported lookup identifiers. UPCs are handled as strings.
- Search pagination, category enumeration, and platform enumeration are not documented.
- Historical price series, comparable sales, and liquidity are not exposed by the documented read
  API and are intentionally unsupported.
- No explicit caching allowance or mandatory attribution rule could be verified. Caching is disabled
  and responses include conservative attribution.

## Permission required

The indexed terms identify PriceCharting as the data owner and do not establish that an ordinary API
subscription permits redistribution to third-party tool users. Obtain written permission covering:

- hosted HTTP and MCP responses;
- commercial and non-commercial redistribution;
- collection-scale/bulk valuation;
- persistent or shared caching, stale serving, and derived-data retention;
- the required attribution wording and link;
- any future historical, comparable-sale, or sales-volume use.

Production refuses to start unless the operator supplies a token and explicitly sets
`PRICECHARTING_REDISTRIBUTION_APPROVED=true`. This flag is an operator attestation, not a substitute
for permission.

## Unresolved contract details

- Current qualifying subscription tier and price.
- Token lifecycle and rotation process.
- Whether the quota is per account, token, or IP; burst, daily, and concurrent limits.
- Complete API category coverage and collectible-specific condition semantics.
- Formal limits on search result count and collection/bulk workflows.
- Structured edition, region, variant, and release metadata.
- Cache duration, persistence, downstream cache, and retention rights.
- Exact attribution requirements and approved provider URLs.

Do not loosen these capability flags or deployment gates until the live documentation and written
agreement resolve the applicable item.
