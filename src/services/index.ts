import type { AppConfig } from '../config/index.js';
import type { PriceChartingProvider } from '../provider/types.js';
import { PriceService } from './prices.js';

export interface Services {
  readonly prices: PriceService;
}

export const createServices = (config: AppConfig, provider: PriceChartingProvider): Services => {
  return { prices: new PriceService(provider, config) };
};
