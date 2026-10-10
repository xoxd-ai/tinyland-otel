



export interface MetricsWriter {
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
}




export interface AccessibilityMetricsData {
  total: number;
  critical: number;
  byType: {
    contrast: number;
    aria: number;
    keyboard: number;
    altText: number;
  };
  byComponent: Record<string, number>;
  byPage: Record<string, number>;
  byTheme: Record<string, number>;
}




export interface MetricsCollectorsConfig {
  metricsWriter: MetricsWriter;
  getAccessibilityMetrics: () => AccessibilityMetricsData;
  baseDir: string;
}
