export type ProductIdentifierType = 'pricecharting-id' | 'upc';
export type PriceCondition = 'loose' | 'complete' | 'new' | 'graded' | 'box-only' | 'manual-only';

export interface CatalogCategory {
  readonly key: string;
  readonly providerLabel: string;
}

export interface ProductIdentifier {
  readonly type: ProductIdentifierType;
  readonly value: string;
}

export interface Attribution {
  readonly provider: 'PriceCharting';
  readonly text: string;
  readonly url: string;
}

export interface NormalizedProduct {
  readonly providerId: string;
  readonly name: string;
  readonly category?: CatalogCategory | undefined;
  readonly platform?: string | undefined;
  readonly edition?: string | undefined;
  readonly region?: string | undefined;
  readonly variant?: string | undefined;
  readonly releaseDate?: string | undefined;
  readonly identifiers: ProductIdentifier[];
  readonly providerUrl?: string | undefined;
}

export interface ConditionPrice {
  readonly condition: PriceCondition;
  readonly providerLabel: string;
  readonly amountMinor: number;
  readonly currency: 'USD';
  readonly retrievedAt: string;
}

export interface ProductPrices {
  readonly product: NormalizedProduct;
  readonly prices: ConditionPrice[];
  readonly retrievedAt: string;
  readonly attribution: Attribution;
}

export interface SearchRequest {
  readonly query: string;
  readonly limit: number;
}

export interface SearchResult {
  readonly products: NormalizedProduct[];
  readonly partial: boolean;
  readonly nextCursor?: string | undefined;
  readonly attribution: Attribution;
}

export interface ProviderCapabilities {
  readonly searchableEntities: ['product'];
  readonly categories: CatalogCategory[];
  readonly identifiers: ProductIdentifierType[];
  readonly conditions: {
    condition: PriceCondition;
    providerLabel: string;
  }[];
  readonly structuredFields: ['platform'];
  readonly currentPrices: true;
  readonly historicalPrices: false;
  readonly comparableSales: false;
  readonly pagination: false;
  readonly currency: 'USD';
  readonly priceUnit: 'USD cent';
  readonly upstreamRequestsPerSecond: number;
  readonly maxSearchResults: number;
  readonly maxCollectionEntries: number;
  readonly cache: { readonly enabled: false; readonly reason: string };
  readonly attribution: Attribution;
  readonly documentationReviewedAt: string;
  readonly unsupportedFeatures: string[];
}

export interface ProductLookup {
  readonly providerId?: string;
  readonly upc?: string;
}

export interface PriceChartingProvider {
  capabilities(): ProviderCapabilities;
  search(request: SearchRequest): Promise<SearchResult>;
  getProduct(lookup: ProductLookup): Promise<ProductPrices | undefined>;
}
