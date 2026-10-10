import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// MetricsCollector loads and persists JSON under its dataDir; keep the facade
// test off the real filesystem, as the original collector tests do.
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import * as root from '../src/index.js';
import * as metrics from '../src/metrics/index.js';

// The metrics module (merged from the retired tummycrypt_tinyland_metrics) is
// reachable both at the ./metrics subpath and from the root, with its original
// names in both places.
describe('metrics merge into tinyland-otel', () => {
  afterEach(() => {
    metrics.resetMetricsCollectorSingleton();
    metrics.resetMetricsConfig();
  });

  it('keeps the original subpath API names', () => {
    expect(Object.keys(metrics).sort()).toEqual(
      [
        'EventStreamManager',
        'MetricsCollector',
        'configureMetrics',
        'createMetricsCollector',
        'getEventStreamManager',
        'getMetricsCollector',
        'getMetricsConfig',
        'resetMetricsCollectorSingleton',
        'resetMetricsConfig',
      ].sort(),
    );
  });

  it('re-exports the same bindings from the root', () => {
    for (const name of Object.keys(metrics) as Array<keyof typeof metrics>) {
      expect(root[name]).toBe(metrics[name]);
    }
  });

  it('keeps the metrics config separate from the otel config', () => {
    expect(root.configureMetrics).not.toBe(root.configureOtel);
    root.configureMetrics({ dataDir: 'custom/metrics' });
    expect(metrics.getMetricsConfig().dataDir).toBe('custom/metrics');
  });

  it('shares the collector and event stream singletons with the root', () => {
    const collector = root.getMetricsCollector();
    expect(metrics.getMetricsCollector()).toBe(collector);
    expect(root.getEventStreamManager()).toBe(metrics.getEventStreamManager());
  });

  it('declares the ./metrics subpath export', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      exports: Record<string, { types: string; import: string }>;
    };
    expect(pkg.exports['./metrics']).toEqual({
      types: './dist/metrics/index.d.ts',
      import: './dist/metrics/index.js',
    });
  });
});
