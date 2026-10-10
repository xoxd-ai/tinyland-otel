import { describe, it, expect, beforeEach } from 'vitest';
import {
  metricsRegistry,
  incrementCounter,
  setGauge,
  observeHistogram,
  exportMetrics,
  MetricsRegistry,
} from '../src/prometheus/index.js';
import type { Metric, HistogramBucket, HistogramMetric } from '../src/prometheus/index.js';

describe('Convenience Functions & Singleton', () => {
  beforeEach(() => {
    metricsRegistry.reset();
  });

  
  
  
  describe('module exports', () => {
    it('should export MetricsRegistry class', () => {
      expect(MetricsRegistry).toBeDefined();
      expect(typeof MetricsRegistry).toBe('function');
    });

    it('should export metricsRegistry singleton', () => {
      expect(metricsRegistry).toBeDefined();
      expect(metricsRegistry).toBeInstanceOf(MetricsRegistry);
    });

    it('should export incrementCounter function', () => {
      expect(typeof incrementCounter).toBe('function');
    });

    it('should export setGauge function', () => {
      expect(typeof setGauge).toBe('function');
    });

    it('should export observeHistogram function', () => {
      expect(typeof observeHistogram).toBe('function');
    });

    it('should export exportMetrics function', () => {
      expect(typeof exportMetrics).toBe('function');
    });

    it('should export Metric type (compile-time check)', () => {
      
      const _typeCheck: Metric = {
        name: 'test',
        help: 'test',
        type: 'counter',
        value: 1,
      };
      expect(_typeCheck.name).toBe('test');
    });

    it('should export HistogramBucket type (compile-time check)', () => {
      const _typeCheck: HistogramBucket = { le: 1, count: 0 };
      expect(_typeCheck.le).toBe(1);
    });

    it('should export HistogramMetric type (compile-time check)', () => {
      const _typeCheck: HistogramMetric = {
        name: 'test',
        help: '',
        buckets: [],
        sum: 0,
        count: 0,
      };
      expect(_typeCheck.name).toBe('test');
    });

    it('should allow creating new MetricsRegistry instances', () => {
      const custom = new MetricsRegistry();
      expect(custom).toBeInstanceOf(MetricsRegistry);
      expect(custom).not.toBe(metricsRegistry);
    });
  });

  
  
  
  describe('incrementCounter', () => {
    it('should delegate to metricsRegistry.incrementCounter', () => {
      incrementCounter('conv_counter');
      const output = exportMetrics();
      expect(output).toContain('conv_counter 1');
    });

    it('should accept labels parameter', () => {
      incrementCounter('conv_counter', { method: 'GET' });
      const output = exportMetrics();
      expect(output).toContain('conv_counter{method="GET"} 1');
    });

    it('should accept value parameter', () => {
      incrementCounter('conv_counter', {}, 5);
      const output = exportMetrics();
      expect(output).toContain('conv_counter 5');
    });

    it('should accept both labels and value', () => {
      incrementCounter('conv_counter', { env: 'prod' }, 10);
      const output = exportMetrics();
      expect(output).toContain('conv_counter{env="prod"} 10');
    });

    it('should work with undefined labels', () => {
      incrementCounter('conv_counter', undefined);
      const output = exportMetrics();
      expect(output).toContain('conv_counter 1');
    });

    it('should work with undefined value', () => {
      incrementCounter('conv_counter', {}, undefined);
      const output = exportMetrics();
      expect(output).toContain('conv_counter 1');
    });

    it('should accumulate across multiple calls', () => {
      incrementCounter('conv_counter');
      incrementCounter('conv_counter');
      incrementCounter('conv_counter');
      const output = exportMetrics();
      expect(output).toContain('conv_counter 3');
    });

    it('should share state with metricsRegistry', () => {
      incrementCounter('shared_counter');
      metricsRegistry.incrementCounter('shared_counter');
      const output = exportMetrics();
      expect(output).toContain('shared_counter 2');
    });
  });

  
  
  
  describe('setGauge', () => {
    it('should delegate to metricsRegistry.setGauge', () => {
      setGauge('conv_gauge', 42);
      const output = exportMetrics();
      expect(output).toContain('conv_gauge 42');
    });

    it('should accept labels parameter', () => {
      setGauge('conv_gauge', 99, { host: 'server1' });
      const output = exportMetrics();
      expect(output).toContain('conv_gauge{host="server1"} 99');
    });

    it('should overwrite previous value', () => {
      setGauge('conv_gauge', 10);
      setGauge('conv_gauge', 20);
      const output = exportMetrics();
      expect(output).toContain('conv_gauge 20');
    });

    it('should work with undefined labels', () => {
      setGauge('conv_gauge', 7, undefined);
      const output = exportMetrics();
      expect(output).toContain('conv_gauge 7');
    });

    it('should set zero value', () => {
      setGauge('conv_gauge', 0);
      const output = exportMetrics();
      expect(output).toContain('conv_gauge 0');
    });

    it('should set negative value', () => {
      setGauge('conv_gauge', -50);
      const output = exportMetrics();
      expect(output).toContain('conv_gauge -50');
    });

    it('should share state with metricsRegistry', () => {
      setGauge('shared_gauge', 10);
      metricsRegistry.setGauge('shared_gauge', 20);
      const output = exportMetrics();
      expect(output).toContain('shared_gauge 20');
    });
  });

  
  
  
  describe('observeHistogram', () => {
    it('should delegate to metricsRegistry.observeHistogram', () => {
      observeHistogram('conv_hist', 0.5);
      const output = exportMetrics();
      expect(output).toContain('conv_hist_sum 0.5');
      expect(output).toContain('conv_hist_count 1');
    });

    it('should use default buckets when none specified', () => {
      observeHistogram('conv_hist', 0.05);
      const output = exportMetrics();
      expect(output).toContain('conv_hist_bucket{le="0.005"} 0');
      expect(output).toContain('conv_hist_bucket{le="0.05"} 1');
      expect(output).toContain('conv_hist_bucket{le="10"} 1');
    });

    it('should accept custom buckets', () => {
      observeHistogram('conv_hist', 5, [1, 10, 100]);
      const output = exportMetrics();
      expect(output).toContain('conv_hist_bucket{le="1"} 0');
      expect(output).toContain('conv_hist_bucket{le="10"} 1');
      expect(output).toContain('conv_hist_bucket{le="100"} 1');
    });

    it('should accept labels', () => {
      observeHistogram('conv_hist', 0.1, [0.5], { method: 'GET' });
      const output = exportMetrics();
      expect(output).toContain('conv_hist_sum{method="GET"} 0.1');
    });

    it('should accept both custom buckets and labels', () => {
      observeHistogram('conv_hist', 0.3, [0.1, 0.5, 1], { path: '/api' });
      const output = exportMetrics();
      expect(output).toContain('conv_hist_bucket{path="/api",le="0.1"} 0');
      expect(output).toContain('conv_hist_bucket{path="/api",le="0.5"} 1');
      expect(output).toContain('conv_hist_sum{path="/api"} 0.3');
    });

    it('should work with undefined buckets', () => {
      observeHistogram('conv_hist', 0.05, undefined);
      const output = exportMetrics();
      
      expect(output).toContain('conv_hist_bucket{le="0.05"} 1');
    });

    it('should work with undefined labels', () => {
      observeHistogram('conv_hist', 0.05, [0.1], undefined);
      const output = exportMetrics();
      expect(output).toContain('conv_hist_sum 0.05');
    });

    it('should share state with metricsRegistry', () => {
      observeHistogram('shared_hist', 0.1, [1]);
      metricsRegistry.observeHistogram('shared_hist', 0.2, [1]);
      const output = exportMetrics();
      expect(output).toContain('shared_hist_count 2');
    });
  });

  
  
  
  describe('exportMetrics', () => {
    it('should return empty string for empty registry', () => {
      const output = exportMetrics();
      expect(output).toBe('');
    });

    it('should return Prometheus text format string', () => {
      incrementCounter('test_counter');
      const output = exportMetrics();
      expect(typeof output).toBe('string');
      expect(output).toContain('# HELP test_counter Counter metric');
      expect(output).toContain('# TYPE test_counter counter');
      expect(output).toContain('test_counter 1');
    });

    it('should return same result as metricsRegistry.export()', () => {
      incrementCounter('x');
      setGauge('y', 5);
      observeHistogram('z', 0.5, [1]);
      const convenienceOutput = exportMetrics();
      const directOutput = metricsRegistry.export();
      expect(convenienceOutput).toBe(directOutput);
    });

    it('should reflect changes after reset', () => {
      incrementCounter('before_reset');
      metricsRegistry.reset();
      incrementCounter('after_reset');
      const output = exportMetrics();
      expect(output).not.toContain('before_reset');
      expect(output).toContain('after_reset 1');
    });

    it('should return full multi-metric export', () => {
      incrementCounter('requests', { method: 'GET' }, 100);
      setGauge('connections', 42);
      observeHistogram('latency', 0.123, [0.1, 0.5, 1]);
      const output = exportMetrics();
      expect(output).toContain('requests{method="GET"} 100');
      expect(output).toContain('connections 42');
      expect(output).toContain('latency_sum 0.123');
    });
  });

  
  
  
  describe('singleton behavior', () => {
    it('should share state between convenience functions and direct registry access', () => {
      incrementCounter('singleton_test');
      const output = metricsRegistry.export();
      expect(output).toContain('singleton_test 1');
    });

    it('should share counter state across convenience and direct calls', () => {
      incrementCounter('mixed_counter', {}, 3);
      metricsRegistry.incrementCounter('mixed_counter', {}, 7);
      const output = exportMetrics();
      expect(output).toContain('mixed_counter 10');
    });

    it('should share gauge state across convenience and direct calls', () => {
      setGauge('mixed_gauge', 100);
      metricsRegistry.setGauge('mixed_gauge', 200);
      const output = exportMetrics();
      expect(output).toContain('mixed_gauge 200');
      expect(output).not.toContain('mixed_gauge 100');
    });

    it('should share histogram state across convenience and direct calls', () => {
      observeHistogram('mixed_hist', 0.1, [1]);
      metricsRegistry.observeHistogram('mixed_hist', 0.2, [1]);
      const output = exportMetrics();
      expect(output).toContain('mixed_hist_count 2');
    });

    it('should be reset via metricsRegistry.reset()', () => {
      incrementCounter('to_reset');
      setGauge('to_reset_gauge', 5);
      metricsRegistry.reset();
      expect(exportMetrics()).toBe('');
    });

    it('should not be the same instance as a newly created MetricsRegistry', () => {
      const newRegistry = new MetricsRegistry();
      incrementCounter('only_singleton');
      expect(newRegistry.export()).toBe('');
      expect(exportMetrics()).toContain('only_singleton');
    });
  });

  
  
  
  describe('integration: full workflow', () => {
    it('should support a complete metrics lifecycle', () => {
      
      incrementCounter('http_requests_total', { method: 'GET', status: '200' }, 150);
      incrementCounter('http_requests_total', { method: 'POST', status: '201' }, 30);
      incrementCounter('http_requests_total', { method: 'GET', status: '404' }, 5);
      setGauge('active_connections', 42);
      setGauge('memory_usage_bytes', 1024 * 1024 * 512);
      observeHistogram('request_duration_seconds', 0.05, [0.01, 0.05, 0.1, 0.5, 1, 5]);
      observeHistogram('request_duration_seconds', 0.12, [0.01, 0.05, 0.1, 0.5, 1, 5]);
      observeHistogram('request_duration_seconds', 0.003, [0.01, 0.05, 0.1, 0.5, 1, 5]);

      const output = exportMetrics();

      
      expect(output).toContain('http_requests_total{method="GET",status="200"} 150');
      expect(output).toContain('http_requests_total{method="POST",status="201"} 30');
      expect(output).toContain('http_requests_total{method="GET",status="404"} 5');

      
      expect(output).toContain('active_connections 42');
      expect(output).toContain('memory_usage_bytes 536870912');

      
      expect(output).toContain('request_duration_seconds_bucket{le="0.01"} 1');
      expect(output).toContain('request_duration_seconds_bucket{le="0.05"} 2');
      expect(output).toContain('request_duration_seconds_bucket{le="0.1"} 2');
      expect(output).toContain('request_duration_seconds_bucket{le="0.5"} 3');
      expect(output).toContain('request_duration_seconds_count 3');
    });

    it('should support reset and re-record', () => {
      incrementCounter('first_run');
      metricsRegistry.reset();
      incrementCounter('second_run');
      const output = exportMetrics();
      expect(output).not.toContain('first_run');
      expect(output).toContain('second_run 1');
    });

    it('should correctly handle concurrent-style label tracking', () => {
      
      const routes = ['/api/users', '/api/posts', '/api/comments'];
      const methods = ['GET', 'POST', 'PUT', 'DELETE'];

      for (const route of routes) {
        for (const method of methods) {
          incrementCounter('http_requests', { route, method }, Math.floor(Math.random() * 100) + 1);
        }
      }

      const output = exportMetrics();
      
      const requestLines = output.split('\n').filter(l => l.startsWith('http_requests{'));
      expect(requestLines).toHaveLength(12);
    });
  });
});
