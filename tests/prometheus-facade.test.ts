import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';

import * as root from '../src/index.js';
import * as prometheus from '../src/prometheus/index.js';
import type { HistogramMetric as RootHistogramMetric, MetricsWriter } from '../src/index.js';

// The Prometheus registry module (merged from the retired
// tummycrypt_tinyland_prometheus) is reachable both at the ./prometheus subpath
// and from the root, with its original names in both places.
describe('prometheus merge into tinyland-otel', () => {
  afterEach(() => {
    prometheus.metricsRegistry.reset();
    root.resetMetricsCollectorsConfig();
  });

  it('keeps the original subpath API names', () => {
    expect(Object.keys(prometheus).sort()).toEqual(
      [
        'MetricsRegistry',
        'exportMetrics',
        'incrementCounter',
        'metricsRegistry',
        'observeHistogram',
        'setGauge',
      ].sort(),
    );
  });

  it('re-exports the same bindings from the root', () => {
    for (const name of Object.keys(prometheus) as Array<keyof typeof prometheus>) {
      expect(root[name]).toBe(prometheus[name]);
    }
  });

  it('shares one registry singleton between the root and the subpath', () => {
    root.incrementCounter('facade_requests_total', { route: '/' });
    prometheus.setGauge('facade_inflight', 3);
    const text = prometheus.exportMetrics();
    expect(text).toContain('facade_requests_total{route="/"} 1');
    expect(text).toContain('facade_inflight 3');
    expect(root.exportMetrics()).toBe(text);
  });

  it('keeps the root type exports usable', () => {
    const histogram: RootHistogramMetric = {
      name: 'facade_latency_seconds',
      help: '',
      buckets: [{ le: 0.1, count: 1 }],
      sum: 0.05,
      count: 1,
    };
    expect(histogram.buckets[0]?.le).toBe(0.1);
  });

  it('serves as the metrics-collectors writer, as tinyland.dev wires it', () => {
    const writer: MetricsWriter = { setGauge: root.setGauge };
    root.configureMetricsCollectors({ metricsWriter: writer, baseDir: '/nonexistent' });
    root.collectClientMetrics();
    expect(root.exportMetrics()).toContain('client_connected_total 0');
  });

  it('declares the ./prometheus subpath export', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      exports: Record<string, { types: string; import: string }>;
    };
    expect(pkg.exports['./prometheus']).toEqual({
      types: './dist/prometheus/index.d.ts',
      import: './dist/prometheus/index.js',
    });
  });
});
