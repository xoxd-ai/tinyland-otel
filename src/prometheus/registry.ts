







import type { HistogramMetric } from './types.js';





export class MetricsRegistry {
  private counters = new Map<string, Map<string, number>>();
  private gauges = new Map<string, Map<string, number>>();
  private histograms = new Map<string, HistogramMetric>();

  






  incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    const labelKey = this.getLabelKey(labels);

    if (!this.counters.has(name)) {
      this.counters.set(name, new Map());
    }

    const current = this.counters.get(name)!.get(labelKey) || 0;
    this.counters.get(name)!.set(labelKey, current + value);
  }

  






  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const labelKey = this.getLabelKey(labels);

    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Map());
    }

    this.gauges.get(name)!.set(labelKey, value);
  }

  







  observeHistogram(
    name: string,
    value: number,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    labels: Record<string, string> = {}
  ): void {
    const labelKey = this.getLabelKey(labels);
    const metricKey = `${name}_${labelKey}`;

    if (!this.histograms.has(metricKey)) {
      this.histograms.set(metricKey, {
        name,
        help: '',
        buckets: buckets.map(le => ({ le, count: 0 })),
        sum: 0,
        count: 0,
        labels
      });
    }

    const histogram = this.histograms.get(metricKey)!;
    histogram.sum += value;
    histogram.count += 1;

    
    for (const bucket of histogram.buckets) {
      if (value <= bucket.le) {
        bucket.count += 1;
      }
    }
  }

  


  private getLabelKey(labels: Record<string, string>): string {
    const sortedKeys = Object.keys(labels).sort();
    return sortedKeys.map(key => `${key}="${labels[key]}"`).join(',');
  }

  


  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`;
  }

  




  export(): string {
    const lines: string[] = [];

    
    this.counters.forEach((labelMap, name) => {
      lines.push(`# HELP ${name} Counter metric`);
      lines.push(`# TYPE ${name} counter`);

      labelMap.forEach((value, labelKey) => {
        const labels = labelKey ? `{${labelKey}}` : '';
        lines.push(`${name}${labels} ${value}`);
      });
      lines.push('');
    });

    
    this.gauges.forEach((labelMap, name) => {
      lines.push(`# HELP ${name} Gauge metric`);
      lines.push(`# TYPE ${name} gauge`);

      labelMap.forEach((value, labelKey) => {
        const labels = labelKey ? `{${labelKey}}` : '';
        lines.push(`${name}${labels} ${value}`);
      });
      lines.push('');
    });

    
    this.histograms.forEach((histogram) => {
      const labelsStr = this.formatLabels(histogram.labels || {});

      lines.push(`# HELP ${histogram.name} Histogram metric`);
      lines.push(`# TYPE ${histogram.name} histogram`);

      
      for (const bucket of histogram.buckets) {
        const bucketLabels = labelsStr
          ? `${labelsStr.slice(0, -1)},le="${bucket.le}"}`
          : `{le="${bucket.le}"}`;
        lines.push(`${histogram.name}_bucket${bucketLabels} ${bucket.count}`);
      }

      
      const infLabels = labelsStr
        ? `${labelsStr.slice(0, -1)},le="+Inf"}`
        : `{le="+Inf"}`;
      lines.push(`${histogram.name}_bucket${infLabels} ${histogram.count}`);

      
      lines.push(`${histogram.name}_sum${labelsStr} ${histogram.sum}`);
      lines.push(`${histogram.name}_count${labelsStr} ${histogram.count}`);
      lines.push('');
    });

    return lines.join('\n');
  }

  


  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}
