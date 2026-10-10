import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsRegistry } from '../src/prometheus/registry.js';

describe('MetricsRegistry', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  
  
  
  describe('incrementCounter', () => {
    it('should create a counter with default increment of 1', () => {
      registry.incrementCounter('http_requests_total');
      const output = registry.export();
      expect(output).toContain('http_requests_total 1');
    });

    it('should increment a counter by 1 when no value is specified', () => {
      registry.incrementCounter('requests');
      registry.incrementCounter('requests');
      const output = registry.export();
      expect(output).toContain('requests 2');
    });

    it('should increment a counter by a custom value', () => {
      registry.incrementCounter('bytes_sent', {}, 512);
      const output = registry.export();
      expect(output).toContain('bytes_sent 512');
    });

    it('should accumulate increments over multiple calls', () => {
      registry.incrementCounter('hits', {}, 10);
      registry.incrementCounter('hits', {}, 20);
      registry.incrementCounter('hits', {}, 30);
      const output = registry.export();
      expect(output).toContain('hits 60');
    });

    it('should track separate counters by name', () => {
      registry.incrementCounter('counter_a');
      registry.incrementCounter('counter_b', {}, 5);
      const output = registry.export();
      expect(output).toContain('counter_a 1');
      expect(output).toContain('counter_b 5');
    });

    it('should track counters with labels', () => {
      registry.incrementCounter('http_requests_total', { method: 'GET', status: '200' });
      const output = registry.export();
      expect(output).toContain('http_requests_total{method="GET",status="200"} 1');
    });

    it('should track counters with different label sets independently', () => {
      registry.incrementCounter('http_requests_total', { method: 'GET' });
      registry.incrementCounter('http_requests_total', { method: 'POST' });
      registry.incrementCounter('http_requests_total', { method: 'GET' });
      const output = registry.export();
      expect(output).toContain('http_requests_total{method="GET"} 2');
      expect(output).toContain('http_requests_total{method="POST"} 1');
    });

    it('should handle counters with empty labels', () => {
      registry.incrementCounter('simple_counter', {});
      const output = registry.export();
      expect(output).toContain('simple_counter 1');
      expect(output).not.toContain('simple_counter{');
    });

    it('should increment by zero', () => {
      registry.incrementCounter('zero_inc', {}, 0);
      const output = registry.export();
      expect(output).toContain('zero_inc 0');
    });

    it('should handle incrementing by fractional values', () => {
      registry.incrementCounter('fractional', {}, 0.5);
      registry.incrementCounter('fractional', {}, 0.3);
      const output = registry.export();
      expect(output).toContain('fractional 0.8');
    });

    it('should handle very large counter values', () => {
      registry.incrementCounter('big_counter', {}, 1e15);
      const output = registry.export();
      expect(output).toContain('big_counter 1000000000000000');
    });

    it('should handle multiple label keys sorted consistently', () => {
      registry.incrementCounter('req', { z: '1', a: '2' });
      registry.incrementCounter('req', { a: '2', z: '1' });
      const output = registry.export();
      
      expect(output).toContain('req{a="2",z="1"} 2');
    });

    it('should track many distinct label combinations', () => {
      for (let i = 0; i < 100; i++) {
        registry.incrementCounter('mass_counter', { id: String(i) });
      }
      const output = registry.export();
      expect(output).toContain('mass_counter{id="0"} 1');
      expect(output).toContain('mass_counter{id="99"} 1');
    });
  });

  
  
  
  describe('setGauge', () => {
    it('should set a gauge value', () => {
      registry.setGauge('temperature', 36.6);
      const output = registry.export();
      expect(output).toContain('temperature 36.6');
    });

    it('should overwrite a gauge value on subsequent calls', () => {
      registry.setGauge('active_connections', 10);
      registry.setGauge('active_connections', 5);
      const output = registry.export();
      expect(output).toContain('active_connections 5');
      expect(output).not.toContain('active_connections 10');
    });

    it('should set a gauge with labels', () => {
      registry.setGauge('cpu_usage', 75.5, { core: '0' });
      const output = registry.export();
      expect(output).toContain('cpu_usage{core="0"} 75.5');
    });

    it('should track gauges with different label sets independently', () => {
      registry.setGauge('memory', 1024, { host: 'a' });
      registry.setGauge('memory', 2048, { host: 'b' });
      const output = registry.export();
      expect(output).toContain('memory{host="a"} 1024');
      expect(output).toContain('memory{host="b"} 2048');
    });

    it('should handle gauge with empty labels', () => {
      registry.setGauge('uptime', 3600, {});
      const output = registry.export();
      expect(output).toContain('uptime 3600');
      expect(output).not.toContain('uptime{');
    });

    it('should set a gauge to zero', () => {
      registry.setGauge('queue_size', 100);
      registry.setGauge('queue_size', 0);
      const output = registry.export();
      expect(output).toContain('queue_size 0');
    });

    it('should set a gauge to a negative value', () => {
      registry.setGauge('temperature_celsius', -15);
      const output = registry.export();
      expect(output).toContain('temperature_celsius -15');
    });

    it('should track multiple gauge metrics by name', () => {
      registry.setGauge('gauge_a', 1);
      registry.setGauge('gauge_b', 2);
      registry.setGauge('gauge_c', 3);
      const output = registry.export();
      expect(output).toContain('gauge_a 1');
      expect(output).toContain('gauge_b 2');
      expect(output).toContain('gauge_c 3');
    });

    it('should handle very large gauge values', () => {
      registry.setGauge('large_gauge', Number.MAX_SAFE_INTEGER);
      const output = registry.export();
      expect(output).toContain(`large_gauge ${Number.MAX_SAFE_INTEGER}`);
    });

    it('should handle very small fractional gauge values', () => {
      registry.setGauge('tiny_gauge', 0.000001);
      const output = registry.export();
      expect(output).toContain('tiny_gauge 0.000001');
    });

    it('should overwrite gauge with labels correctly', () => {
      registry.setGauge('disk', 80, { mount: '/' });
      registry.setGauge('disk', 90, { mount: '/' });
      const output = registry.export();
      expect(output).toContain('disk{mount="/"} 90');
      
      const matches = output.match(/disk\{mount="\/"\}/g);
      expect(matches).toHaveLength(1);
    });
  });

  
  
  
  describe('observeHistogram', () => {
    it('should record a histogram observation with default buckets', () => {
      registry.observeHistogram('request_duration', 0.05);
      const output = registry.export();
      expect(output).toContain('# TYPE request_duration histogram');
      expect(output).toContain('request_duration_sum 0.05');
      expect(output).toContain('request_duration_count 1');
    });

    it('should use default bucket boundaries', () => {
      registry.observeHistogram('latency', 0.05);
      const output = registry.export();
      
      expect(output).toContain('latency_bucket{le="0.005"} 0');
      expect(output).toContain('latency_bucket{le="0.01"} 0');
      expect(output).toContain('latency_bucket{le="0.025"} 0');
      expect(output).toContain('latency_bucket{le="0.05"} 1');
      expect(output).toContain('latency_bucket{le="0.1"} 1');
      expect(output).toContain('latency_bucket{le="10"} 1');
      expect(output).toContain('latency_bucket{le="+Inf"} 1');
    });

    it('should use custom bucket boundaries', () => {
      registry.observeHistogram('custom', 1.5, [1, 2, 5]);
      const output = registry.export();
      expect(output).toContain('custom_bucket{le="1"} 0');
      expect(output).toContain('custom_bucket{le="2"} 1');
      expect(output).toContain('custom_bucket{le="5"} 1');
      expect(output).toContain('custom_bucket{le="+Inf"} 1');
    });

    it('should track sum correctly across multiple observations', () => {
      registry.observeHistogram('duration', 0.1);
      registry.observeHistogram('duration', 0.2);
      registry.observeHistogram('duration', 0.3);
      const output = registry.export();
      
      expect(output).toMatch(/duration_sum 0\.6/);
    });

    it('should track count correctly across multiple observations', () => {
      registry.observeHistogram('duration', 0.1);
      registry.observeHistogram('duration', 0.2);
      registry.observeHistogram('duration', 0.3);
      const output = registry.export();
      expect(output).toContain('duration_count 3');
    });

    it('should increment bucket counts correctly', () => {
      const buckets = [1, 5, 10];
      registry.observeHistogram('size', 0.5, buckets);
      registry.observeHistogram('size', 3, buckets);
      registry.observeHistogram('size', 7, buckets);
      registry.observeHistogram('size', 15, buckets);
      const output = registry.export();
      expect(output).toContain('size_bucket{le="1"} 1');   
      expect(output).toContain('size_bucket{le="5"} 2');   
      expect(output).toContain('size_bucket{le="10"} 3');  
      expect(output).toContain('size_bucket{le="+Inf"} 4');
    });

    it('should handle observation equal to a bucket boundary', () => {
      const buckets = [1, 5, 10];
      registry.observeHistogram('exact', 5, buckets);
      const output = registry.export();
      expect(output).toContain('exact_bucket{le="1"} 0');
      expect(output).toContain('exact_bucket{le="5"} 1');
      expect(output).toContain('exact_bucket{le="10"} 1');
    });

    it('should handle observation larger than all buckets', () => {
      const buckets = [1, 5, 10];
      registry.observeHistogram('beyond', 100, buckets);
      const output = registry.export();
      expect(output).toContain('beyond_bucket{le="1"} 0');
      expect(output).toContain('beyond_bucket{le="5"} 0');
      expect(output).toContain('beyond_bucket{le="10"} 0');
      expect(output).toContain('beyond_bucket{le="+Inf"} 1');
    });

    it('should handle observation of zero', () => {
      const buckets = [1, 5, 10];
      registry.observeHistogram('zero_obs', 0, buckets);
      const output = registry.export();
      expect(output).toContain('zero_obs_bucket{le="1"} 1');
      expect(output).toContain('zero_obs_sum 0');
      expect(output).toContain('zero_obs_count 1');
    });

    it('should handle negative observation values', () => {
      const buckets = [0, 1, 5];
      registry.observeHistogram('negative', -1, buckets);
      const output = registry.export();
      expect(output).toContain('negative_bucket{le="0"} 1');
      expect(output).toContain('negative_bucket{le="1"} 1');
      expect(output).toContain('negative_sum -1');
    });

    it('should record histogram observations with labels', () => {
      registry.observeHistogram('http_duration', 0.1, [0.1, 0.5, 1], { method: 'GET' });
      const output = registry.export();
      expect(output).toContain('http_duration_bucket{method="GET",le="0.1"} 1');
      expect(output).toContain('http_duration_bucket{method="GET",le="0.5"} 1');
      expect(output).toContain('http_duration_bucket{method="GET",le="1"} 1');
      expect(output).toContain('http_duration_bucket{method="GET",le="+Inf"} 1');
      expect(output).toContain('http_duration_sum{method="GET"} 0.1');
      expect(output).toContain('http_duration_count{method="GET"} 1');
    });

    it('should track histograms with different label sets independently', () => {
      const buckets = [0.1, 1];
      registry.observeHistogram('req_time', 0.05, buckets, { endpoint: '/api' });
      registry.observeHistogram('req_time', 0.5, buckets, { endpoint: '/web' });
      const output = registry.export();
      expect(output).toContain('req_time_bucket{endpoint="/api",le="0.1"} 1');
      expect(output).toContain('req_time_bucket{endpoint="/web",le="0.1"} 0');
      expect(output).toContain('req_time_sum{endpoint="/api"} 0.05');
      expect(output).toContain('req_time_sum{endpoint="/web"} 0.5');
    });

    it('should handle many observations filling all buckets', () => {
      const buckets = [1, 2, 3];
      for (let i = 0; i <= 3; i++) {
        registry.observeHistogram('fill', i, buckets);
      }
      const output = registry.export();
      
      expect(output).toContain('fill_bucket{le="1"} 2');  
      expect(output).toContain('fill_bucket{le="2"} 3');  
      expect(output).toContain('fill_bucket{le="3"} 4');  
      expect(output).toContain('fill_count 4');
      expect(output).toContain('fill_sum 6');
    });

    it('should handle a single bucket', () => {
      registry.observeHistogram('single_bucket', 0.5, [1]);
      const output = registry.export();
      expect(output).toContain('single_bucket_bucket{le="1"} 1');
      expect(output).toContain('single_bucket_bucket{le="+Inf"} 1');
    });

    it('should handle very large observation values', () => {
      registry.observeHistogram('huge', 1e12, [1, 10, 100]);
      const output = registry.export();
      expect(output).toContain('huge_bucket{le="1"} 0');
      expect(output).toContain('huge_bucket{le="100"} 0');
      expect(output).toContain('huge_sum 1000000000000');
    });
  });

  
  
  
  describe('label handling', () => {
    it('should sort label keys alphabetically for consistent storage', () => {
      registry.incrementCounter('sorted_test', { z: 'last', a: 'first', m: 'mid' });
      const output = registry.export();
      expect(output).toContain('sorted_test{a="first",m="mid",z="last"} 1');
    });

    it('should treat same labels in different order as same series', () => {
      registry.incrementCounter('order_test', { b: '2', a: '1' });
      registry.incrementCounter('order_test', { a: '1', b: '2' });
      const output = registry.export();
      expect(output).toContain('order_test{a="1",b="2"} 2');
    });

    it('should differentiate metrics by label values', () => {
      registry.incrementCounter('diff_test', { env: 'prod' });
      registry.incrementCounter('diff_test', { env: 'dev' });
      const output = registry.export();
      expect(output).toContain('diff_test{env="prod"} 1');
      expect(output).toContain('diff_test{env="dev"} 1');
    });

    it('should handle labels with empty string values', () => {
      registry.incrementCounter('empty_val', { key: '' });
      const output = registry.export();
      expect(output).toContain('empty_val{key=""} 1');
    });

    it('should handle labels with special characters in values', () => {
      registry.incrementCounter('special', { path: '/api/v1' });
      const output = registry.export();
      expect(output).toContain('special{path="/api/v1"} 1');
    });

    it('should handle labels with spaces in values', () => {
      registry.incrementCounter('spaces', { msg: 'hello world' });
      const output = registry.export();
      expect(output).toContain('spaces{msg="hello world"} 1');
    });

    it('should handle labels with equals sign in values', () => {
      registry.incrementCounter('equals', { query: 'a=b' });
      const output = registry.export();
      expect(output).toContain('equals{query="a=b"} 1');
    });

    it('should handle a single label', () => {
      registry.incrementCounter('single_label', { env: 'test' });
      const output = registry.export();
      expect(output).toContain('single_label{env="test"} 1');
    });

    it('should handle many labels', () => {
      const labels: Record<string, string> = {};
      for (let i = 0; i < 10; i++) {
        labels[`key${i}`] = `value${i}`;
      }
      registry.incrementCounter('many_labels', labels);
      const output = registry.export();
      expect(output).toContain('key0="value0"');
      expect(output).toContain('key9="value9"');
    });
  });

  
  
  
  describe('export', () => {
    it('should return empty string for empty registry', () => {
      const output = registry.export();
      expect(output).toBe('');
    });

    it('should include HELP line for counters', () => {
      registry.incrementCounter('my_counter');
      const output = registry.export();
      expect(output).toContain('# HELP my_counter Counter metric');
    });

    it('should include TYPE line for counters', () => {
      registry.incrementCounter('my_counter');
      const output = registry.export();
      expect(output).toContain('# TYPE my_counter counter');
    });

    it('should include HELP line for gauges', () => {
      registry.setGauge('my_gauge', 1);
      const output = registry.export();
      expect(output).toContain('# HELP my_gauge Gauge metric');
    });

    it('should include TYPE line for gauges', () => {
      registry.setGauge('my_gauge', 1);
      const output = registry.export();
      expect(output).toContain('# TYPE my_gauge gauge');
    });

    it('should include HELP line for histograms', () => {
      registry.observeHistogram('my_hist', 1);
      const output = registry.export();
      expect(output).toContain('# HELP my_hist Histogram metric');
    });

    it('should include TYPE line for histograms', () => {
      registry.observeHistogram('my_hist', 1);
      const output = registry.export();
      expect(output).toContain('# TYPE my_hist histogram');
    });

    it('should format counter without labels correctly', () => {
      registry.incrementCounter('plain_counter', {}, 42);
      const output = registry.export();
      const lines = output.split('\n');
      expect(lines).toContain('plain_counter 42');
    });

    it('should format counter with labels correctly', () => {
      registry.incrementCounter('labeled_counter', { method: 'GET' }, 7);
      const output = registry.export();
      expect(output).toContain('labeled_counter{method="GET"} 7');
    });

    it('should format gauge without labels correctly', () => {
      registry.setGauge('plain_gauge', 99.9);
      const output = registry.export();
      expect(output).toContain('plain_gauge 99.9');
    });

    it('should format gauge with labels correctly', () => {
      registry.setGauge('labeled_gauge', 55, { region: 'us-east' });
      const output = registry.export();
      expect(output).toContain('labeled_gauge{region="us-east"} 55');
    });

    it('should format histogram buckets without labels correctly', () => {
      registry.observeHistogram('hist_no_labels', 0.5, [0.1, 1, 10]);
      const output = registry.export();
      expect(output).toContain('hist_no_labels_bucket{le="0.1"} 0');
      expect(output).toContain('hist_no_labels_bucket{le="1"} 1');
      expect(output).toContain('hist_no_labels_bucket{le="10"} 1');
      expect(output).toContain('hist_no_labels_bucket{le="+Inf"} 1');
    });

    it('should format histogram sum and count without labels', () => {
      registry.observeHistogram('hist_sc', 2.5, [1, 5]);
      const output = registry.export();
      expect(output).toContain('hist_sc_sum 2.5');
      expect(output).toContain('hist_sc_count 1');
    });

    it('should format histogram buckets with labels correctly', () => {
      registry.observeHistogram('hist_labels', 0.5, [1], { service: 'api' });
      const output = registry.export();
      expect(output).toContain('hist_labels_bucket{service="api",le="1"} 1');
      expect(output).toContain('hist_labels_bucket{service="api",le="+Inf"} 1');
    });

    it('should format histogram sum and count with labels', () => {
      registry.observeHistogram('hist_lsc', 3.0, [1, 5], { app: 'web' });
      const output = registry.export();
      expect(output).toContain('hist_lsc_sum{app="web"} 3');
      expect(output).toContain('hist_lsc_count{app="web"} 1');
    });

    it('should export counters before gauges before histograms', () => {
      registry.observeHistogram('z_hist', 1, [1]);
      registry.setGauge('m_gauge', 1);
      registry.incrementCounter('a_counter');
      const output = registry.export();
      const counterPos = output.indexOf('# TYPE a_counter counter');
      const gaugePos = output.indexOf('# TYPE m_gauge gauge');
      const histPos = output.indexOf('# TYPE z_hist histogram');
      expect(counterPos).toBeLessThan(gaugePos);
      expect(gaugePos).toBeLessThan(histPos);
    });

    it('should separate metric blocks with blank lines', () => {
      registry.incrementCounter('sep_counter');
      const output = registry.export();
      
      expect(output).toContain('sep_counter 1\n');
    });

    it('should export a multi-metric registry correctly', () => {
      registry.incrementCounter('requests', { method: 'GET' }, 100);
      registry.incrementCounter('requests', { method: 'POST' }, 20);
      registry.setGauge('connections', 42);
      registry.observeHistogram('latency', 0.123, [0.1, 0.5, 1]);
      const output = registry.export();
      expect(output).toContain('# TYPE requests counter');
      expect(output).toContain('requests{method="GET"} 100');
      expect(output).toContain('requests{method="POST"} 20');
      expect(output).toContain('# TYPE connections gauge');
      expect(output).toContain('connections 42');
      expect(output).toContain('# TYPE latency histogram');
      expect(output).toContain('latency_bucket{le="0.1"} 0');
      expect(output).toContain('latency_bucket{le="0.5"} 1');
      expect(output).toContain('latency_bucket{le="+Inf"} 1');
      expect(output).toContain('latency_sum 0.123');
      expect(output).toContain('latency_count 1');
    });

    it('should handle multiple counters with same name but different label sets', () => {
      registry.incrementCounter('multi', { a: '1' }, 10);
      registry.incrementCounter('multi', { a: '2' }, 20);
      registry.incrementCounter('multi', {}, 30);
      const output = registry.export();
      expect(output).toContain('multi{a="1"} 10');
      expect(output).toContain('multi{a="2"} 20');
      expect(output).toContain('multi 30');
    });
  });

  
  
  
  describe('reset', () => {
    it('should clear all counters', () => {
      registry.incrementCounter('c1');
      registry.incrementCounter('c2', { env: 'prod' });
      registry.reset();
      const output = registry.export();
      expect(output).toBe('');
    });

    it('should clear all gauges', () => {
      registry.setGauge('g1', 100);
      registry.setGauge('g2', 200, { host: 'a' });
      registry.reset();
      const output = registry.export();
      expect(output).toBe('');
    });

    it('should clear all histograms', () => {
      registry.observeHistogram('h1', 0.5);
      registry.observeHistogram('h2', 1.0, [1, 5], { svc: 'web' });
      registry.reset();
      const output = registry.export();
      expect(output).toBe('');
    });

    it('should clear all metric types simultaneously', () => {
      registry.incrementCounter('counter');
      registry.setGauge('gauge', 1);
      registry.observeHistogram('histogram', 0.5);
      registry.reset();
      const output = registry.export();
      expect(output).toBe('');
    });

    it('should allow metrics to be recorded after reset', () => {
      registry.incrementCounter('counter');
      registry.reset();
      registry.incrementCounter('counter');
      const output = registry.export();
      expect(output).toContain('counter 1');
    });

    it('should start fresh counters from zero after reset', () => {
      registry.incrementCounter('fresh', {}, 100);
      registry.reset();
      registry.incrementCounter('fresh');
      const output = registry.export();
      expect(output).toContain('fresh 1');
    });
  });

  
  
  
  describe('edge cases', () => {
    it('should handle counter name with underscores', () => {
      registry.incrementCounter('my_app_http_requests_total');
      const output = registry.export();
      expect(output).toContain('my_app_http_requests_total 1');
    });

    it('should handle counter name with colons', () => {
      registry.incrementCounter('namespace:metric:total');
      const output = registry.export();
      expect(output).toContain('namespace:metric:total 1');
    });

    it('should handle gauge set to NaN', () => {
      registry.setGauge('nan_gauge', NaN);
      const output = registry.export();
      expect(output).toContain('nan_gauge NaN');
    });

    it('should handle gauge set to Infinity', () => {
      registry.setGauge('inf_gauge', Infinity);
      const output = registry.export();
      expect(output).toContain('inf_gauge Infinity');
    });

    it('should handle gauge set to negative Infinity', () => {
      registry.setGauge('neg_inf_gauge', -Infinity);
      const output = registry.export();
      expect(output).toContain('neg_inf_gauge -Infinity');
    });

    it('should handle histogram with no observations after creation via export', () => {
      
      registry.observeHistogram('no_obs', 0, [1]);
      const output = registry.export();
      expect(output).toContain('no_obs_bucket{le="1"} 1');
      expect(output).toContain('no_obs_sum 0');
      expect(output).toContain('no_obs_count 1');
    });

    it('should handle multiple resets', () => {
      registry.incrementCounter('x');
      registry.reset();
      registry.reset();
      registry.reset();
      const output = registry.export();
      expect(output).toBe('');
    });

    it('should handle rapid increments', () => {
      for (let i = 0; i < 1000; i++) {
        registry.incrementCounter('rapid');
      }
      const output = registry.export();
      expect(output).toContain('rapid 1000');
    });

    it('should handle histogram with many observations', () => {
      const buckets = [10, 50, 100];
      for (let i = 1; i <= 100; i++) {
        registry.observeHistogram('many_obs', i, buckets);
      }
      const output = registry.export();
      expect(output).toContain('many_obs_bucket{le="10"} 10');
      expect(output).toContain('many_obs_bucket{le="50"} 50');
      expect(output).toContain('many_obs_bucket{le="100"} 100');
      expect(output).toContain('many_obs_count 100');
      
      expect(output).toContain('many_obs_sum 5050');
    });

    it('should handle interleaved operations on different metric types', () => {
      registry.incrementCounter('interleaved');
      registry.setGauge('interleaved_gauge', 5);
      registry.observeHistogram('interleaved_hist', 0.5, [1]);
      registry.incrementCounter('interleaved');
      registry.setGauge('interleaved_gauge', 10);
      registry.observeHistogram('interleaved_hist', 1.5, [1]);
      const output = registry.export();
      expect(output).toContain('interleaved 2');
      expect(output).toContain('interleaved_gauge 10');
      expect(output).toContain('interleaved_hist_count 2');
    });

    it('should produce valid output with all three metric types populated', () => {
      registry.incrementCounter('c', { env: 'prod' }, 5);
      registry.setGauge('g', 42, { host: 'server1' });
      registry.observeHistogram('h', 0.3, [0.1, 0.5, 1], { path: '/api' });
      const output = registry.export();
      
      expect(output).toContain('# HELP c Counter metric');
      expect(output).toContain('# TYPE c counter');
      expect(output).toContain('c{env="prod"} 5');
      expect(output).toContain('# HELP g Gauge metric');
      expect(output).toContain('# TYPE g gauge');
      expect(output).toContain('g{host="server1"} 42');
      expect(output).toContain('# HELP h Histogram metric');
      expect(output).toContain('# TYPE h histogram');
      expect(output).toContain('h_bucket{path="/api",le="0.1"} 0');
      expect(output).toContain('h_bucket{path="/api",le="0.5"} 1');
      expect(output).toContain('h_bucket{path="/api",le="1"} 1');
      expect(output).toContain('h_bucket{path="/api",le="+Inf"} 1');
      expect(output).toContain('h_sum{path="/api"} 0.3');
      expect(output).toContain('h_count{path="/api"} 1');
    });

    it('should handle histogram with multiple labels', () => {
      registry.observeHistogram('multi_label_hist', 0.5, [1], { method: 'GET', status: '200' });
      const output = registry.export();
      expect(output).toContain('multi_label_hist_bucket{method="GET",status="200",le="1"} 1');
      expect(output).toContain('multi_label_hist_sum{method="GET",status="200"} 0.5');
    });
  });
});
