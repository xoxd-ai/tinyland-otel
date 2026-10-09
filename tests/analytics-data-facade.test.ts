import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import * as root from '../src/index.js';
import * as analytics from '../src/analytics-data/index.js';

// The analytics-data module (merged from the retired
// tummycrypt_tinyland_analytics_data) is reachable both at the
// ./analytics-data subpath with its original names and from the root
// through non-clashing aliases.
describe('analytics-data merge into tinyland-otel', () => {
  it('keeps the original subpath API names', () => {
    expect(Object.keys(analytics).sort()).toEqual(
      [
        'AnalyticsDataService',
        'analyticsDataService',
        'configure',
        'createAnalyticsDataService',
        'getConfig',
        'parseTimeRange',
        'resetConfig',
      ].sort(),
    );
  });

  it('re-exports the same bindings from the root under aliases', () => {
    expect(root.configureAnalyticsData).toBe(analytics.configure);
    expect(root.getAnalyticsDataConfig).toBe(analytics.getConfig);
    expect(root.resetAnalyticsDataConfig).toBe(analytics.resetConfig);
    expect(root.parseAnalyticsTimeRange).toBe(analytics.parseTimeRange);
    expect(root.AnalyticsDataService).toBe(analytics.AnalyticsDataService);
    expect(root.createAnalyticsDataService).toBe(analytics.createAnalyticsDataService);
  });

  it('keeps the root otel config separate from the analytics config', () => {
    expect(root.configureAnalyticsData).not.toBe(root.configureOtel);
  });

  it('shares the live analyticsDataService binding with the root', () => {
    analytics.configure({
      lokiUrl: 'http://loki:3100',
      prometheusUrl: 'http://prom:9090',
      fetchLoki: async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) }),
    });
    const created = root.createAnalyticsDataService();
    expect(analytics.analyticsDataService).toBe(created);
    expect(root.analyticsDataService).toBe(created);
    analytics.resetConfig();
  });

  it('declares the ./analytics-data subpath export', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
      exports: Record<string, { types: string; import: string }>;
    };
    expect(pkg.exports['./analytics-data']).toEqual({
      types: './dist/analytics-data/index.d.ts',
      import: './dist/analytics-data/index.js',
    });
  });
});
