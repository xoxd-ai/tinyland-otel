import { promises as fs } from 'fs';
import { join } from 'path';
import { getMetricsCollectorsConfig } from './config.js';





export function collectProcessMetrics(): void {
  const { metricsWriter } = getMetricsCollectorsConfig();
  const memUsage = process.memoryUsage();

  metricsWriter.setGauge('nodejs_heap_size_bytes', memUsage.heapTotal);
  metricsWriter.setGauge('nodejs_heap_used_bytes', memUsage.heapUsed);
  metricsWriter.setGauge('nodejs_external_memory_bytes', memUsage.external);
  metricsWriter.setGauge('nodejs_arrayBuffers_bytes', memUsage.arrayBuffers || 0);
  metricsWriter.setGauge('nodejs_rss_bytes', memUsage.rss);

  const proc = process as NodeJS.Process & {
    _getActiveRequests?: () => unknown[];
    _getActiveHandles?: () => unknown[];
  };

  if (proc._getActiveRequests) {
    metricsWriter.setGauge('nodejs_active_requests', proc._getActiveRequests().length);
  }
  if (proc._getActiveHandles) {
    metricsWriter.setGauge('nodejs_active_handles', proc._getActiveHandles().length);
  }

  metricsWriter.setGauge('nodejs_uptime_seconds', process.uptime());
}





export async function collectSessionMetrics(): Promise<void> {
  const { metricsWriter, baseDir } = getMetricsCollectorsConfig();

  try {
    const SESSIONS_FILE = join(baseDir, 'content', 'auth', 'sessions.json');
    const sessionsContent = await fs.readFile(SESSIONS_FILE, 'utf8');
    const sessions = JSON.parse(sessionsContent);
    const now = Date.now();

    const activeSessions = sessions.filter((s: Record<string, unknown>) => {
      if (!s.expiresAt && !s.expires) return false;
      const expiry = new Date(s.expiresAt as string || s.expires as string).getTime();
      return expiry > now;
    });

    metricsWriter.setGauge('session_active', activeSessions.length);
    metricsWriter.setGauge('session_created_total', sessions.length);

    const oneHourAgo = now - (60 * 60 * 1000);
    const recentlyExpired = sessions.filter((s: Record<string, unknown>) => {
      if (!s.expiresAt && !s.expires) return false;
      const expiry = new Date(s.expiresAt as string || s.expires as string).getTime();
      return expiry < now && expiry > oneHourAgo;
    });

    metricsWriter.setGauge('session_expired_total', recentlyExpired.length);

    const durations = activeSessions.map((s: Record<string, unknown>) => {
      const start = new Date(s.createdAt as string).getTime();
      return (Date.now() - start) / 1000;
    });

    const avgDuration = durations.length > 0
      ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
      : 0;

    metricsWriter.setGauge('session_avg_duration_seconds', avgDuration);
  } catch {
    metricsWriter.setGauge('session_active', 0);
    metricsWriter.setGauge('session_created_total', 0);
    metricsWriter.setGauge('session_expired_total', 0);
    metricsWriter.setGauge('session_avg_duration_seconds', 0);
  }
}





export function collectAccessibilityMetrics(): void {
  const { metricsWriter, getAccessibilityMetrics } = getMetricsCollectorsConfig();
  const metrics = getAccessibilityMetrics();

  metricsWriter.setGauge('accessibility_issues_total', metrics.total);
  metricsWriter.setGauge('accessibility_critical_issues_total', metrics.critical);
  metricsWriter.setGauge('accessibility_contrast_failures_total', metrics.byType.contrast);
  metricsWriter.setGauge('accessibility_aria_issues_total', metrics.byType.aria);
  metricsWriter.setGauge('accessibility_keyboard_issues_total', metrics.byType.keyboard);
  metricsWriter.setGauge('accessibility_alt_text_missing_total', metrics.byType.altText);

  Object.entries(metrics.byComponent).forEach(([component, count]) => {
    metricsWriter.setGauge('accessibility_issues_by_component', count, { component });
  });

  Object.entries(metrics.byPage).forEach(([page, count]) => {
    metricsWriter.setGauge('accessibility_issues_by_page', count, { page });
  });

  Object.entries(metrics.byTheme).forEach(([theme, count]) => {
    metricsWriter.setGauge('accessibility_issues_by_theme', count, { theme });
  });
}





