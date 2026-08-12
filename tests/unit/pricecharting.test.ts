import { describe, expect, it, vi } from 'vitest';
import { PriceChartingApiProvider } from '../../src/provider/pricecharting.js';
import { testConfig } from '../helpers/config.js';

const config = () =>
  testConfig({
    PRICECHARTING_API_TOKEN: 'provider-secret-token',
    PRICECHARTING_RETRY_COUNT: 1,
  }).priceCharting;

describe('PriceCharting API provider', () => {
  it('encodes search requests and normalizes documented fields', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          products: [
            {
              id: 6910,
              'product-name': 'Super Mario Bros.',
              'console-name': 'NES',
              upc: '045496630324',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new PriceChartingApiProvider(config(), {
      fetch: fetcher,
      sleep: async () => undefined,
    });
    const result = await provider.search({ query: 'Mario & Luigi', limit: 10 });
    const requestedUrl = fetcher.mock.calls[0]?.[0];
    expect(requestedUrl).toBeInstanceOf(URL);
    expect((requestedUrl as URL).searchParams.get('q')).toBe('Mario & Luigi');
    expect((requestedUrl as URL).searchParams.get('t')).toBe('provider-secret-token');
    expect(result.products[0]).toMatchObject({
      providerId: '6910',
      platform: 'NES',
      identifiers: [{ type: 'pricecharting-id', value: '6910' }],
    });
  });

  it('preserves UPC strings and returns only supplied condition prices', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          id: '6910',
          'product-name': 'Super Mario Bros.',
          upc: '045496630324',
          'loose-price': 1234,
        }),
        { status: 200 },
      ),
    );
    const provider = new PriceChartingApiProvider(config(), {
      fetch: fetcher,
      now: () => new Date('2026-08-12T00:00:00.000Z'),
      sleep: async () => undefined,
    });
    const result = await provider.getProduct({ upc: '045496630324' });
    expect((fetcher.mock.calls[0]?.[0] as URL).searchParams.get('upc')).toBe('045496630324');
    expect(result?.prices).toEqual([
      {
        condition: 'loose',
        providerLabel: 'Loose Price',
        amountMinor: 1234,
        currency: 'USD',
        retrievedAt: '2026-08-12T00:00:00.000Z',
      },
    ]);
  });

  it('retries transient failures and honors retry-after', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: 'success', id: '1', 'product-name': 'Example' }),
          { status: 200 },
        ),
      );
    const sleep = vi.fn(async () => undefined);
    const provider = new PriceChartingApiProvider(config(), { fetch: fetcher, sleep });
    await expect(provider.getProduct({ providerId: '1' })).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('maps authentication, not-found, and malformed responses', async () => {
    const authentication = new PriceChartingApiProvider(config(), {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 401 })),
      sleep: async () => undefined,
    });
    await expect(authentication.getProduct({ providerId: '1' })).rejects.toMatchObject({
      code: 'provider_authentication',
    });

    const missing = new PriceChartingApiProvider(config(), {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })),
      sleep: async () => undefined,
    });
    await expect(missing.getProduct({ providerId: '1' })).resolves.toBeUndefined();

    const malformed = new PriceChartingApiProvider(config(), {
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ status: 'success' }), { status: 200 })),
      sleep: async () => undefined,
    });
    await expect(malformed.getProduct({ providerId: '1' })).rejects.toMatchObject({
      code: 'provider_response_invalid',
    });
  });
});
