import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import {
  configureMetricsCollectors,
  resetMetricsCollectorsConfig,
} from '../src/metrics-collectors/config.js';
import {
  collectProcessMetrics,
  collectSessionMetrics,
  collectAccessibilityMetrics,
  collectAuthMetrics,
  collectClientMetrics,
  collectAllMetrics,
} from '../src/metrics-collectors/collectors.js';
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

function findCall(
  calls: Array<{ name: string; value: number; labels?: Record<string, string> }>,
  name: string,
  labels?: Record<string, string>,
) {
  return calls.find((c) => {
    if (c.name !== name) return false;
    if (labels) {
      return Object.entries(labels).every(([k, v]) => c.labels?.[k] === v);
    }
    return true;
  });
}

function findAllCalls(
  calls: Array<{ name: string; value: number; labels?: Record<string, string> }>,
  name: string,
) {
  return calls.filter((c) => c.name === name);
}

let tempDir: string;

async function setupTempDir() {
  tempDir = await mkdtemp(join(tmpdir(), 'metrics-collectors-test-'));
}

async function cleanupTempDir() {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function writeSessionsFile(sessions: unknown[]) {
  const dir = join(tempDir, 'content', 'auth');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, 'sessions.json'), JSON.stringify(sessions), 'utf8');
}

async function writeAuditFile(data: unknown) {
  const dir = join(tempDir, 'content', 'logs');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, 'audit.json'), JSON.stringify(data), 'utf8');
}

