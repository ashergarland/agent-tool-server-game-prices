import { z } from 'zod';
import type { Services } from '../services/index.js';

export interface ToolInvocationContext {
  readonly requestId: string;
  readonly principal: string;
}

export type ToolKind = 'read';

export interface ToolDefinition<
  InputSchema extends z.ZodType = z.ZodType,
  OutputSchema extends z.ZodType = z.ZodType,
> {
  readonly name: string;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly kind: ToolKind;
  readonly inputSchema: InputSchema;
  readonly outputSchema: OutputSchema;
  readonly handler: (
    input: z.output<InputSchema>,
    services: Services,
    context: ToolInvocationContext,
  ) => Promise<z.output<OutputSchema>>;
}

export const defineTool = <InputSchema extends z.ZodType, OutputSchema extends z.ZodType>(
  definition: ToolDefinition<InputSchema, OutputSchema>,
): ToolDefinition<InputSchema, OutputSchema> => definition;

const conditionSchema = z.enum(['loose', 'complete', 'new', 'graded', 'box-only', 'manual-only']);
const attributionSchema = z.object({
  provider: z.literal('PriceCharting'),
  text: z.string(),
  url: z.url(),
});
const identifierSchema = z.object({
  type: z.enum(['pricecharting-id', 'upc']),
  value: z.string(),
});
const productSchema = z.object({
  providerId: z.string(),
  name: z.string(),
  category: z.object({ key: z.string(), providerLabel: z.string() }).optional(),
  platform: z.string().optional(),
  edition: z.string().optional(),
  region: z.string().optional(),
  variant: z.string().optional(),
  releaseDate: z.string().optional(),
  identifiers: z.array(identifierSchema),
  providerUrl: z.url().optional(),
});
const priceSchema = z.object({
  condition: conditionSchema,
  providerLabel: z.string(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.literal('USD'),
  retrievedAt: z.iso.datetime(),
});
const pricedProductSchema = z.object({
  product: productSchema,
  prices: z.array(priceSchema),
  retrievedAt: z.iso.datetime(),
  attribution: attributionSchema,
});
const matchInputShape = {
  providerId: z.string().min(1).max(100).optional(),
  upc: z
    .string()
    .regex(/^\d{6,18}$/)
    .optional(),
  title: z.string().min(1).max(200).optional(),
  platform: z.string().min(1).max(100).optional(),
  edition: z.string().min(1).max(100).optional(),
  region: z.string().min(1).max(100).optional(),
  condition: conditionSchema.optional(),
};
const matchCandidateSchema = z.object({
  product: productSchema,
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  conflicts: z.array(z.string()),
});
const matchResultSchema = z.object({
  status: z.enum(['matched', 'ambiguous', 'unmatched']),
  match: productSchema.optional(),
  candidates: z.array(matchCandidateSchema),
  attribution: attributionSchema,
});

export const capabilitiesTool = defineTool({
  name: 'game_prices_get_capabilities',
  title: 'Get game-price capabilities',
  summary: 'Report verified PriceCharting-backed capabilities and explicit limitations.',
  description:
    'Returns the supported identifiers, provider-supplied conditions, quota, caching status, attribution, and unsupported features.',
  kind: 'read',
  inputSchema: z.object({}),
  outputSchema: z.object({
    capabilities: z.object({
      searchableEntities: z.tuple([z.literal('product')]),
      categories: z.array(z.object({ key: z.string(), providerLabel: z.string() })),
      identifiers: z.array(z.enum(['pricecharting-id', 'upc'])),
      conditions: z.array(z.object({ condition: conditionSchema, providerLabel: z.string() })),
      structuredFields: z.tuple([z.literal('platform')]),
      currentPrices: z.literal(true),
      historicalPrices: z.literal(false),
      comparableSales: z.literal(false),
      pagination: z.literal(false),
      currency: z.literal('USD'),
      priceUnit: z.literal('USD cent'),
      upstreamRequestsPerSecond: z.number().positive(),
      maxSearchResults: z.number().int().positive(),
      maxCollectionEntries: z.number().int().positive(),
      cache: z.object({ enabled: z.literal(false), reason: z.string() }),
      attribution: attributionSchema,
      documentationReviewedAt: z.iso.date(),
      unsupportedFeatures: z.array(z.string()),
    }),
  }),
  handler: (_input, services) => Promise.resolve({ capabilities: services.prices.capabilities() }),
});

export const searchCatalogTool = defineTool({
  name: 'game_prices_search_catalog',
  title: 'Search the PriceCharting catalog',
  summary: 'Search products by descriptive text.',
  description:
    'Returns a bounded partial product search. Category and platform enumeration are not implied.',
  kind: 'read',
  inputSchema: z.object({
    query: z.string().min(1).max(200),
    entity: z.enum(['product', 'platform', 'category']).optional(),
    category: z.string().min(1).max(100).optional(),
    platform: z.string().min(1).max(100).optional(),
    region: z.string().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  outputSchema: z.object({
    products: z.array(productSchema),
    partial: z.boolean(),
    nextCursor: z.string().optional(),
    attribution: attributionSchema,
  }),
  handler: (input, services) => services.prices.search(input),
});

export const getProductTool = defineTool({
  name: 'game_prices_get_product',
  title: 'Get a priced product',
  summary: 'Get a normalized product and provider-supplied current prices.',
  description:
    'Returns only conditions supplied by PriceCharting. Missing prices are not inferred.',
  kind: 'read',
  inputSchema: z.object({ providerId: z.string().min(1).max(100) }),
  outputSchema: pricedProductSchema,
  handler: (input, services) => services.prices.getProduct(input.providerId),
});

export const matchProductTool = defineTool({
  name: 'game_prices_match_product',
  title: 'Match a product',
  summary: 'Match identifiers or descriptive product information.',
  description:
    'Returns matched, ambiguous, or unmatched with deterministic confidence reasons. Confidence describes matching only.',
  kind: 'read',
  inputSchema: z.object(matchInputShape),
  outputSchema: matchResultSchema,
  handler: (input, services) => services.prices.match(input),
});

export const compareProductsTool = defineTool({
  name: 'game_prices_compare_products',
  title: 'Compare products',
  summary: 'Compare editions, platforms, regions, and provider-supplied conditions.',
  description: 'Reports missing comparison dimensions instead of inventing metadata.',
  kind: 'read',
  inputSchema: z.object({
    products: z.array(z.object(matchInputShape)).min(2).max(10),
    dimensions: z
      .array(z.enum(['platform', 'edition', 'region', 'condition']))
      .min(1)
      .default(['platform', 'edition', 'region', 'condition']),
  }),
  outputSchema: z.object({
    products: z.array(pricedProductSchema),
    dimensions: z.array(z.enum(['platform', 'edition', 'region', 'condition'])),
    missingDimensions: z.record(z.string(), z.array(z.string())),
    disclaimer: z.string(),
  }),
  handler: (input, services) => services.prices.compare(input.products, input.dimensions),
});

export const estimateCollectionTool = defineTool({
  name: 'game_prices_estimate_collection',
  title: 'Estimate a collection',
  summary: 'Estimate priced matches while separating ambiguous and missing entries.',
  description:
    'Disabled by default pending written redistribution permission. Estimates are not guaranteed sale values.',
  kind: 'read',
  inputSchema: z.object({
    entries: z
      .array(
        z.object({
          ...matchInputShape,
          reference: z.string().min(1).max(100),
          quantity: z.number().int().min(1).max(10_000),
          condition: conditionSchema,
        }),
      )
      .min(1)
      .max(100),
  }),
  outputSchema: z.object({
    entries: z.array(
      z.object({
        reference: z.string(),
        quantity: z.number().int().positive(),
        status: z.enum(['priced', 'ambiguous', 'unmatched', 'condition-unavailable']),
        product: productSchema.optional(),
        requestedCondition: conditionSchema,
        unitAmountMinor: z.number().int().nonnegative().optional(),
        subtotalMinor: z.number().int().nonnegative().optional(),
        candidates: z.array(matchCandidateSchema),
      }),
    ),
    includedTotalMinor: z.number().int().nonnegative(),
    currency: z.literal('USD'),
    coverage: z.object({
      priced: z.number().int().nonnegative(),
      ambiguous: z.number().int().nonnegative(),
      unmatched: z.number().int().nonnegative(),
      unavailable: z.number().int().nonnegative(),
    }),
    retrievedAt: z.iso.datetime(),
    attribution: attributionSchema,
    disclaimer: z.string(),
  }),
  handler: (input, services) => services.prices.estimateCollection(input.entries),
});

export const toolDefinitions = [
  capabilitiesTool,
  searchCatalogTool,
  getProductTool,
  matchProductTool,
  compareProductsTool,
  estimateCollectionTool,
] as const satisfies readonly ToolDefinition[];
