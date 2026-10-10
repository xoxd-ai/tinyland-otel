








export interface Metric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  value: number | Map<string, number>;
  labels?: Record<string, string>;
}




export interface HistogramBucket {
  le: number;
  count: number;
}




export interface HistogramMetric {
  name: string;
  help: string;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
  labels?: Record<string, string>;
}
