import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configure,
  getConfig,
  resetConfig,
  parseTimeRange,
  AnalyticsDataService,
  createAnalyticsDataService,
} from '../src/analytics-data/index.js';
import type { AnalyticsDataConfig, FetchResponse, Logger } from '../src/analytics-data/index.js';





function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeLokiResponse(
  values: Array<[string, string]>
): { data: { result: Array<{ values: Array<[string, string]> }> } } {
  return {
    data: {
      result: [{ values }],
    },
  };
}

function makeOkResponse(body: unknown): FetchResponse {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  };
}

function makeErrorResponse(status: number, statusText: string): FetchResponse {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  };
}


function nanoTs(ms: number): string {
  return `${ms}000000`;
}

function pageViewEntry(
  tsMs: number,
  overrides: Record<string, string> = {}
): [string, string] {
  const defaults = {
    path: '/',
    session_id: 'sess-1',
    client_ip: '1.2.3.4',
    referrer: '',
    user_agent: 'Mozilla/5.0',
  };
  return [nanoTs(tsMs), JSON.stringify({ ...defaults, ...overrides })];
}

function setupService(
  fetchLoki: AnalyticsDataConfig['fetchLoki'],
  logger?: Logger
): AnalyticsDataService {
  configure({
    lokiUrl: 'http://loki:3100',
    prometheusUrl: 'http://prometheus:9090',
    fetchLoki,
    logger,
  });
  return new AnalyticsDataService();
}





describe('configure / getConfig / resetConfig', () => {
  afterEach(() => resetConfig());

  it('throws when getConfig is called before configure', () => {
    expect(() => getConfig()).toThrow(
      'tinyland-analytics-data: call configure() before use'
    );
  });

  it('returns the config after configure', () => {
    const cfg: AnalyticsDataConfig = {
      lokiUrl: 'http://loki:3100',
      prometheusUrl: 'http://prom:9090',
      fetchLoki: vi.fn(),
    };
    configure(cfg);
    expect(getConfig()).toBe(cfg);
  });

  it('resetConfig clears the config', () => {
    configure({
      lokiUrl: 'http://loki:3100',
      prometheusUrl: 'http://prom:9090',
      fetchLoki: vi.fn(),
    });
    resetConfig();
    expect(() => getConfig()).toThrow();
  });

  it('configure can be called multiple times, last wins', () => {
    const cfg1: AnalyticsDataConfig = {
      lokiUrl: 'http://loki1:3100',
      prometheusUrl: 'http://prom1:9090',
      fetchLoki: vi.fn(),
    };
    const cfg2: AnalyticsDataConfig = {
      lokiUrl: 'http://loki2:3100',
      prometheusUrl: 'http://prom2:9090',
      fetchLoki: vi.fn(),
    };
    configure(cfg1);
    configure(cfg2);
    expect(getConfig().lokiUrl).toBe('http://loki2:3100');
  });

  it('config includes optional logger when provided', () => {
    const logger = createMockLogger();
    configure({
      lokiUrl: 'http://loki:3100',
      prometheusUrl: 'http://prom:9090',
      fetchLoki: vi.fn(),
      logger,
    });
    expect(getConfig().logger).toBe(logger);
  });

  it('config logger is undefined when not provided', () => {
    configure({
      lokiUrl: 'http://loki:3100',
      prometheusUrl: 'http://prom:9090',
      fetchLoki: vi.fn(),
    });
    expect(getConfig().logger).toBeUndefined();
  });
});



