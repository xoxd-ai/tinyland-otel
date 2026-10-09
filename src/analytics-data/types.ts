


export interface PageView {
  timestamp: string;
  path: string;
  sessionId?: string;
  userId?: string;
  clientIp?: string;
  referrer?: string;
  userAgent?: string;
}




export interface AnalyticsMetrics {
  totalPageViews: number;
  uniqueVisitors: number;
  topPages: Array<{ path: string; views: number }>;
  averageSessionDuration: number;
  bounceRate: number;
}





export interface Logger {
  info: (data: Record<string, unknown>, msg: string) => void;
  warn: (data: Record<string, unknown>, msg: string) => void;
  error: (data: Record<string, unknown>, msg: string) => void;
}





export interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}





export interface AnalyticsDataConfig {
  lokiUrl: string;
  prometheusUrl: string;
  fetchLoki: (path: string) => Promise<FetchResponse>;
  logger?: Logger;
}