describe('collectProcessMetrics', () => {
  let mock: ReturnType<typeof createMockWriter>;

  beforeEach(() => {
    resetMetricsCollectorsConfig();
    mock = createMockWriter();
    configureMetricsCollectors({ metricsWriter: mock.writer });
  });

  it('should set nodejs_heap_size_bytes gauge', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_heap_size_bytes');
    expect(call).toBeDefined();
    expect(call!.value).toBeGreaterThan(0);
  });

  it('should set nodejs_heap_used_bytes gauge', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_heap_used_bytes');
    expect(call).toBeDefined();
    expect(call!.value).toBeGreaterThan(0);
  });

  it('should set nodejs_external_memory_bytes gauge', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_external_memory_bytes');
    expect(call).toBeDefined();
    expect(typeof call!.value).toBe('number');
  });

  it('should set nodejs_arrayBuffers_bytes gauge', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_arrayBuffers_bytes');
    expect(call).toBeDefined();
    expect(call!.value).toBeGreaterThanOrEqual(0);
  });

  it('should handle arrayBuffers being 0 gracefully', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_arrayBuffers_bytes');
    expect(call).toBeDefined();
    expect(typeof call!.value).toBe('number');
  });

  it('should set nodejs_rss_bytes gauge', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_rss_bytes');
    expect(call).toBeDefined();
    expect(call!.value).toBeGreaterThan(0);
  });

  it('should set nodejs_uptime_seconds gauge', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_uptime_seconds');
    expect(call).toBeDefined();
    expect(call!.value).toBeGreaterThan(0);
  });

  it('should produce all numeric values', () => {
    collectProcessMetrics();
    for (const call of mock.calls) {
      expect(typeof call.value).toBe('number');
    }
  });

  it('should produce all non-negative values', () => {
    collectProcessMetrics();
    for (const call of mock.calls) {
      expect(call.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('should call setGauge on the configured metricsWriter', () => {
    collectProcessMetrics();
    expect(mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it('should set nodejs_active_requests gauge if available', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_active_requests');
    
    if (call) {
      expect(call.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('should set nodejs_active_handles gauge if available', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_active_handles');
    
    if (call) {
      expect(call.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('should not set labels on process metrics', () => {
    collectProcessMetrics();
    for (const call of mock.calls) {
      expect(call.labels).toBeUndefined();
    }
  });

  it('should set at least 6 gauges (memory + uptime)', () => {
    collectProcessMetrics();
    const gaugeNames = new Set(mock.calls.map((c) => c.name));
    expect(gaugeNames.size).toBeGreaterThanOrEqual(6);
  });

  it('should include heap_size_bytes >= heap_used_bytes', () => {
    collectProcessMetrics();
    const heapTotal = findCall(mock.calls, 'nodejs_heap_size_bytes')!.value;
    const heapUsed = findCall(mock.calls, 'nodejs_heap_used_bytes')!.value;
    expect(heapTotal).toBeGreaterThanOrEqual(heapUsed);
  });

  it('should include rss >= heap_used', () => {
    collectProcessMetrics();
    const rss = findCall(mock.calls, 'nodejs_rss_bytes')!.value;
    const heapUsed = findCall(mock.calls, 'nodejs_heap_used_bytes')!.value;
    expect(rss).toBeGreaterThanOrEqual(heapUsed);
  });

  it('should be callable multiple times without error', () => {
    collectProcessMetrics();
    collectProcessMetrics();
    collectProcessMetrics();
    expect(mock.calls.length).toBeGreaterThanOrEqual(18);
  });

  it('should use the latest configured metricsWriter', () => {
    const mock2 = createMockWriter();
    configureMetricsCollectors({ metricsWriter: mock2.writer });
    collectProcessMetrics();
    expect(mock2.calls.length).toBeGreaterThan(0);
    expect(mock.calls.length).toBe(0);
  });

  it('should have uptime > 0', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_uptime_seconds');
    expect(call!.value).toBeGreaterThan(0);
  });

  it('should set external_memory_bytes as a non-negative number', () => {
    collectProcessMetrics();
    const call = findCall(mock.calls, 'nodejs_external_memory_bytes');
    expect(call!.value).toBeGreaterThanOrEqual(0);
  });
});

describe('collectSessionMetrics', () => {
  let mock: ReturnType<typeof createMockWriter>;

  beforeEach(async () => {
    resetMetricsCollectorsConfig();
    mock = createMockWriter();
    await setupTempDir();
    configureMetricsCollectors({ metricsWriter: mock.writer, baseDir: tempDir });
  });

  afterEach(async () => {
    await cleanupTempDir();
  });

  it('should read sessions.json from configured baseDir', async () => {
    await writeSessionsFile([]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_created_total');
    expect(call).toBeDefined();
    expect(call!.value).toBe(0);
  });

  it('should count active (non-expired) sessions', async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    await writeSessionsFile([
      { expiresAt: future, createdAt: new Date().toISOString() },
      { expiresAt: future, createdAt: new Date().toISOString() },
    ]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_active');
    expect(call!.value).toBe(2);
  });

  it('should set session_active gauge', async () => {
    await writeSessionsFile([]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_active');
    expect(call).toBeDefined();
  });

  it('should set session_created_total gauge', async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    const past = new Date(Date.now() - 7200000).toISOString();
    await writeSessionsFile([
      { expiresAt: future, createdAt: new Date().toISOString() },
      { expiresAt: past, createdAt: new Date(Date.now() - 86400000).toISOString() },
    ]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_created_total');
    expect(call!.value).toBe(2);
  });

  it('should calculate recently expired sessions', async () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await writeSessionsFile([
      { expiresAt: thirtyMinAgo, createdAt: new Date(Date.now() - 7200000).toISOString() },
    ]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_expired_total');
    expect(call!.value).toBe(1);
  });

  it('should set session_expired_total gauge', async () => {
    await writeSessionsFile([]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_expired_total');
    expect(call).toBeDefined();
  });

  it('should not count sessions expired more than 1 hour ago', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await writeSessionsFile([
      { expiresAt: twoHoursAgo, createdAt: new Date(Date.now() - 86400000).toISOString() },
    ]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_expired_total');
    expect(call!.value).toBe(0);
  });

  it('should calculate average session duration', async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    await writeSessionsFile([
      { expiresAt: future, createdAt: oneHourAgo },
    ]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_avg_duration_seconds');
    expect(call!.value).toBeGreaterThan(3500);
    expect(call!.value).toBeLessThan(3700);
  });

  it('should set session_avg_duration_seconds gauge', async () => {
    await writeSessionsFile([]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_avg_duration_seconds');
    expect(call).toBeDefined();
  });

  it('should set avg duration to 0 when no active sessions', async () => {
    await writeSessionsFile([]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_avg_duration_seconds');
    expect(call!.value).toBe(0);
  });

  it('should set all to 0 when file does not exist', async () => {
    
    await collectSessionMetrics();
    expect(findCall(mock.calls, 'session_active')!.value).toBe(0);
    expect(findCall(mock.calls, 'session_created_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'session_expired_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'session_avg_duration_seconds')!.value).toBe(0);
  });

  it('should set all to 0 on parse error', async () => {
    const dir = join(tempDir, 'content', 'auth');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'sessions.json'), 'not-valid-json', 'utf8');
    await collectSessionMetrics();
    expect(findCall(mock.calls, 'session_active')!.value).toBe(0);
    expect(findCall(mock.calls, 'session_created_total')!.value).toBe(0);
  });

  it('should handle "expiresAt" field', async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    await writeSessionsFile([
      { expiresAt: future, createdAt: new Date().toISOString() },
    ]);
    await collectSessionMetrics();
    expect(findCall(mock.calls, 'session_active')!.value).toBe(1);
  });

  it('should handle "expires" field', async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    await writeSessionsFile([
      { expires: future, createdAt: new Date().toISOString() },
    ]);
    await collectSessionMetrics();
    expect(findCall(mock.calls, 'session_active')!.value).toBe(1);
  });

  it('should skip sessions with neither expiresAt nor expires', async () => {
    await writeSessionsFile([
      { createdAt: new Date().toISOString() },
    ]);
    await collectSessionMetrics();
    expect(findCall(mock.calls, 'session_active')!.value).toBe(0);
    expect(findCall(mock.calls, 'session_created_total')!.value).toBe(1);
  });

  it('should handle mixed session formats', async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    await writeSessionsFile([
      { expiresAt: future, createdAt: new Date().toISOString() },
      { expires: future, createdAt: new Date().toISOString() },
      { createdAt: new Date().toISOString() },
    ]);
    await collectSessionMetrics();
    expect(findCall(mock.calls, 'session_active')!.value).toBe(2);
    expect(findCall(mock.calls, 'session_created_total')!.value).toBe(3);
  });

  it('should handle empty sessions array', async () => {
    await writeSessionsFile([]);
    await collectSessionMetrics();
    expect(findCall(mock.calls, 'session_active')!.value).toBe(0);
    expect(findCall(mock.calls, 'session_created_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'session_expired_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'session_avg_duration_seconds')!.value).toBe(0);
  });

  it('should handle a large number of sessions', async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    const sessions = Array.from({ length: 100 }, () => ({
      expiresAt: future,
      createdAt: new Date().toISOString(),
    }));
    await writeSessionsFile(sessions);
    await collectSessionMetrics();
    expect(findCall(mock.calls, 'session_active')!.value).toBe(100);
    expect(findCall(mock.calls, 'session_created_total')!.value).toBe(100);
  });

  it('should compute average duration across multiple sessions', async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    await writeSessionsFile([
      { expiresAt: future, createdAt: twoHoursAgo },
      { expiresAt: future, createdAt: oneHourAgo },
    ]);
    await collectSessionMetrics();
    const call = findCall(mock.calls, 'session_avg_duration_seconds');
    
    expect(call!.value).toBeGreaterThan(5000);
    expect(call!.value).toBeLessThan(5800);
  });
});

describe('collectAccessibilityMetrics', () => {
  let mock: ReturnType<typeof createMockWriter>;

  beforeEach(() => {
    resetMetricsCollectorsConfig();
    mock = createMockWriter();
  });

  it('should use getAccessibilityMetrics from config', () => {
    const customMetrics: AccessibilityMetricsData = {
      total: 42,
      critical: 5,
      byType: { contrast: 10, aria: 12, keyboard: 8, altText: 12 },
      byComponent: {},
      byPage: {},
      byTheme: {},
    };
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => customMetrics,
    });
    collectAccessibilityMetrics();
    expect(findCall(mock.calls, 'accessibility_issues_total')!.value).toBe(42);
  });

  it('should set accessibility_issues_total gauge', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 10, critical: 1,
        byType: { contrast: 2, aria: 3, keyboard: 2, altText: 3 },
        byComponent: {}, byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    expect(findCall(mock.calls, 'accessibility_issues_total')!.value).toBe(10);
  });

  it('should set accessibility_critical_issues_total gauge', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 10, critical: 3,
        byType: { contrast: 2, aria: 3, keyboard: 2, altText: 3 },
        byComponent: {}, byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    expect(findCall(mock.calls, 'accessibility_critical_issues_total')!.value).toBe(3);
  });

  it('should set accessibility_contrast_failures_total gauge', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 5, critical: 1,
        byType: { contrast: 5, aria: 0, keyboard: 0, altText: 0 },
        byComponent: {}, byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    expect(findCall(mock.calls, 'accessibility_contrast_failures_total')!.value).toBe(5);
  });

  it('should set accessibility_aria_issues_total gauge', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 3, critical: 0,
        byType: { contrast: 0, aria: 3, keyboard: 0, altText: 0 },
        byComponent: {}, byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    expect(findCall(mock.calls, 'accessibility_aria_issues_total')!.value).toBe(3);
  });

  it('should set accessibility_keyboard_issues_total gauge', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 7, critical: 2,
        byType: { contrast: 0, aria: 0, keyboard: 7, altText: 0 },
        byComponent: {}, byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    expect(findCall(mock.calls, 'accessibility_keyboard_issues_total')!.value).toBe(7);
  });

  it('should set accessibility_alt_text_missing_total gauge', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 4, critical: 0,
        byType: { contrast: 0, aria: 0, keyboard: 0, altText: 4 },
        byComponent: {}, byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    expect(findCall(mock.calls, 'accessibility_alt_text_missing_total')!.value).toBe(4);
  });

  it('should set per-component gauges with labels', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 5, critical: 1,
        byType: { contrast: 1, aria: 1, keyboard: 1, altText: 2 },
        byComponent: { Button: 3, Dialog: 2 },
        byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    const btnCall = findCall(mock.calls, 'accessibility_issues_by_component', { component: 'Button' });
    const dlgCall = findCall(mock.calls, 'accessibility_issues_by_component', { component: 'Dialog' });
    expect(btnCall!.value).toBe(3);
    expect(dlgCall!.value).toBe(2);
  });

  it('should set per-page gauges with labels', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 8, critical: 0,
        byType: { contrast: 2, aria: 2, keyboard: 2, altText: 2 },
        byComponent: {},
        byPage: { '/home': 4, '/about': 4 },
        byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    const homeCall = findCall(mock.calls, 'accessibility_issues_by_page', { page: '/home' });
    const aboutCall = findCall(mock.calls, 'accessibility_issues_by_page', { page: '/about' });
    expect(homeCall!.value).toBe(4);
    expect(aboutCall!.value).toBe(4);
  });

  it('should set per-theme gauges with labels', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 6, critical: 1,
        byType: { contrast: 3, aria: 1, keyboard: 1, altText: 1 },
        byComponent: {},
        byPage: {},
        byTheme: { dark: 4, light: 2 },
      }),
    });
    collectAccessibilityMetrics();
    const darkCall = findCall(mock.calls, 'accessibility_issues_by_theme', { theme: 'dark' });
    const lightCall = findCall(mock.calls, 'accessibility_issues_by_theme', { theme: 'light' });
    expect(darkCall!.value).toBe(4);
    expect(lightCall!.value).toBe(2);
  });

  it('should handle empty byComponent', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 0, critical: 0,
        byType: { contrast: 0, aria: 0, keyboard: 0, altText: 0 },
        byComponent: {},
        byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    const componentCalls = findAllCalls(mock.calls, 'accessibility_issues_by_component');
    expect(componentCalls.length).toBe(0);
  });

  it('should handle empty byPage', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 0, critical: 0,
        byType: { contrast: 0, aria: 0, keyboard: 0, altText: 0 },
        byComponent: {},
        byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    const pageCalls = findAllCalls(mock.calls, 'accessibility_issues_by_page');
    expect(pageCalls.length).toBe(0);
  });

  it('should handle empty byTheme', () => {
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 0, critical: 0,
        byType: { contrast: 0, aria: 0, keyboard: 0, altText: 0 },
        byComponent: {},
        byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    const themeCalls = findAllCalls(mock.calls, 'accessibility_issues_by_theme');
    expect(themeCalls.length).toBe(0);
  });

  it('should handle many components', () => {
    const byComponent: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      byComponent[`Component${i}`] = i;
    }
    configureMetricsCollectors({
      metricsWriter: mock.writer,
      getAccessibilityMetrics: () => ({
        total: 190, critical: 0,
        byType: { contrast: 0, aria: 0, keyboard: 0, altText: 0 },
        byComponent,
        byPage: {}, byTheme: {},
      }),
    });
    collectAccessibilityMetrics();
    const componentCalls = findAllCalls(mock.calls, 'accessibility_issues_by_component');
    expect(componentCalls.length).toBe(20);
  });
});

