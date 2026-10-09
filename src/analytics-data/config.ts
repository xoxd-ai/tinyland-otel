import type { AnalyticsDataConfig } from './types.js';

let config: AnalyticsDataConfig | null = null;





export function configure(c: AnalyticsDataConfig): void {
  config = c;
}





export function getConfig(): AnalyticsDataConfig {
  if (!config) {
    throw new Error('tinyland-analytics-data: call configure() before use');
  }
  return config;
}




export function resetConfig(): void {
  config = null;
}
