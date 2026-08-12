import { z } from 'zod';
import type { AppConfig } from '../config/index.js';
import { AppError } from '../errors.js';
import type {
  Attribution,
  ConditionPrice,
  NormalizedProduct,
  PriceChartingProvider,
  ProductLookup,
  ProductPrices,
  ProviderCapabilities,
  SearchRequest,
  SearchResult,
} from './types.js';

const productSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    'product-name': z.string().min(1),
    'console-name': z.string().min(1).optional(),
    upc: z.union([z.string(), z.number()]).transform(String).optional(),
    'loose-price': z.number().int().nonnegative().optional(),
    'cib-price': z.number().int().nonnegative().optional(),
    'new-price': z.number().int().nonnegative().optional(),
    'graded-price': z.number().int().nonnegative().optional(),
    'box-only-price': z.number().int().nonnegative().optional(),
    'manual-only-price': z.number().int().nonnegative().optional(),
  })
  .loose();

const productResponseSchema = productSchema.extend({
  status: z.literal('success').optional(),
});

const searchResponseSchema = z
  .object({
    status: z.literal('success').optional(),
    products: z.array(productSchema),
  })
  .loose();

type ProviderProduct = z.output<typeof productSchema>;

const conditionFields = [
  ['loose-price', 'loose', 'Loose Price'],
  ['cib-price', 'complete', 'CIB Price'],
  ['new-price', 'new', 'New Price'],
  ['graded-price', 'graded', 'Graded Price'],
  ['box-only-price', 'box-only', 'Box Only Price'],
  ['manual-only-price', 'manual-only', 'Manual Only Price'],
] as const;

export interface PriceChartingProviderOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
}

export class PriceChartingApiProvider implements PriceChartingProvider {
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly attribution: Attribution;
  private nextRequestAt = 0;
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private pacePromise = Promise.resolve();

  public constructor(
    private readonly config: AppConfig['priceCharting'],
    options: PriceChartingProviderOptions = {},
  ) {
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
    this.attribution = {
      provider: 'PriceCharting',
      text: config.attributionText,
      url: config.attributionUrl,
    };
  }

  public capabilities(): ProviderCapabilities {
    return {
      searchableEntities: ['product'],
      categories: [],
      identifiers: ['pricecharting-id', 'upc'],
      conditions: conditionFields.map(([, condition, providerLabel]) => ({
        condition,
        providerLabel,
      })),
      structuredFields: ['platform'],
      currentPrices: true,
      historicalPrices: false,
      comparableSales: false,
      pagination: false,
      currency: 'USD',
      priceUnit: 'USD cent',
      upstreamRequestsPerSecond: this.config.requestsPerSecond,
      maxSearchResults: this.config.maxSearchResults,
      maxCollectionEntries: this.config.maxCollectionEntries,
      cache: {
        enabled: false,
        reason: 'Caching is disabled until PriceCharting grants or documents caching rights.',
      },
      attribution: this.attribution,
      documentationReviewedAt: '2026-08-12',
      unsupportedFeatures: [
        'historical prices',
        'comparable sales',
        'market liquidity',
        'category enumeration',
        'platform enumeration',
      ],
    };
  }

  public async search(request: SearchRequest): Promise<SearchResult> {
    const response = this.parse(
      searchResponseSchema,
      await this.request('products', { q: request.query }),
    );
    return {
      products: response.products.slice(0, request.limit).map((product) => this.product(product)),
      partial: true,
      attribution: this.attribution,
    };
  }

  public async getProduct(lookup: ProductLookup): Promise<ProductPrices | undefined> {
    const parameters = lookup.providerId ? { id: lookup.providerId } : { upc: lookup.upc ?? '' };
    try {
      const response = this.parse(productResponseSchema, await this.request('product', parameters));
      const retrievedAt = this.now().toISOString();
      return {
        product: this.product(response),
        prices: this.prices(response, retrievedAt),
        retrievedAt,
        attribution: this.attribution,
      };
    } catch (error) {
      if (error instanceof AppError && error.code === 'not_found') return undefined;
      throw error;
    }
  }