describe('parseTimeRange', () => {
  it('parses seconds', () => {
    expect(parseTimeRange('30s')).toBe(30_000);
  });

  it('parses minutes', () => {
    expect(parseTimeRange('5m')).toBe(5 * 60 * 1000);
  });

  it('parses hours', () => {
    expect(parseTimeRange('24h')).toBe(24 * 60 * 60 * 1000);
  });

  it('parses days', () => {
    expect(parseTimeRange('7d')).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('parses single unit values', () => {
    expect(parseTimeRange('1h')).toBe(60 * 60 * 1000);
  });

  it('parses large values', () => {
    expect(parseTimeRange('365d')).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it('defaults to 24h for invalid format (letters only)', () => {
    expect(parseTimeRange('abc')).toBe(24 * 60 * 60 * 1000);
  });

  it('defaults to 24h for empty string', () => {
    expect(parseTimeRange('')).toBe(24 * 60 * 60 * 1000);
  });

  it('defaults to 24h for missing unit', () => {
    expect(parseTimeRange('100')).toBe(24 * 60 * 60 * 1000);
  });

  it('defaults to 24h for unknown unit', () => {
    expect(parseTimeRange('10x')).toBe(24 * 60 * 60 * 1000);
  });

  it('defaults to 24h for negative value', () => {
    expect(parseTimeRange('-5m')).toBe(24 * 60 * 60 * 1000);
  });

  it('calls logger.warn for invalid format when logger provided', () => {
    const logger = createMockLogger();
    parseTimeRange('invalid', logger);
    expect(logger.warn).toHaveBeenCalledWith(
      { timeRange: 'invalid' },
      'Invalid time range format, defaulting to 24h'
    );
  });

  it('does not throw when no logger provided for invalid format', () => {
    expect(() => parseTimeRange('invalid')).not.toThrow();
  });
});



describe('AnalyticsDataService', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let logger: Logger;

  beforeEach(() => {
    mockFetch = vi.fn();
    logger = createMockLogger();
  });

  afterEach(() => resetConfig());

  
  
  

  describe('constructor', () => {
    it('throws if configure has not been called', () => {
      expect(() => new AnalyticsDataService()).toThrow(
        'tinyland-analytics-data: call configure() before use'
      );
    });

    it('succeeds after configure', () => {
      const svc = setupService(mockFetch, logger);
      expect(svc).toBeInstanceOf(AnalyticsDataService);
    });

    it('uses console fallback when no logger provided', () => {
      configure({
        lokiUrl: 'http://loki:3100',
        prometheusUrl: 'http://prom:9090',
        fetchLoki: mockFetch,
      });
      expect(() => new AnalyticsDataService()).not.toThrow();
    });
  });

  
  
  

  describe('createAnalyticsDataService', () => {
    it('creates and returns a singleton', () => {
      configure({
        lokiUrl: 'http://loki:3100',
        prometheusUrl: 'http://prom:9090',
        fetchLoki: mockFetch,
        logger,
      });
      const svc = createAnalyticsDataService();
      expect(svc).toBeInstanceOf(AnalyticsDataService);
    });
  });

  
  
  

  describe('getPageViews', () => {
    it('parses a successful Loki response', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { path: '/about', session_id: 's1', client_ip: '10.0.0.1' }),
        pageViewEntry(ts - 1000, { path: '/home', session_id: 's2', client_ip: '10.0.0.2' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews('1h', 100);
      expect(views).toHaveLength(2);
      expect(views[0].path).toBe('/about');
      expect(views[1].path).toBe('/home');
    });

    it('returns results sorted by timestamp descending', async () => {
      const now = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(now - 5000, { path: '/old' }),
        pageViewEntry(now, { path: '/new' }),
        pageViewEntry(now - 2000, { path: '/mid' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views[0].path).toBe('/new');
      expect(views[1].path).toBe('/mid');
      expect(views[2].path).toBe('/old');
    });

    it('returns empty array for empty Loki result', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views).toEqual([]);
    });

    it('returns empty array when fetch response is not ok', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(500, 'Internal Server Error'));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns empty array when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('skips malformed log lines and parses valid ones', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        [nanoTs(ts), 'NOT VALID JSON'],
        pageViewEntry(ts - 1000, { path: '/valid' }),
        [nanoTs(ts - 2000), '{broken'],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views).toHaveLength(1);
      expect(views[0].path).toBe('/valid');
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('defaults path to "/" when parsed log has no path', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        [nanoTs(ts), JSON.stringify({ session_id: 's1' })],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views[0].path).toBe('/');
    });

    it('handles null data.result gracefully', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: {} }));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views).toEqual([]);
    });

    it('handles completely missing data property', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({}));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views).toEqual([]);
    });

    it('passes timeRange and limit to the query path', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      await svc.getPageViews('7d', 500);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledPath = mockFetch.mock.calls[0][0] as string;
      expect(calledPath).toContain('limit=500');
    });

    it('logs info on successful fetch', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      await svc.getPageViews();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ timeRange: '24h', limit: 1000 }),
        'Fetching page views from Loki'
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ count: 0 }),
        'Fetched page views from Loki'
      );
    });

    it('handles multiple streams in the result', async () => {
      const ts = Date.now();
      const body = {
        data: {
          result: [
            { values: [pageViewEntry(ts, { path: '/a', session_id: 's1' })] },
            { values: [pageViewEntry(ts - 1000, { path: '/b', session_id: 's2' })] },
          ],
        },
      };
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views).toHaveLength(2);
    });

    it('converts Loki nanosecond timestamps to ISO strings', async () => {
      const ms = 1700000000000;
      const body = makeLokiResponse([pageViewEntry(ms)]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views[0].timestamp).toBe(new Date(ms).toISOString());
    });

    it('uses default timeRange of 24h and limit of 1000', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      await svc.getPageViews();
      const calledPath = mockFetch.mock.calls[0][0] as string;
      expect(calledPath).toContain('limit=1000');
    });
  });

  
  
  

  describe('getTopPages', () => {
    it('aggregates page view counts correctly', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { path: '/about' }),
        pageViewEntry(ts - 1000, { path: '/' }),
        pageViewEntry(ts - 2000, { path: '/about' }),
        pageViewEntry(ts - 3000, { path: '/about' }),
        pageViewEntry(ts - 4000, { path: '/' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const top = await svc.getTopPages('1h', 10);
      expect(top[0]).toEqual({ path: '/about', views: 3 });
      expect(top[1]).toEqual({ path: '/', views: 2 });
    });

    it('respects the limit parameter', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { path: '/a' }),
        pageViewEntry(ts - 1000, { path: '/b' }),
        pageViewEntry(ts - 2000, { path: '/c' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const top = await svc.getTopPages('1h', 2);
      expect(top).toHaveLength(2);
    });

    it('returns empty array for no page views', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      const top = await svc.getTopPages();
      expect(top).toEqual([]);
    });

    it('sorts pages by views descending', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { path: '/less' }),
        pageViewEntry(ts - 1000, { path: '/more' }),
        pageViewEntry(ts - 2000, { path: '/more' }),
        pageViewEntry(ts - 3000, { path: '/more' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const top = await svc.getTopPages();
      expect(top[0].path).toBe('/more');
      expect(top[0].views).toBe(3);
    });

    it('returns empty array when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      const top = await svc.getTopPages();
      expect(top).toEqual([]);
    });
  });

  
  
  

  describe('getUniqueVisitors', () => {
    it('counts unique sessionIds', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1' }),
        pageViewEntry(ts - 1000, { session_id: 's2' }),
        pageViewEntry(ts - 2000, { session_id: 's1' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const count = await svc.getUniqueVisitors();
      expect(count).toBe(2);
    });

    it('falls back to clientIp when sessionId is missing', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        [nanoTs(ts), JSON.stringify({ path: '/', client_ip: '10.0.0.1' })],
        [nanoTs(ts - 1000), JSON.stringify({ path: '/', client_ip: '10.0.0.2' })],
        [nanoTs(ts - 2000), JSON.stringify({ path: '/', client_ip: '10.0.0.1' })],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const count = await svc.getUniqueVisitors();
      expect(count).toBe(2);
    });

    it('excludes "unknown" visitors (no sessionId, no clientIp)', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        [nanoTs(ts), JSON.stringify({ path: '/' })],
        [nanoTs(ts - 1000), JSON.stringify({ path: '/about' })],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const count = await svc.getUniqueVisitors();
      expect(count).toBe(0);
    });

    it('returns 0 for empty results', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      const count = await svc.getUniqueVisitors();
      expect(count).toBe(0);
    });

    it('returns 0 when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      const count = await svc.getUniqueVisitors();
      expect(count).toBe(0);
    });

    it('combines sessionId and clientIp visitors without double-counting', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', client_ip: '10.0.0.1' }),
        pageViewEntry(ts - 1000, { session_id: 's1', client_ip: '10.0.0.2' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      
      const count = await svc.getUniqueVisitors();
      expect(count).toBe(1);
    });
  });

  
  
  

  describe('getActiveUsers', () => {
    it('counts unique sessions from 5m window', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 'active-1' }),
        pageViewEntry(ts - 1000, { session_id: 'active-2' }),
        pageViewEntry(ts - 2000, { session_id: 'active-1' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const count = await svc.getActiveUsers();
      expect(count).toBe(2);
    });

    it('calls getPageViews with 5m timeRange', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      await svc.getActiveUsers();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ timeRange: '5m' }),
        'Fetching page views from Loki'
      );
    });

    it('returns 0 for empty results', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      const count = await svc.getActiveUsers();
      expect(count).toBe(0);
    });

    it('returns 0 when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      const count = await svc.getActiveUsers();
      expect(count).toBe(0);
    });

    it('ignores page views without sessionId', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        [nanoTs(ts), JSON.stringify({ path: '/', client_ip: '10.0.0.1' })],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const count = await svc.getActiveUsers();
      expect(count).toBe(0);
    });
  });

  
  
  

  describe('getAverageSessionDuration', () => {
    it('calculates average duration for multi-page sessions', async () => {
      const ts = Date.now();
      
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1' }),
        pageViewEntry(ts - 10_000, { session_id: 's1' }),
        pageViewEntry(ts, { session_id: 's2' }),
        pageViewEntry(ts - 20_000, { session_id: 's2' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const duration = await svc.getAverageSessionDuration();
      
      expect(duration).toBe(15);
    });

    it('returns 0 for single-page sessions (0 duration)', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1' }),
        pageViewEntry(ts - 5000, { session_id: 's2' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const duration = await svc.getAverageSessionDuration();
      
      expect(duration).toBe(0);
    });

    it('returns 0 when there are no sessions', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      const duration = await svc.getAverageSessionDuration();
      expect(duration).toBe(0);
    });

    it('returns 0 when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      const duration = await svc.getAverageSessionDuration();
      expect(duration).toBe(0);
    });

    it('ignores page views without sessionId', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        [nanoTs(ts), JSON.stringify({ path: '/', client_ip: '10.0.0.1' })],
        [nanoTs(ts - 5000), JSON.stringify({ path: '/about', client_ip: '10.0.0.1' })],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const duration = await svc.getAverageSessionDuration();
      expect(duration).toBe(0);
    });

    it('correctly tracks min/max timestamps across multiple page views', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1' }),
        pageViewEntry(ts - 30_000, { session_id: 's1' }),
        pageViewEntry(ts - 15_000, { session_id: 's1' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const duration = await svc.getAverageSessionDuration();
      
      expect(duration).toBe(30);
    });

    it('rounds the result to whole seconds', async () => {
      const ts = Date.now();
      
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1' }),
        pageViewEntry(ts - 11_000, { session_id: 's1' }),
        pageViewEntry(ts, { session_id: 's2' }),
        pageViewEntry(ts - 21_000, { session_id: 's2' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const duration = await svc.getAverageSessionDuration();
      expect(duration).toBe(16);
    });
  });

  
  
  

  describe('getBounceRate', () => {
    it('returns 100% when all sessions are single-page (all bounce)', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1' }),
        pageViewEntry(ts - 1000, { session_id: 's2' }),
        pageViewEntry(ts - 2000, { session_id: 's3' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const rate = await svc.getBounceRate();
      expect(rate).toBe(100);
    });

    it('returns 0% when no sessions are single-page (no bounce)', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', path: '/' }),
        pageViewEntry(ts - 1000, { session_id: 's1', path: '/about' }),
        pageViewEntry(ts - 2000, { session_id: 's2', path: '/' }),
        pageViewEntry(ts - 3000, { session_id: 's2', path: '/contact' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const rate = await svc.getBounceRate();
      expect(rate).toBe(0);
    });

    it('returns correct mixed bounce rate', async () => {
      const ts = Date.now();
      
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', path: '/' }),
        pageViewEntry(ts - 1000, { session_id: 's1', path: '/about' }),
        pageViewEntry(ts - 2000, { session_id: 's2', path: '/' }),
        pageViewEntry(ts - 3000, { session_id: 's3', path: '/about' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const rate = await svc.getBounceRate();
      
      expect(rate).toBe(67);
    });

    it('returns 0% when there are no sessions', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      const rate = await svc.getBounceRate();
      expect(rate).toBe(0);
    });

    it('returns 0 when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      const rate = await svc.getBounceRate();
      expect(rate).toBe(0);
    });

    it('ignores page views without sessionId', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        [nanoTs(ts), JSON.stringify({ path: '/', client_ip: '10.0.0.1' })],
        [nanoTs(ts - 1000), JSON.stringify({ path: '/about', client_ip: '10.0.0.1' })],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const rate = await svc.getBounceRate();
      expect(rate).toBe(0);
    });

    it('rounds the percentage to nearest integer', async () => {
      const ts = Date.now();
      
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1' }),
        pageViewEntry(ts - 1000, { session_id: 's2' }),
        pageViewEntry(ts - 2000, { session_id: 's3', path: '/' }),
        pageViewEntry(ts - 3000, { session_id: 's3', path: '/about' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const rate = await svc.getBounceRate();
      expect(rate).toBe(67);
    });
  });

  
  
  

  describe('getTrafficSources', () => {
    it('categorizes Google referrer', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://www.google.com/search?q=test' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'Google', visits: 1 });
    });

    it('categorizes Bing referrer', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://www.bing.com/search' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'Bing', visits: 1 });
    });

    it('categorizes DuckDuckGo referrer', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://duckduckgo.com/?q=test' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'DuckDuckGo', visits: 1 });
    });

    it('categorizes Twitter referrer (twitter.com)', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://twitter.com/user/status/123' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'Twitter', visits: 1 });
    });

    it('categorizes Twitter referrer (t.co)', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://t.co/abc123' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'Twitter', visits: 1 });
    });

    it('categorizes Facebook referrer', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://www.facebook.com/share' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'Facebook', visits: 1 });
    });

    it('categorizes Reddit referrer', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://www.reddit.com/r/test' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'Reddit', visits: 1 });
    });

    it('categorizes GitHub referrer', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://github.com/user/repo' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'GitHub', visits: 1 });
    });

    it('uses hostname for unrecognized referrers', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://example.com/page' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'example.com', visits: 1 });
    });

    it('labels direct traffic for no referrer', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: '' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'Direct', visits: 1 });
    });

    it('treats invalid URL referrer as Direct', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'not-a-url' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toContainEqual({ source: 'Direct', visits: 1 });
    });

    it('counts unique sessions per source', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://google.com' }),
        pageViewEntry(ts - 1000, { session_id: 's1', referrer: 'https://google.com' }),
        pageViewEntry(ts - 2000, { session_id: 's2', referrer: 'https://google.com' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      const google = sources.find((s) => s.source === 'Google');
      expect(google?.visits).toBe(2);
    });

    it('sorts sources by visits descending', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: '' }),
        pageViewEntry(ts - 1000, { session_id: 's2', referrer: 'https://google.com' }),
        pageViewEntry(ts - 2000, { session_id: 's3', referrer: 'https://google.com' }),
        pageViewEntry(ts - 3000, { session_id: 's4', referrer: 'https://google.com' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources[0].source).toBe('Google');
      expect(sources[0].visits).toBe(3);
    });

    it('respects the limit parameter', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://google.com' }),
        pageViewEntry(ts - 1000, { session_id: 's2', referrer: 'https://bing.com' }),
        pageViewEntry(ts - 2000, { session_id: 's3', referrer: 'https://reddit.com' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources('24h', 2);
      expect(sources).toHaveLength(2);
    });

    it('returns empty array when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources).toEqual([]);
    });

    it('handles mixed referrer types in one response', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: 'https://google.com' }),
        pageViewEntry(ts - 1000, { session_id: 's2', referrer: '' }),
        pageViewEntry(ts - 2000, { session_id: 's3', referrer: 'https://reddit.com/r/test' }),
        pageViewEntry(ts - 3000, { session_id: 's4', referrer: 'not-a-url' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      const sourceNames = sources.map((s) => s.source);
      expect(sourceNames).toContain('Google');
      expect(sourceNames).toContain('Direct');
      expect(sourceNames).toContain('Reddit');
    });
  });

  
  
  

  describe('getAnalyticsMetrics', () => {
    it('returns aggregated metrics', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', path: '/' }),
        pageViewEntry(ts - 1000, { session_id: 's1', path: '/about' }),
        pageViewEntry(ts - 2000, { session_id: 's2', path: '/' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const metrics = await svc.getAnalyticsMetrics();
      expect(metrics.totalPageViews).toBe(3);
      expect(metrics.uniqueVisitors).toBe(2);
      expect(metrics.topPages.length).toBeGreaterThan(0);
      expect(typeof metrics.averageSessionDuration).toBe('number');
      expect(typeof metrics.bounceRate).toBe('number');
    });

    it('returns zero-value metrics on complete failure', async () => {
      mockFetch.mockRejectedValue(new Error('total failure'));
      const svc = setupService(mockFetch, logger);

      const metrics = await svc.getAnalyticsMetrics();
      expect(metrics).toEqual({
        totalPageViews: 0,
        uniqueVisitors: 0,
        topPages: [],
        averageSessionDuration: 0,
        bounceRate: 0,
      });
    });

    it('returns correct topPages in aggregated metrics', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', path: '/' }),
        pageViewEntry(ts - 1000, { session_id: 's2', path: '/' }),
        pageViewEntry(ts - 2000, { session_id: 's3', path: '/about' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const metrics = await svc.getAnalyticsMetrics();
      expect(metrics.topPages[0].path).toBe('/');
      expect(metrics.topPages[0].views).toBe(2);
    });

    it('passes timeRange to all sub-queries', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      await svc.getAnalyticsMetrics('7d');
      
      
      const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
      const fetchCalls = calls.filter(
        (c: unknown[]) => c[1] === 'Fetching page views from Loki'
      );
      for (const call of fetchCalls) {
        expect((call[0] as Record<string, unknown>).timeRange).toBe('7d');
      }
    });

    it('handles partial failures gracefully (individual methods catch errors)', async () => {
      
      
      mockFetch.mockResolvedValue(makeErrorResponse(500, 'Internal Server Error'));
      const svc = setupService(mockFetch, logger);

      const metrics = await svc.getAnalyticsMetrics();
      expect(metrics.totalPageViews).toBe(0);
      expect(metrics.uniqueVisitors).toBe(0);
      expect(metrics.topPages).toEqual([]);
      expect(metrics.averageSessionDuration).toBe(0);
      expect(metrics.bounceRate).toBe(0);
    });
  });

  
  
  

  describe('error handling', () => {
    it('logs error when fetch throws an Error object', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      const svc = setupService(mockFetch, logger);

      await svc.getPageViews();
      expect(logger.error).toHaveBeenCalledWith(
        { error: 'Connection refused' },
        'Failed to fetch page views from Loki'
      );
    });

    it('logs "Unknown error" when fetch throws a non-Error', async () => {
      mockFetch.mockRejectedValue('string error');
      const svc = setupService(mockFetch, logger);

      await svc.getPageViews();
      expect(logger.error).toHaveBeenCalledWith(
        { error: 'Unknown error' },
        'Failed to fetch page views from Loki'
      );
    });

    it('logs error when fetch returns non-ok response', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(502, 'Bad Gateway'));
      const svc = setupService(mockFetch, logger);

      await svc.getPageViews();
      expect(logger.error).toHaveBeenCalledWith(
        { error: 'Loki query failed: 502 Bad Gateway' },
        'Failed to fetch page views from Loki'
      );
    });

    it('handles json() throwing an error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('getTopPages logs error on exception', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      await svc.getTopPages();
      
      
      expect(logger.error).toHaveBeenCalled();
    });

    it('getUniqueVisitors logs error on exception', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      await svc.getUniqueVisitors();
      expect(logger.error).toHaveBeenCalled();
    });

    it('getActiveUsers logs error on exception', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      await svc.getActiveUsers();
      expect(logger.error).toHaveBeenCalled();
    });

    it('getAverageSessionDuration logs error on exception', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      await svc.getAverageSessionDuration();
      expect(logger.error).toHaveBeenCalled();
    });

    it('getBounceRate logs error on exception', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      await svc.getBounceRate();
      expect(logger.error).toHaveBeenCalled();
    });

    it('getTrafficSources logs error on exception', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const svc = setupService(mockFetch, logger);

      await svc.getTrafficSources();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  
  
  

  describe('logger integration', () => {
    it('logger.info is called when fetching page views', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      await svc.getPageViews();
      expect(logger.info).toHaveBeenCalledTimes(2);
    });

    it('logger.warn is called for malformed log lines', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([[nanoTs(ts), 'not json']]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      await svc.getPageViews();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ logLine: 'not json' }),
        'Failed to parse log line'
      );
    });

    it('logger.error is called on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('boom'));
      const svc = setupService(mockFetch, logger);

      await svc.getPageViews();
      expect(logger.error).toHaveBeenCalledWith(
        { error: 'boom' },
        'Failed to fetch page views from Loki'
      );
    });

    it('uses console fallback when no logger configured', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));

      configure({
        lokiUrl: 'http://loki:3100',
        prometheusUrl: 'http://prom:9090',
        fetchLoki: mockFetch,
        
      });
      const svc = new AnalyticsDataService();

      await svc.getPageViews();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logger.error called for getAnalyticsMetrics failure', async () => {
      mockFetch.mockRejectedValue(new Error('total failure'));
      const svc = setupService(mockFetch, logger);

      await svc.getAnalyticsMetrics();
      expect(logger.error).toHaveBeenCalled();
    });

    it('logger.warn is called for invalid timeRange in parseTimeRange', async () => {
      parseTimeRange('bad-input', logger);
      expect(logger.warn).toHaveBeenCalledWith(
        { timeRange: 'bad-input' },
        'Invalid time range format, defaulting to 24h'
      );
    });
  });

  
  
  

  describe('additional edge cases', () => {
    it('getPageViews handles very large page view counts', async () => {
      const ts = Date.now();
      const entries: Array<[string, string]> = [];
      for (let i = 0; i < 100; i++) {
        entries.push(pageViewEntry(ts - i * 1000, { session_id: `s${i}`, path: `/page-${i}` }));
      }
      const body = makeLokiResponse(entries);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views).toHaveLength(100);
    });

    it('getTopPages with all same path returns single entry', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { path: '/same' }),
        pageViewEntry(ts - 1000, { path: '/same' }),
        pageViewEntry(ts - 2000, { path: '/same' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const top = await svc.getTopPages();
      expect(top).toHaveLength(1);
      expect(top[0]).toEqual({ path: '/same', views: 3 });
    });

    it('getUniqueVisitors deduplicates mixed sessionId and IP across views', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', client_ip: '10.0.0.1' }),
        [nanoTs(ts - 1000), JSON.stringify({ path: '/', client_ip: '10.0.0.1' })],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      
      const count = await svc.getUniqueVisitors();
      expect(count).toBe(2);
    });

    it('getActiveUsers with multiple page views from same session counts once', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 'only-one' }),
        pageViewEntry(ts - 1000, { session_id: 'only-one' }),
        pageViewEntry(ts - 2000, { session_id: 'only-one' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const count = await svc.getActiveUsers();
      expect(count).toBe(1);
    });

    it('getAverageSessionDuration with mixed sessions (some with, some without sessionId)', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1' }),
        pageViewEntry(ts - 10_000, { session_id: 's1' }),
        [nanoTs(ts - 5000), JSON.stringify({ path: '/anon', client_ip: '10.0.0.1' })],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      
      const duration = await svc.getAverageSessionDuration();
      expect(duration).toBe(10);
    });

    it('getBounceRate with mix of sessions with and without sessionId', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 'multi', path: '/' }),
        pageViewEntry(ts - 1000, { session_id: 'multi', path: '/about' }),
        pageViewEntry(ts - 2000, { session_id: 'single', path: '/' }),
        [nanoTs(ts - 3000), JSON.stringify({ path: '/anon', client_ip: '10.0.0.1' })],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      
      
      const rate = await svc.getBounceRate();
      expect(rate).toBe(50);
    });

    it('getTrafficSources does not count views without sessionId in visit counts', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        [nanoTs(ts), JSON.stringify({ path: '/', referrer: 'https://google.com' })],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      
      expect(sources).toContainEqual({ source: 'Google', visits: 0 });
    });

    it('getPageViews preserves all optional fields from log lines', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        [
          nanoTs(ts),
          JSON.stringify({
            path: '/test',
            session_id: 'sess-abc',
            user_id: 'user-123',
            client_ip: '192.168.1.1',
            referrer: 'https://example.com',
            user_agent: 'TestBot/1.0',
          }),
        ],
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const views = await svc.getPageViews();
      expect(views[0].sessionId).toBe('sess-abc');
      expect(views[0].userId).toBe('user-123');
      expect(views[0].clientIp).toBe('192.168.1.1');
      expect(views[0].referrer).toBe('https://example.com');
      expect(views[0].userAgent).toBe('TestBot/1.0');
    });

    it('getAnalyticsMetrics returns correct bounceRate in aggregation', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', path: '/' }),
        pageViewEntry(ts - 1000, { session_id: 's2', path: '/' }),
        pageViewEntry(ts - 2000, { session_id: 's2', path: '/about' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const metrics = await svc.getAnalyticsMetrics();
      
      expect(metrics.bounceRate).toBe(50);
    });

    it('getAnalyticsMetrics returns correct averageSessionDuration', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', path: '/' }),
        pageViewEntry(ts - 5000, { session_id: 's1', path: '/about' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const metrics = await svc.getAnalyticsMetrics();
      expect(metrics.averageSessionDuration).toBe(5);
    });

    it('parseTimeRange handles 0 value', () => {
      expect(parseTimeRange('0h')).toBe(0);
    });

    it('parseTimeRange handles very large numeric values', () => {
      expect(parseTimeRange('999d')).toBe(999 * 24 * 60 * 60 * 1000);
    });

    it('getTrafficSources merges Direct from no-referrer and invalid-URL referrer', async () => {
      const ts = Date.now();
      const body = makeLokiResponse([
        pageViewEntry(ts, { session_id: 's1', referrer: '' }),
        pageViewEntry(ts - 1000, { session_id: 's2', referrer: 'not-a-valid-url' }),
      ]);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      const direct = sources.find((s) => s.source === 'Direct');
      expect(direct).toBeDefined();
      expect(direct!.visits).toBe(2);
    });

    it('getTopPages default limit is 10', async () => {
      const ts = Date.now();
      const entries: Array<[string, string]> = [];
      for (let i = 0; i < 15; i++) {
        entries.push(pageViewEntry(ts - i * 1000, { path: `/page-${i}`, session_id: `s${i}` }));
      }
      const body = makeLokiResponse(entries);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const top = await svc.getTopPages();
      expect(top.length).toBeLessThanOrEqual(10);
    });

    it('getTrafficSources default limit is 10', async () => {
      const ts = Date.now();
      const entries: Array<[string, string]> = [];
      const domains = [
        'google.com', 'bing.com', 'duckduckgo.com', 'twitter.com',
        'facebook.com', 'reddit.com', 'github.com', 'example1.com',
        'example2.com', 'example3.com', 'example4.com', 'example5.com',
      ];
      for (let i = 0; i < domains.length; i++) {
        entries.push(
          pageViewEntry(ts - i * 1000, {
            session_id: `s${i}`,
            referrer: `https://${domains[i]}/page`,
          })
        );
      }
      
      entries.push(pageViewEntry(ts - 12000, { session_id: 's12', referrer: '' }));
      const body = makeLokiResponse(entries);
      mockFetch.mockResolvedValue(makeOkResponse(body));
      const svc = setupService(mockFetch, logger);

      const sources = await svc.getTrafficSources();
      expect(sources.length).toBeLessThanOrEqual(10);
    });

    it('getPageViews encodes LogQL query in path', async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ data: { result: [] } }));
      const svc = setupService(mockFetch, logger);

      await svc.getPageViews();
      const calledPath = mockFetch.mock.calls[0][0] as string;
      expect(calledPath).toContain('/loki/api/v1/query_range');
      expect(calledPath).toContain('query=');
      expect(calledPath).toContain(encodeURIComponent('component="analytics"'));
    });
  });
});
