import { describe, expect, it } from 'vitest';
import {
  buildConfig,
  ConfigurationError,
  envSchema,
  loadConfig,
  withoutBlankValues,
} from '../../src/config/index.js';

describe('configuration', () => {
  it('normalizes provider flags and ignores blank optional values', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      AUTH_MODE: 'api-key',
      API_KEYS: '12345678901234567890123456789012',
      PRICECHARTING_ENABLE_COMPARISON: 'True',
      PUBLIC_BASE_URL: '',
    });
    expect(config.priceCharting.comparisonEnabled).toBe(true);
    expect(config.service.publicBaseUrl).toBeUndefined();
    expect(withoutBlankValues({ A: '', B: 'x' })).toEqual({ B: 'x' });
  });

  it('rejects disabled production authentication', () => {
    expect(() =>
      buildConfig(envSchema.parse({ NODE_ENV: 'production', AUTH_MODE: 'disabled' })),
    ).toThrow(ConfigurationError);
  });

  it('requires strong API keys', () => {
    expect(() =>
      buildConfig(envSchema.parse({ NODE_ENV: 'test', AUTH_MODE: 'api-key', API_KEYS: 'short' })),
    ).toThrow('at least 32');
  });

  it('requires a provider token and redistribution approval in production', () => {
    const base = {
      NODE_ENV: 'production',
      AUTH_MODE: 'api-key',
      API_KEYS: '12345678901234567890123456789012',
    };
    expect(() => buildConfig(envSchema.parse(base))).toThrow('PRICECHARTING_API_TOKEN');
    expect(() =>
      buildConfig(envSchema.parse({ ...base, PRICECHARTING_API_TOKEN: 'token' })),
    ).toThrow('written PriceCharting redistribution permission');
  });
});
