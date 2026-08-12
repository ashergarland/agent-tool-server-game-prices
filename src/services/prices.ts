import type { AppConfig } from '../config/index.js';
import { AppError, badRequest, notFound } from '../errors.js';
import type {
  Attribution,
  NormalizedProduct,
  PriceChartingProvider,
  PriceCondition,
  ProductPrices,
  ProviderCapabilities,
  SearchResult,
} from '../provider/types.js';

export interface MatchInput {
  readonly providerId?: string | undefined;
  readonly upc?: string | undefined;
  readonly title?: string | undefined;
  readonly platform?: string | undefined;
  readonly edition?: string | undefined;
  readonly region?: string | undefined;
  readonly condition?: PriceCondition | undefined;
}

export interface MatchCandidate {
  readonly product: NormalizedProduct;
  readonly score: number;
  readonly reasons: string[];
  readonly conflicts: string[];
}

export interface MatchResult {
  readonly status: 'matched' | 'ambiguous' | 'unmatched';
  readonly match?: NormalizedProduct | undefined;
  readonly candidates: MatchCandidate[];
  readonly attribution: Attribution;
}

export interface ComparisonResult {
  readonly products: ProductPrices[];
  readonly dimensions: ('platform' | 'edition' | 'region' | 'condition')[];
  readonly missingDimensions: Record<string, string[]>;
  readonly disclaimer: string;
}

export interface CollectionEntryInput extends MatchInput {
  readonly reference: string;
  readonly quantity: number;
  readonly condition: PriceCondition;
}

export interface CollectionEntryResult {
  readonly reference: string;
  readonly quantity: number;
  readonly status: 'priced' | 'ambiguous' | 'unmatched' | 'condition-unavailable';
  readonly product?: NormalizedProduct | undefined;
  readonly requestedCondition: PriceCondition;
  readonly unitAmountMinor?: number | undefined;
  readonly subtotalMinor?: number | undefined;
  readonly candidates: MatchCandidate[];
}

const disclaimer =
  'Prices are current provider-derived estimates, not guaranteed sale values. Fees, shipping, item quality, demand, and transaction timing may change realized proceeds.';

