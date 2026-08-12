import type { AppConfig } from '../config/index.js';
import type { PriceChartingProvider } from '../provider/types.js';
import { Guardrails } from './guardrails.js';
import { PriceService } from './prices.js';

export interface Services {
  readonly prices: PriceService;
  readonly guardrails: Guardrails;
}

export const createServices = (config: AppConfig, provider: PriceChartingProvider): Services => {
  const guardrails = new Guardrails(config);
  return { guardrails, prices: new PriceService(provider, config) };
};
