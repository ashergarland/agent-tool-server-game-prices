import type {
  Attribution,
  PriceChartingProvider,
  ProductLookup,
  ProductPrices,
  ProviderCapabilities,
  SearchRequest,
  SearchResult,
} from './types.js';

const attribution: Attribution = {
  provider: 'PriceCharting',
  text: 'Price data provided by PriceCharting',
  url: 'https://www.pricecharting.com',
};

const products: ProductPrices[] = [
  {
    product: {
      providerId: '6910',
      name: 'Super Mario Bros.',
      platform: 'NES',
      identifiers: [
        { type: 'pricecharting-id', value: '6910' },
        { type: 'upc', value: '045496630324' },
      ],
    },
    prices: [
      {
        condition: 'loose',
        providerLabel: 'Loose Price',
        amountMinor: 1500,
        currency: 'USD',
        retrievedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        condition: 'complete',
        providerLabel: 'CIB Price',
        amountMinor: 4500,
        currency: 'USD',
        retrievedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    retrievedAt: '2026-01-01T00:00:00.000Z',
    attribution,
  },
];

export class MemoryProvider implements PriceChartingProvider {
  public capabilities(): ProviderCapabilities {
    return {
      searchableEntities: ['product'],
      categories: [],
      identifiers: ['pricecharting-id', 'upc'],
      conditions: [
        { condition: 'loose', providerLabel: 'Loose Price' },
        { condition: 'complete', providerLabel: 'CIB Price' },
        { condition: 'new', providerLabel: 'New Price' },
        { condition: 'graded', providerLabel: 'Graded Price' },
        { condition: 'box-only', providerLabel: 'Box Only Price' },
        { condition: 'manual-only', providerLabel: 'Manual Only Price' },
      ],
      structuredFields: ['platform'],
      currentPrices: true,
      historicalPrices: false,
      comparableSales: false,
      pagination: false,
      currency: 'USD',
      priceUnit: 'USD cent',
      upstreamRequestsPerSecond: 1,
      maxSearchResults: 20,
      maxCollectionEntries: 25,
      cache: {
        enabled: false,
        reason: 'Caching rights have not been verified; provider responses are not persisted.',
      },
      attribution,
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

  public search(request: SearchRequest): Promise<SearchResult> {
    const query = request.query.toLocaleLowerCase();
    const matches = products
      .filter(({ product }) =>
        `${product.name} ${product.platform ?? ''}`.toLocaleLowerCase().includes(query),
      )
      .slice(0, request.limit)
      .map(({ product }) => product);
    return Promise.resolve({ products: matches, partial: true, attribution });
  }

  public getProduct(lookup: ProductLookup): Promise<ProductPrices | undefined> {
    return Promise.resolve(
      products.find(({ product }) =>
        lookup.providerId
          ? product.providerId === lookup.providerId
          : product.identifiers.some(
              (identifier) => identifier.type === 'upc' && identifier.value === lookup.upc,
            ),
      ),
    );
  }
}