describe('collectAuthMetrics', () => {
  let mock: ReturnType<typeof createMockWriter>;

  beforeEach(async () => {
    resetMetricsCollectorsConfig();
    mock = createMockWriter();
    await setupTempDir();
    configureMetricsCollectors({ metricsWriter: mock.writer, baseDir: tempDir });
  });

  afterEach(async () => {
    await cleanupTempDir();
  });

  it('should read audit.json from configured baseDir', async () => {
    await writeAuditFile([]);
    await collectAuthMetrics();
    const call = findCall(mock.calls, 'auth_login_attempts_total');
    expect(call).toBeDefined();
  });

  it('should handle array format', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_success_total')!.value).toBe(1);
  });

  it('should handle object with .logs format', async () => {
    const now = new Date().toISOString();
    await writeAuditFile({
      logs: [{ eventType: 'LOGIN_SUCCESS', timestamp: now }],
    });
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_success_total')!.value).toBe(1);
  });

  it('should handle object with missing .logs gracefully', async () => {
    await writeAuditFile({ other: 'data' });
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_attempts_total')!.value).toBe(0);
  });

  it('should filter to last 24 hours', async () => {
    const now = new Date().toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await writeAuditFile([
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
      { eventType: 'LOGIN_SUCCESS', timestamp: twoDaysAgo },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_success_total')!.value).toBe(1);
  });

  it('should count LOGIN_SUCCESS events', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_success_total')!.value).toBe(3);
  });

  it('should count LOGIN_FAILURE events', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'LOGIN_FAILURE', timestamp: now },
      { eventType: 'LOGIN_FAILURE', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_failure_total')!.value).toBe(2);
  });

  it('should count TOTP_SUCCESS events', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'TOTP_SUCCESS', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_totp_success_total')!.value).toBe(1);
  });

  it('should count TOTP_FAILURE events', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'TOTP_FAILURE', timestamp: now },
      { eventType: 'TOTP_FAILURE', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_totp_failure_total')!.value).toBe(2);
  });

  it('should count BACKUP_CODE_USED events', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'BACKUP_CODE_USED', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_backup_code_used_total')!.value).toBe(1);
  });

  it('should calculate login success rate', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
      { eventType: 'LOGIN_FAILURE', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_success_rate')!.value).toBe(75);
  });

  it('should calculate TOTP success rate', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'TOTP_SUCCESS', timestamp: now },
      { eventType: 'TOTP_FAILURE', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_totp_success_rate')!.value).toBe(50);
  });

  it('should set login_attempts_total to sum of success and failure', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
      { eventType: 'LOGIN_FAILURE', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_attempts_total')!.value).toBe(3);
  });

  it('should set all to 0 when file does not exist', async () => {
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_attempts_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'auth_login_success_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'auth_login_failure_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'auth_totp_success_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'auth_totp_failure_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'auth_backup_code_used_total')!.value).toBe(0);
  });

  it('should set success rates to 100 when no attempts', async () => {
    await writeAuditFile([]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_success_rate')!.value).toBe(100);
    expect(findCall(mock.calls, 'auth_totp_success_rate')!.value).toBe(100);
  });

  it('should set success rates to 100 on file error', async () => {
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_success_rate')!.value).toBe(100);
    expect(findCall(mock.calls, 'auth_totp_success_rate')!.value).toBe(100);
  });

  it('should set all to 0 on parse error', async () => {
    const dir = join(tempDir, 'content', 'logs');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'audit.json'), '{{{bad json', 'utf8');
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_attempts_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'auth_login_success_total')!.value).toBe(0);
  });

  it('should handle login success rate of 100% (all successes)', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
      { eventType: 'LOGIN_SUCCESS', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_success_rate')!.value).toBe(100);
  });

  it('should handle login success rate of 0% (all failures)', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'LOGIN_FAILURE', timestamp: now },
      { eventType: 'LOGIN_FAILURE', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_success_rate')!.value).toBe(0);
  });

  it('should ignore unknown event types', async () => {
    const now = new Date().toISOString();
    await writeAuditFile([
      { eventType: 'UNKNOWN_EVENT', timestamp: now },
      { eventType: 'SOME_OTHER', timestamp: now },
    ]);
    await collectAuthMetrics();
    expect(findCall(mock.calls, 'auth_login_attempts_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'auth_login_success_total')!.value).toBe(0);
    expect(findCall(mock.calls, 'auth_login_failure_total')!.value).toBe(0);
  });

  it('should set 8 gauges total on success', async () => {
    await writeAuditFile([]);
    await collectAuthMetrics();
    expect(mock.calls.length).toBe(8);
  });

  it('should set 8 gauges total on error', async () => {
    await collectAuthMetrics();
    expect(mock.calls.length).toBe(8);
  });
});