export async function collectAuthMetrics(): Promise<void> {
  const { metricsWriter, baseDir } = getMetricsCollectorsConfig();

  try {
    const AUDIT_LOG_PATH = join(baseDir, 'content', 'logs', 'audit.json');
    const auditContent = await fs.readFile(AUDIT_LOG_PATH, 'utf8');
    const auditData = JSON.parse(auditContent);
    const logs = Array.isArray(auditData) ? auditData : auditData.logs || [];

    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentLogs = logs.filter(
      (log: Record<string, unknown>) => new Date(log.timestamp as string).getTime() > twentyFourHoursAgo,
    );

    const loginSuccess = recentLogs.filter(
      (log: Record<string, unknown>) => log.eventType === 'LOGIN_SUCCESS',
    ).length;
    const loginFailure = recentLogs.filter(
      (log: Record<string, unknown>) => log.eventType === 'LOGIN_FAILURE',
    ).length;
    const totpSuccess = recentLogs.filter(
      (log: Record<string, unknown>) => log.eventType === 'TOTP_SUCCESS',
    ).length;
    const totpFailure = recentLogs.filter(
      (log: Record<string, unknown>) => log.eventType === 'TOTP_FAILURE',
    ).length;
    const backupCodeUsed = recentLogs.filter(
      (log: Record<string, unknown>) => log.eventType === 'BACKUP_CODE_USED',
    ).length;

    metricsWriter.setGauge('auth_login_attempts_total', loginSuccess + loginFailure);
    metricsWriter.setGauge('auth_login_success_total', loginSuccess);
    metricsWriter.setGauge('auth_login_failure_total', loginFailure);
    metricsWriter.setGauge('auth_totp_success_total', totpSuccess);
    metricsWriter.setGauge('auth_totp_failure_total', totpFailure);
    metricsWriter.setGauge('auth_backup_code_used_total', backupCodeUsed);

    const loginSuccessRate = (loginSuccess + loginFailure) > 0
      ? (loginSuccess / (loginSuccess + loginFailure)) * 100
      : 100;
    const totpSuccessRate = (totpSuccess + totpFailure) > 0
      ? (totpSuccess / (totpSuccess + totpFailure)) * 100
      : 100;

    metricsWriter.setGauge('auth_login_success_rate', loginSuccessRate);
    metricsWriter.setGauge('auth_totp_success_rate', totpSuccessRate);
  } catch {
    metricsWriter.setGauge('auth_login_attempts_total', 0);
    metricsWriter.setGauge('auth_login_success_total', 0);
    metricsWriter.setGauge('auth_login_failure_total', 0);
    metricsWriter.setGauge('auth_totp_success_total', 0);
    metricsWriter.setGauge('auth_totp_failure_total', 0);
    metricsWriter.setGauge('auth_backup_code_used_total', 0);
    metricsWriter.setGauge('auth_login_success_rate', 100);
    metricsWriter.setGauge('auth_totp_success_rate', 100);
  }
}




export function collectClientMetrics(): void {
  const { metricsWriter } = getMetricsCollectorsConfig();
  metricsWriter.setGauge('client_connected_total', 0);
  metricsWriter.setGauge('client_memory_avg_mb', 0);
  metricsWriter.setGauge('client_webgl_support_ratio', 0);
  metricsWriter.setGauge('client_fcp_avg_ms', 0);
  metricsWriter.setGauge('client_lcp_avg_ms', 0);
}




export async function collectAllMetrics(): Promise<void> {
  collectProcessMetrics();
  await collectSessionMetrics();
  await collectAuthMetrics();
  collectAccessibilityMetrics();
  collectClientMetrics();
}
