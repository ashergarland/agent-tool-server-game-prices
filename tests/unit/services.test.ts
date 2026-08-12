import { describe, expect, it } from 'vitest';
import { createApplication } from '../../src/app.js';
import { MemoryProvider } from '../../src/provider/memory.js';
import { createServices } from '../../src/services/index.js';
import { testConfig } from '../helpers/config.js';

describe('game-price services', () => {
  it('searches, retrieves, and matches exact identifiers', async () => {
    const services = createServices(testConfig(), new MemoryProvider());
    expect((await services.prices.search({ query: 'Mario' })).products).toHaveLength(1);
    expect((await services.prices.getProduct('6910')).prices).toHaveLength(2);
    expect(await services.prices.match({ upc: '045496630324' })).toMatchObject({
      status: 'matched',
      match: { providerId: '6910' },
    });
    await expect(services.prices.getProduct('missing')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('reports conflicts and unsupported operations without guessing', async () => {
    const services = createServices(testConfig(), new MemoryProvider());
    expect(await services.prices.match({ providerId: '6910', platform: 'SNES' })).toMatchObject({
      status: 'ambiguous',
    });
    await expect(
      services.prices.search({ query: 'Nintendo', entity: 'platform' }),
    ).rejects.toMatchObject({ code: 'unsupported_operation' });
    expect(await services.prices.match({ providerId: '6910', condition: 'graded' })).toMatchObject({
      status: 'ambiguous',
    });
    expect(
      await services.prices.match({ title: 'Super Mario Bros.', platform: 'NES' }),
    ).toMatchObject({ status: 'matched' });
  });

  it('compares products and gates collection estimates', async () => {
    const services = createServices(testConfig(), new MemoryProvider());
    const comparison = await services.prices.compare(
      [{ providerId: '6910' }, { upc: '045496630324' }],
      ['platform', 'edition', 'condition'],
    );
    expect(comparison.products).toHaveLength(2);
    expect(comparison.missingDimensions['6910']).toContain('edition');
    await expect(
      services.prices.estimateCollection([
        { reference: 'one', providerId: '6910', quantity: 1, condition: 'loose' },
      ]),
    ).rejects.toMatchObject({ code: 'unsupported_operation' });
  });

  it('prices only matched entries when collection estimates are enabled', async () => {
    const services = createServices(
      testConfig({ PRICECHARTING_ENABLE_COLLECTION_ESTIMATES: true }),
      new MemoryProvider(),
    );
    const estimate = await services.prices.estimateCollection([
      { reference: 'one', providerId: '6910', quantity: 2, condition: 'loose' },
      { reference: 'missing', providerId: '999', quantity: 1, condition: 'new' },
    ]);
    expect(estimate.includedTotalMinor).toBe(3000);
    expect(estimate.coverage).toMatchObject({ priced: 1, unmatched: 1 });
    expect(estimate.disclaimer).toContain('not guaranteed');

    const unavailable = await services.prices.estimateCollection([
      { reference: 'sealed', providerId: '6910', quantity: 1, condition: 'new' },
    ]);
    expect(unavailable.entries[0]?.status).toBe('condition-unavailable');

    await expect(
      services.prices.estimateCollection(
        Array.from({ length: 26 }, (_, index) => ({
          reference: String(index),
          providerId: '6910',
          quantity: 1,
          condition: 'loose' as const,
        })),
      ),
    ).rejects.toMatchObject({ code: 'batch_too_large' });
  });

  it('wires an injectable application', async () => {
    const application = createApplication({
      config: testConfig(),
      provider: new MemoryProvider(),
    });
    expect(application.registry.list()).toHaveLength(6);
    await application.http.close();
  });
});