const normalize = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export class PriceService {
  public constructor(
    private readonly provider: PriceChartingProvider,
    private readonly config: AppConfig,
  ) {}

  public capabilities(): ProviderCapabilities {
    return this.provider.capabilities();
  }

  public async search(input: {
    query: string;
    entity?: 'product' | 'platform' | 'category' | undefined;
    category?: string | undefined;
    platform?: string | undefined;
    region?: string | undefined;
    limit?: number | undefined;
  }): Promise<SearchResult> {
    if (input.entity && input.entity !== 'product') {
      throw new AppError(
        'unsupported_operation',
        `${input.entity} enumeration is not documented by the PriceCharting API`,
      );
    }
    if (input.category || input.region) {
      throw new AppError(
        'unsupported_operation',
        'Structured category and region filters are not documented by the PriceCharting API',
      );
    }
    const query = [input.query, input.platform].filter(Boolean).join(' ');
    return this.provider.search({
      query,
      limit: Math.min(
        input.limit ?? this.config.priceCharting.maxSearchResults,
        this.config.priceCharting.maxSearchResults,
      ),
    });
  }

  public async getProduct(providerId: string): Promise<ProductPrices> {
    const result = await this.provider.getProduct({ providerId });
    if (!result) throw notFound(`Unknown PriceCharting product: ${providerId}`);
    return result;
  }

  public async match(input: MatchInput): Promise<MatchResult> {
    if (!input.providerId && !input.upc && !input.title) {
      throw badRequest('Provide a PriceCharting product ID, UPC, or title');
    }
    const attribution = this.provider.capabilities().attribution;
    if (input.providerId || input.upc) {
      const result = await this.provider.getProduct({
        ...(input.providerId ? { providerId: input.providerId } : {}),
        ...(input.upc ? { upc: input.upc } : {}),
      });
      if (!result) return { status: 'unmatched', candidates: [], attribution };
      const conflicts = this.conflicts(result.product, input);
      const conditionMissing =
        input.condition !== undefined &&
        !result.prices.some((price) => price.condition === input.condition);
      const candidate: MatchCandidate = {
        product: result.product,
        score: conflicts.length === 0 && !conditionMissing ? 1 : 0.5,
        reasons: [input.providerId ? 'exact provider ID' : 'exact UPC'],
        conflicts: [
          ...conflicts,
          ...(conditionMissing ? [`condition unavailable: ${input.condition}`] : []),
        ],
      };
      return conflicts.length === 0 && !conditionMissing
        ? { status: 'matched', match: result.product, candidates: [candidate], attribution }
        : { status: 'ambiguous', candidates: [candidate], attribution };
    }

    const search = await this.provider.search({
      query: [input.title, input.platform].filter(Boolean).join(' '),
      limit: this.config.priceCharting.maxSearchResults,
    });
    const candidates = search.products
      .map((product) => this.rank(product, input))
      .sort((left, right) => right.score - left.score);
    const top = candidates[0];
    if (!top || top.score < this.config.priceCharting.matchThreshold) {
      return { status: 'unmatched', candidates: candidates.slice(0, 5), attribution };
    }
    const second = candidates[1];
    const ambiguous =
      top.conflicts.length > 0 ||
      (second !== undefined &&
        top.score - second.score <= this.config.priceCharting.ambiguityMargin);
    return ambiguous
      ? { status: 'ambiguous', candidates: candidates.slice(0, 5), attribution }
      : {
          status: 'matched',
          match: top.product,
          candidates: candidates.slice(0, 5),
          attribution,
        };
  }

  public async compare(
    inputs: MatchInput[],
    dimensions: ('platform' | 'edition' | 'region' | 'condition')[],
  ): Promise<ComparisonResult> {
    if (!this.config.priceCharting.comparisonEnabled) {
      throw new AppError('unsupported_operation', 'Product comparison is disabled');
    }
    const products: ProductPrices[] = [];
    for (const input of inputs) {
      const matched = await this.match(input);
      if (matched.status !== 'matched' || !matched.match) {
        throw new AppError(
          'ambiguous_match',
          `Comparison input could not be matched unambiguously`,
          matched,
        );
      }
      products.push(await this.getProduct(matched.match.providerId));
    }
    const missingDimensions = Object.fromEntries(
      products.map(({ product, prices }) => [
        product.providerId,
        dimensions.filter((dimension) =>
          dimension === 'condition' ? prices.length === 0 : product[dimension] === undefined,
        ),
      ]),
    );
    return { products, dimensions, missingDimensions, disclaimer };
  }

  public async estimateCollection(entries: CollectionEntryInput[]): Promise<{
    entries: CollectionEntryResult[];
    includedTotalMinor: number;
    currency: 'USD';
    coverage: { priced: number; ambiguous: number; unmatched: number; unavailable: number };
    retrievedAt: string;
    attribution: Attribution;
    disclaimer: string;
  }> {
    if (!this.config.priceCharting.collectionEstimatesEnabled) {
      throw new AppError(
        'unsupported_operation',
        'Collection estimates require written PriceCharting redistribution permission and explicit enablement',
      );
    }
    if (entries.length > this.config.priceCharting.maxCollectionEntries) {
      throw new AppError(
        'batch_too_large',
        `Collection exceeds ${this.config.priceCharting.maxCollectionEntries} entries`,
      );
    }
    const results: CollectionEntryResult[] = [];
    for (const entry of entries) results.push(await this.estimateEntry(entry));
    const includedTotalMinor = results.reduce((total, entry) => {
      const next = total + (entry.subtotalMinor ?? 0);
      if (!Number.isSafeInteger(next)) throw badRequest('Collection total exceeds safe limits');
      return next;
    }, 0);
    return {
      entries: results,
      includedTotalMinor,
      currency: 'USD',
      coverage: {
        priced: results.filter(({ status }) => status === 'priced').length,
        ambiguous: results.filter(({ status }) => status === 'ambiguous').length,
        unmatched: results.filter(({ status }) => status === 'unmatched').length,
        unavailable: results.filter(({ status }) => status === 'condition-unavailable').length,
      },
      retrievedAt: new Date().toISOString(),
      attribution: this.provider.capabilities().attribution,
      disclaimer,
    };
  }

  private async estimateEntry(entry: CollectionEntryInput): Promise<CollectionEntryResult> {
    const match = await this.match({
      providerId: entry.providerId,
      upc: entry.upc,
      title: entry.title,
      platform: entry.platform,
      edition: entry.edition,
      region: entry.region,
    });
    if (match.status !== 'matched' || !match.match) {
      return {
        reference: entry.reference,
        quantity: entry.quantity,
        status: match.status === 'ambiguous' ? 'ambiguous' : 'unmatched',
        requestedCondition: entry.condition,
        candidates: match.candidates,
      };
    }
    const product = await this.getProduct(match.match.providerId);
    const price = product.prices.find(({ condition }) => condition === entry.condition);
    if (!price) {
      return {
        reference: entry.reference,
        quantity: entry.quantity,
        status: 'condition-unavailable',
        product: product.product,
        requestedCondition: entry.condition,
        candidates: match.candidates,
      };
    }
    return {
      reference: entry.reference,
      quantity: entry.quantity,
      status: 'priced',
      product: product.product,
      requestedCondition: entry.condition,
      unitAmountMinor: price.amountMinor,
      subtotalMinor: this.safeMultiply(price.amountMinor, entry.quantity),
      candidates: match.candidates,
    };
  }

  private rank(product: NormalizedProduct, input: MatchInput): MatchCandidate {
    const reasons: string[] = [];
    let score = 0;
    if (input.title && normalize(product.name) === normalize(input.title)) {
      score += 0.8;
      reasons.push('exact normalized title');
    } else if (input.title && normalize(product.name).includes(normalize(input.title))) {
      score += 0.55;
      reasons.push('partial normalized title');
    }
    if (
      input.platform &&
      product.platform &&
      normalize(product.platform) === normalize(input.platform)
    ) {
      score += 0.2;
      reasons.push('exact platform');
    }
    const conflicts = this.conflicts(product, input);
    return { product, score: Math.max(0, score - conflicts.length * 0.25), reasons, conflicts };
  }

  private conflicts(product: NormalizedProduct, input: MatchInput): string[] {
    return (['platform', 'edition', 'region'] as const).flatMap((field) =>
      input[field] && product[field] && normalize(input[field]) !== normalize(product[field])
        ? [`${field} conflicts with provider data`]
        : [],
    );
  }

  private safeMultiply(left: number, right: number): number {
    const result = left * right;
    if (!Number.isSafeInteger(result)) throw badRequest('Collection subtotal exceeds safe limits');
    return result;
  }
}