describe('collectClientMetrics', () => {
  let mock: ReturnType<typeof createMockWriter>;

  beforeEach(() => {
    resetMetricsCollectorsConfig();
    mock = createMockWriter();
    configureMetricsCollectors({ metricsWriter: mock.writer });
  });

  it('should set client_connected_total to 0', () => {
    collectClientMetrics();
    expect(findCall(mock.calls, 'client_connected_total')!.value).toBe(0);
  });

  it('should set client_memory_avg_mb to 0', () => {
    collectClientMetrics();
    expect(findCall(mock.calls, 'client_memory_avg_mb')!.value).toBe(0);
  });

  it('should set client_webgl_support_ratio to 0', () => {
    collectClientMetrics();
    expect(findCall(mock.calls, 'client_webgl_support_ratio')!.value).toBe(0);
  });

  it('should set client_fcp_avg_ms to 0', () => {
    collectClientMetrics();
    expect(findCall(mock.calls, 'client_fcp_avg_ms')!.value).toBe(0);
  });

  it('should set client_lcp_avg_ms to 0', () => {
    collectClientMetrics();
    expect(findCall(mock.calls, 'client_lcp_avg_ms')!.value).toBe(0);
  });

  it('should set exactly 5 gauges', () => {
    collectClientMetrics();
    expect(mock.calls.length).toBe(5);
  });

  it('should not set any labels on client metrics', () => {
    collectClientMetrics();
    for (const call of mock.calls) {
      expect(call.labels).toBeUndefined();
    }
  });
});

