# Game Price Agent Tool Server

Read-only PriceCharting catalog and current-price tools exposed through one typed registry over stdio
MCP, stateless Streamable HTTP MCP, and HTTP/OpenAPI.

> **Hosting restriction:** a normal PriceCharting API subscription does not establish permission to
> redistribute its data to tool users. Production startup requires the operator to attest that
> written redistribution permission has been obtained. See
> [`docs/pricecharting-provider.md`](docs/pricecharting-provider.md).

## Tools

| Tool                              | Purpose                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `game_prices_get_capabilities`    | Report verified provider features and explicit limitations    |
| `game_prices_search_catalog`      | Search the partial product catalog                            |
| `game_prices_get_product`         | Get a normalized product and provider-supplied current prices |
| `game_prices_match_product`       | Match an ID, UPC, or description without hiding ambiguity     |
| `game_prices_compare_products`    | Compare structured fields and available conditions            |
| `game_prices_estimate_collection` | Estimate only unambiguous priced entries; disabled by default |

Prices are integer US cents returned by PriceCharting. Conditions are emitted only when the provider
supplies them. Estimates are not guaranteed sale values and make no claims about historical sales,
comparable sales, or market liquidity.

## Architecture

```text
HTTP / OpenAPI / MCP
         |
    ToolRegistry
         |
    PriceService
         |
PriceChartingProvider
```

`src/tools/definitions.ts` is the sole tool definition source. Its Zod schemas drive runtime
validation, MCP registration, JSON Schema, and OpenAPI operations.

## Local development

Node.js 22 is required.

```bash
npm ci
cp .env.example .env
# Add PRICECHARTING_API_TOKEN from an eligible PriceCharting subscription.
npm run dev
```

Development can start without a provider token so capability metadata can be inspected; provider
calls then return `provider_authentication`. Production requires:

- `AUTH_MODE=api-key` and one or more 32-character `API_KEYS`;
- `PRICECHARTING_API_TOKEN`;
- `PRICECHARTING_REDISTRIBUTION_APPROVED=true`, set only after written approval.

The adapter uses HTTPS query-token authentication, a one-request-per-second upstream default,
single-request concurrency, bounded retry/backoff, strict timeouts, and no persistent cache. Caller
rate limiting is separate. Keep a single replica unless upstream quota is coordinated across
replicas.

## Matching and estimates

Matching precedence is exact PriceCharting ID, exact UPC, then ranked normalized title and platform.
Conflicts, close candidates, weak matches, and unavailable requested conditions are not silently
resolved. Match confidence is not price confidence.

Collection estimates exclude ambiguous, unmatched, and condition-unavailable entries from the
included total and report coverage counts. Enable them only when the negotiated PriceCharting
agreement permits the intended bulk and redistribution use.

## Endpoints

| Method            | Path                | Authentication |
| ----------------- | ------------------- | -------------- |
| `GET`             | `/health`           | Public         |
| `GET`             | `/version`          | Public         |
| `GET`             | `/openapi.json`     | Public         |
| `GET`             | `/tools`            | Required       |
| `POST`            | `/tools/{toolName}` | Required       |
| `GET/POST/DELETE` | `/mcp`              | Required       |

Public HTTP responses use `Cache-Control: no-store`. Credentials, authenticated provider URLs, raw
provider responses, and collection inputs are not logged.

## Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run openapi:emit
npm run metadata:validate
docker build -t agent-tool-server-game-prices .
az bicep build --file infra/main.bicep
az bicep lint --file infra/main.bicep
```

See [`docs/deployment.md`](docs/deployment.md) for the Azure example.
