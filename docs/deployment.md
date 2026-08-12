# Azure Container Apps deployment

## Prerequisites

- Azure CLI with Bicep, Docker, and the required Azure permissions.
- An eligible PriceCharting subscription and API token.
- Written PriceCharting permission for the intended hosted redistribution.
- `PRICECHARTING_API_TOKEN` and `PRICECHARTING_REDISTRIBUTION_APPROVED=true` in the operator's
  protected environment.

Never place provider tokens, caller keys, subscription IDs, or tenant IDs in tracked files.

## Provision

```bash
PRICECHARTING_API_TOKEN='...' \
PRICECHARTING_REDISTRIBUTION_APPROVED=true \
./scripts/bootstrap/provision.sh dev eastus
```

The two-pass bootstrap creates shared resources, stores separate caller and PriceCharting secrets in
Key Vault, builds an immutable image, and deploys the app. The provider token is never printed.

The default maximum is one replica because PriceCharting's documented one-request-per-second quota
is enforced in process. Do not scale horizontally until a distributed upstream limiter has been
introduced and the provider agreement permits the resulting traffic.

Health probes never call PriceCharting. Provider errors and quota exhaustion must be monitored
without exporting tokens, authenticated URLs, raw responses, or user collection data. Caching stays
disabled until written terms define allowed retention and redistribution.

Rotate the caller key and PriceCharting token independently by updating their Key Vault secrets and
starting a new Container App revision. Delete the generated resource group to destroy the example
after confirming it contains no shared resources.