describe('collectAllMetrics', () => {
  let mock: ReturnType<typeof createMockWriter>;

  beforeEach(async () => {
    resetMetricsCollectorsConfig();
    mock = createMockWriter();
    await setupTempDir();
    configureMetricsCollectors({ metricsWriter: mock.writer, baseDir: tempDir });
  });

  afterEach(async () => {
    await cleanupTempDir();
  });

  it('should call all 5 individual collectors', async () => {
    await collectAllMetrics();
    
    expect(findCall(mock.calls, 'nodejs_heap_size_bytes')).toBeDefined();
    
    expect(findCall(mock.calls, 'session_active')).toBeDefined();
    
    expect(findCall(mock.calls, 'auth_login_attempts_total')).toBeDefined();
    
    expect(findCall(mock.calls, 'accessibility_issues_total')).toBeDefined();
    
    expect(findCall(mock.calls, 'client_connected_total')).toBeDefined();
  });

  it('should be an async function that resolves', async () => {
    const result = collectAllMetrics();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it('should produce gauges from all collector categories', async () => {
    await collectAllMetrics();
    const gaugeNames = new Set(mock.calls.map((c) => c.name));
    
    expect(gaugeNames.has('nodejs_heap_size_bytes')).toBe(true);
    expect(gaugeNames.has('session_active')).toBe(true);
    expect(gaugeNames.has('auth_login_attempts_total')).toBe(true);
    expect(gaugeNames.has('accessibility_issues_total')).toBe(true);
    expect(gaugeNames.has('client_connected_total')).toBe(true);
  });

  it('should work even if session and audit files do not exist', async () => {
    await expect(collectAllMetrics()).resolves.toBeUndefined();
    expect(mock.calls.length).toBeGreaterThan(0);
  });

  it('should produce at least 25 gauge calls', async () => {
    
    await collectAllMetrics();
    expect(mock.calls.length).toBeGreaterThanOrEqual(25);
  });
});
