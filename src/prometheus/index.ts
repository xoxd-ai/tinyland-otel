


















export type { Metric, HistogramBucket, HistogramMetric } from './types.js';


export { MetricsRegistry } from './registry.js';


import { MetricsRegistry } from './registry.js';




export const metricsRegistry = new MetricsRegistry();








export function incrementCounter(name: string, labels?: Record<string, string>, value?: number): void {
  metricsRegistry.incrementCounter(name, labels, value);
}








export function setGauge(name: string, value: number, labels?: Record<string, string>): void {
  metricsRegistry.setGauge(name, value, labels);
}









export function observeHistogram(
  name: string,
  value: number,
  buckets?: number[],
  labels?: Record<string, string>
): void {
  metricsRegistry.observeHistogram(name, value, buckets, labels);
}






export function exportMetrics(): string {
  return metricsRegistry.export();
}