  private product(product: ProviderProduct): NormalizedProduct {
    return {
      providerId: product.id,
      name: product['product-name'],
      ...(product['console-name'] ? { platform: product['console-name'] } : {}),
      identifiers: [
        { type: 'pricecharting-id', value: product.id },
        ...(product.upc ? ([{ type: 'upc', value: product.upc }] as const) : []),
      ],
    };
  }

  private prices(product: ProviderProduct, retrievedAt: string): ConditionPrice[] {
    return conditionFields.flatMap(([field, condition, providerLabel]) => {
      const amountMinor = product[field];
      return amountMinor === undefined
        ? []
        : [{ condition, providerLabel, amountMinor, currency: 'USD', retrievedAt }];
    });
  }

  private async request(endpoint: string, parameters: Record<string, string>): Promise<unknown> {
    if (!this.config.apiToken) {
      throw new AppError('provider_authentication', 'PRICECHARTING_API_TOKEN is not configured');
    }
    await this.acquire();
    try {
      for (let attempt = 0; ; attempt += 1) {
        await this.pace();
        const url = new URL(endpoint, `${this.config.baseUrl.replace(/\/$/, '')}/`);
        url.searchParams.set('t', this.config.apiToken);
        for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
          const response = await this.fetcher(url, {
            method: 'GET',
            headers: { accept: 'application/json' },
            signal: controller.signal,
          });
          if (response.ok) {
            const body = await response.json();
            if (
              typeof body === 'object' &&
              body !== null &&
              'status' in body &&
              body.status === 'error'
            ) {
              throw new AppError('upstream_error', 'PriceCharting rejected the request');
            }
            return body;
          }
          if (response.status === 401 || response.status === 403) {
            throw new AppError('provider_authentication', 'PriceCharting authentication failed');
          }
          if (response.status === 404) throw new AppError('not_found', 'Product not found');
          if (response.status === 429) {
            if (attempt < this.config.retryCount) {
              await this.sleep(this.retryDelay(response.headers.get('retry-after'), attempt));
              continue;
            }
            throw new AppError(
              'provider_rate_limited',
              'PriceCharting rate limit exhausted',
              undefined,
              true,
            );
          }
          if (response.status >= 500 && attempt < this.config.retryCount) {
            await this.sleep(this.retryDelay(null, attempt));
            continue;
          }
          throw new AppError(
            'upstream_error',
            `PriceCharting request failed with status ${response.status}`,
            undefined,
            response.status >= 500,
          );
        } catch (error) {
          if (error instanceof AppError) throw error;
          if (error instanceof z.ZodError) {
            throw new AppError('provider_response_invalid', 'PriceCharting returned invalid data');
          }
          if (attempt < this.config.retryCount) {
            await this.sleep(this.retryDelay(null, attempt));
            continue;
          }
          const timedOut = controller.signal.aborted;
          throw new AppError(
            timedOut ? 'provider_timeout' : 'upstream_error',
            timedOut ? 'PriceCharting request timed out' : 'PriceCharting is unavailable',
            undefined,
            true,
          );
        } finally {
          clearTimeout(timeout);
        }
      }
    } finally {
      this.release();
    }
  }

  private retryDelay(retryAfter: string | null, attempt: number): number {
    const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, this.config.maxBackoffMs);
    }
    const jitter = 0.75 + this.random() * 0.5;
    return Math.min(Math.round(250 * 2 ** attempt * jitter), this.config.maxBackoffMs);
  }

  private async acquire(): Promise<void> {
    if (this.active >= this.config.concurrency) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    this.waiters.shift()?.();
  }

  private pace(): Promise<void> {
    const scheduled = this.pacePromise.then(async () => {
      const wait = Math.max(0, this.nextRequestAt - Date.now());
      if (wait > 0) await this.sleep(wait);
      this.nextRequestAt = Date.now() + Math.ceil(1000 / this.config.requestsPerSecond);
    });
    this.pacePromise = scheduled.catch(() => undefined);
    return scheduled;
  }

  private parse<Schema extends z.ZodType>(schema: Schema, value: unknown): z.output<Schema> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new AppError('provider_response_invalid', 'PriceCharting returned invalid data');
    }
    return parsed.data;
  }
}
