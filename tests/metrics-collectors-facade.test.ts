import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as root from '../src/index.js';
import * as collectors from '../src/metrics-collectors/index.js';
import type { MetricsWriter as RootMetricsWriter } from '../src/index.js';

// The metrics collectors module (merged from the retired
// tummycrypt_tinyland_metrics_collectors) is reachable both at the
// ./metrics-collectors subpath and from the root, with its original names in
// both places.
describe('metrics-collectors merge into tinyland-otel', () => {
  afterEach(() => {
    collectors.resetMetricsCollectorsConfig();
  });

  it('keeps the original subpath API names', () => {
    expect(Object.keys(collectors).sort()).toEqual(
      [
        'collectAccessibilityMetrics',
        'collectAllMetrics',
        'collectAuthMetrics',
        'collectClientMetrics',
        'collectProcessMetrics',
        'collectSessionMetrics',
        'configureMetricsCollectors',
        'getMetricsCollectorsConfig',
        'resetMetricsCollectorsConfig',
      ].sort(),
    );
  });

  it('re-exports the same bindings from the root', () => {
    for (const name of Object.keys(collectors) as Array<keyof typeof collectors>) {
      expect(root[name]).toBe(collectors[name]);
    }
  });

  it('keeps the collectors config separate from the otel and metrics config', () => {
    expect(root.configureMetricsCollectors).not.toBe(root.configureOtel);
    expect(root.configureMetricsCollectors).not.toBe(root.configureMetrics);
    const setGauge = vi.fn();
    const writer: RootMetricsWriter = { setGauge };
    root.configureMetricsCollectors({ metricsWriter: writer, baseDir: '/nonexistent' });
    expect(collectors.getMetricsCollectorsConfig().metricsWriter).toBe(writer);
    collectors.collectClientMetrics();
    expect(setGauge).toHaveBeenCalledWith('client_connected_total', 0);
  });

  it('declares the ./metrics-collectors subpath export', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      exports: Record<string, { types: string; import: string }>;
    };
    expect(pkg.exports['./metrics-collectors']).toEqual({
      types: './dist/metrics-collectors/index.d.ts',
      import: './dist/metrics-collectors/index.js',
    });
  });
});
