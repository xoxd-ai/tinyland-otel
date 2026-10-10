import { describe, it, expect, beforeEach } from 'vitest';
import {
  configureMetricsCollectors,
  getMetricsCollectorsConfig,
  resetMetricsCollectorsConfig,
} from '../src/metrics-collectors/config.js';
import type { MetricsWriter, AccessibilityMetricsData } from '../src/metrics-collectors/types.js';

function createMockWriter() {
  const calls: Array<{ name: string; value: number; labels?: Record<string, string> }> = [];
  return {
    writer: {
      setGauge: (name: string, value: number, labels?: Record<string, string>) => {
        calls.push({ name, value, labels });
      },
    } satisfies MetricsWriter,
    calls,
  };
}

describe('MetricsCollectors Config', () => {
  beforeEach(() => {
    resetMetricsCollectorsConfig();
  });

  describe('default config', () => {
    it('should have a no-op MetricsWriter by default', () => {
      const config = getMetricsCollectorsConfig();
      expect(config.metricsWriter).toBeDefined();
      
      expect(() => config.metricsWriter.setGauge('test', 1)).not.toThrow();
    });

    it('should have a no-op MetricsWriter that accepts labels', () => {
      const config = getMetricsCollectorsConfig();
      expect(() => config.metricsWriter.setGauge('test', 1, { label: 'value' })).not.toThrow();
    });

    it('should have a no-op getAccessibilityMetrics by default', () => {
      const config = getMetricsCollectorsConfig();
      expect(config.getAccessibilityMetrics).toBeDefined();
      expect(typeof config.getAccessibilityMetrics).toBe('function');
    });

    it('should return zero-value accessibility metrics by default', () => {
      const config = getMetricsCollectorsConfig();
      const metrics = config.getAccessibilityMetrics();
      expect(metrics.total).toBe(0);
      expect(metrics.critical).toBe(0);
      expect(metrics.byType.contrast).toBe(0);
      expect(metrics.byType.aria).toBe(0);
      expect(metrics.byType.keyboard).toBe(0);
      expect(metrics.byType.altText).toBe(0);
    });

    it('should return empty byComponent from default accessibility metrics', () => {
      const config = getMetricsCollectorsConfig();
      const metrics = config.getAccessibilityMetrics();
      expect(metrics.byComponent).toEqual({});
    });

    it('should return empty byPage from default accessibility metrics', () => {
      const config = getMetricsCollectorsConfig();
      const metrics = config.getAccessibilityMetrics();
      expect(metrics.byPage).toEqual({});
    });

    it('should return empty byTheme from default accessibility metrics', () => {
      const config = getMetricsCollectorsConfig();
      const metrics = config.getAccessibilityMetrics();
      expect(metrics.byTheme).toEqual({});
    });

    it('should use process.cwd() as default baseDir', () => {
      const config = getMetricsCollectorsConfig();
      expect(config.baseDir).toBe(process.cwd());
    });

    it('should have baseDir as a non-empty string', () => {
      const config = getMetricsCollectorsConfig();
      expect(config.baseDir.length).toBeGreaterThan(0);
    });
  });

  describe('configureMetricsCollectors', () => {
    it('should merge a custom metricsWriter into config', () => {
      const { writer } = createMockWriter();
      configureMetricsCollectors({ metricsWriter: writer });
      const config = getMetricsCollectorsConfig();
      expect(config.metricsWriter).toBe(writer);
    });

    it('should merge a custom getAccessibilityMetrics into config', () => {
      const customFn = () => ({
        total: 5,
        critical: 1,
        byType: { contrast: 2, aria: 1, keyboard: 1, altText: 1 },
        byComponent: {},
        byPage: {},
        byTheme: {},
      });
      configureMetricsCollectors({ getAccessibilityMetrics: customFn });
      const config = getMetricsCollectorsConfig();
      expect(config.getAccessibilityMetrics).toBe(customFn);
    });

    it('should merge a custom baseDir into config', () => {
      configureMetricsCollectors({ baseDir: '/custom/path' });
      const config = getMetricsCollectorsConfig();
      expect(config.baseDir).toBe('/custom/path');
    });

    it('should preserve metricsWriter when only baseDir is set', () => {
      const { writer } = createMockWriter();
      configureMetricsCollectors({ metricsWriter: writer });
      configureMetricsCollectors({ baseDir: '/some/path' });
      const config = getMetricsCollectorsConfig();
      expect(config.metricsWriter).toBe(writer);
    });

    it('should preserve baseDir when only metricsWriter is set', () => {
      configureMetricsCollectors({ baseDir: '/custom/base' });
      const { writer } = createMockWriter();
      configureMetricsCollectors({ metricsWriter: writer });
      const config = getMetricsCollectorsConfig();
      expect(config.baseDir).toBe('/custom/base');
    });

    it('should preserve getAccessibilityMetrics when other fields are set', () => {
      const customFn = () => ({
        total: 10,
        critical: 2,
        byType: { contrast: 3, aria: 3, keyboard: 2, altText: 2 },
        byComponent: {},
        byPage: {},
        byTheme: {},
      });
      configureMetricsCollectors({ getAccessibilityMetrics: customFn });
      configureMetricsCollectors({ baseDir: '/other' });
      const config = getMetricsCollectorsConfig();
      expect(config.getAccessibilityMetrics).toBe(customFn);
    });

    it('should accept all three config fields at once', () => {
      const { writer } = createMockWriter();
      const customFn = () => ({
        total: 0, critical: 0,
        byType: { contrast: 0, aria: 0, keyboard: 0, altText: 0 },
        byComponent: {}, byPage: {}, byTheme: {},
      });
      configureMetricsCollectors({
        metricsWriter: writer,
        getAccessibilityMetrics: customFn,
        baseDir: '/all/three',
      });
      const config = getMetricsCollectorsConfig();
      expect(config.metricsWriter).toBe(writer);
      expect(config.getAccessibilityMetrics).toBe(customFn);
      expect(config.baseDir).toBe('/all/three');
    });

    it('should accept an empty partial config without error', () => {
      expect(() => configureMetricsCollectors({})).not.toThrow();
    });

    it('should not change config when empty partial is provided', () => {
      const configBefore = getMetricsCollectorsConfig();
      const baseDirBefore = configBefore.baseDir;
      configureMetricsCollectors({});
      const configAfter = getMetricsCollectorsConfig();
      expect(configAfter.baseDir).toBe(baseDirBefore);
    });
  });

  describe('resetMetricsCollectorsConfig', () => {
    it('should restore default metricsWriter after custom was set', () => {
      const { writer } = createMockWriter();
      configureMetricsCollectors({ metricsWriter: writer });
      resetMetricsCollectorsConfig();
      const config = getMetricsCollectorsConfig();
      expect(config.metricsWriter).not.toBe(writer);
      expect(() => config.metricsWriter.setGauge('test', 1)).not.toThrow();
    });

    it('should restore default baseDir after custom was set', () => {
      configureMetricsCollectors({ baseDir: '/custom' });
      resetMetricsCollectorsConfig();
      const config = getMetricsCollectorsConfig();
      expect(config.baseDir).toBe(process.cwd());
    });

    it('should restore default getAccessibilityMetrics after custom was set', () => {
      const customFn = () => ({
        total: 99, critical: 99,
        byType: { contrast: 99, aria: 99, keyboard: 99, altText: 99 },
        byComponent: {}, byPage: {}, byTheme: {},
      });
      configureMetricsCollectors({ getAccessibilityMetrics: customFn });
      resetMetricsCollectorsConfig();
      const config = getMetricsCollectorsConfig();
      const metrics = config.getAccessibilityMetrics();
      expect(metrics.total).toBe(0);
    });

    it('should produce a fresh default config object after reset', () => {
      const config1 = getMetricsCollectorsConfig();
      resetMetricsCollectorsConfig();
      const config2 = getMetricsCollectorsConfig();
      expect(config1).not.toBe(config2);
    });

    it('should be callable multiple times without error', () => {
      expect(() => {
        resetMetricsCollectorsConfig();
        resetMetricsCollectorsConfig();
        resetMetricsCollectorsConfig();
      }).not.toThrow();
    });
  });

  describe('getMetricsCollectorsConfig', () => {
    it('should return the same config object on consecutive calls without changes', () => {
      const config1 = getMetricsCollectorsConfig();
      const config2 = getMetricsCollectorsConfig();
      expect(config1).toBe(config2);
    });

    it('should return a different object after configureMetricsCollectors is called', () => {
      const config1 = getMetricsCollectorsConfig();
      configureMetricsCollectors({ baseDir: '/different' });
      const config2 = getMetricsCollectorsConfig();
      expect(config1).not.toBe(config2);
    });

    it('should return config with all three required keys', () => {
      const config = getMetricsCollectorsConfig();
      expect(config).toHaveProperty('metricsWriter');
      expect(config).toHaveProperty('getAccessibilityMetrics');
      expect(config).toHaveProperty('baseDir');
    });
  });
});
