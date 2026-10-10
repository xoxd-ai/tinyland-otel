



































export { configureOtel, getOtelConfig, getLogger, resetOtelConfig } from './config.js';


export type {
	OtelConfig,
	OtelLogger,
	FileLogLevel,
	LogContext,
	BaseLogEntry,
	TempoSearchQuery,
	TempoSearchResponse,
	OTLPTraceResponse,
	GrafanaConfig,
	LokiConfig,
	PrometheusConfig,
	TempoEndpointConfig,
	ObservabilityStackConfig,
	ObservabilityHealth,
	TempoFingerprintRecord,
	GeoLocation,
	TempoTrace,
	TempoSpan,
	SpanAttribute,
} from './types.js';


export {
	initializeServerTracing,
	shutdownServerTracing,
	getNodeSDK,
	isTracingInitialized,
	getTracer,
	stopPyroscope,
} from './otel-node.js';


export {
	DEFAULT_TRACER_SCOPE,
	DEFAULT_TRACER_VERSION,
	getTracerScope,
	getTracerVersion,
	getServerTracer,
	getGlobalTracer,
} from './tracers.js';


export {
	getTracer as getInstrumentationTracer,
	initializeTracing,
	createSpan,
	createSyncSpan,
	getActiveSpan,
	withContext,
	trace,
	context,
	SpanStatusCode,
	SpanKind,
} from './instrumentation.js';
export type { Span, Tracer } from './instrumentation.js';


export type { RedMetricsConfig, SloThresholds } from './span-metrics.js';
export {
	DEFAULT_SLO,
	buildRateQuery,
	buildErrorRateQuery,
	buildLatencyQuery,
	buildAvgLatencyQuery,
	buildAvailabilityQuery,
	buildErrorBudgetQuery,
	buildErrorRateAlert,
	buildLatencyAlert,
	buildRedMetricsQueries,
	buildSloAlerts,
	formatPercentile,
	formatErrorRate,
	formatLatency,
	violatesSlo,
} from './span-metrics.js';


export type {
	TraceQLOperator,
	RiskTier,
	A11ySeverity,
	TRPCType,
	DeviceType as TraceQLDeviceType,
	GeoIPMethod,
	VPNConfidence,
	FingerprintEventType,
} from './traceql.js';
export { TraceQL } from './traceql.js';


export type { TemplateVariable, TraceQLTemplate } from './traceql-templates.js';
export {
	TRACEQL_TEMPLATES,
	TEMPLATE_CATEGORIES,
	renderTemplate,
	getTemplatesByCategory,
	getTemplateById,
	getTemplateCatalog,
	validateTemplateVariables,
} from './traceql-templates.js';

export type {
	TraceQLSpan,
	TraceQLSpanSet,
	TraceQLTrace,
	TraceQLResult,
	BatchQueryItemResult,
	BatchQueryResult,
} from './traceql-query.js';
export {
	queryTraceQL,
	queryTracesByFingerprint,
	queryTracesBySession,
	queryTracesByStatusCode,
	queryTraceQLBatch,
} from './traceql-query.js';


export {
	writeLog,
	fileLogger,
	logPageView,
	logA11yViolation,
	logMetrics,
	logThemeState,
	logHeartbeat,
	logDiscordAccess,
} from './fileLogger.js';


export {
	buildObservabilityConfig,
	getObservabilityConfig,
	checkObservabilityHealth,
} from './observability-config.js';


export type { TempoQueryServiceOptions } from './services/tempo-query.js';
export { TempoQueryService, createTempoQueryService } from './services/tempo-query.js';

// Additive, explicit server transport. No SDK initialization or ambient config.
export { TelemetryTransportError } from './services/bounded-http.js';
export type { BoundedFetch, TelemetryTransportCode, SpanScalar } from './services/bounded-http.js';
export { createIsolatedTelemetryFetch } from './services/isolated-telemetry-fetch.js';
export { createServerSpanTransport } from './services/server-span-transport.js';
export type { ServerSpanTransport, ServerSpanTransportOptions, ServerSpanInput } from './services/server-span-transport.js';
export { createBoundedTempoReader } from './services/bounded-tempo-query.js';
export type { BoundedTempoReader, BoundedTempoReaderOptions, BoundedTempoQuery,
  BoundedTempoSpan, BoundedTempoResult } from './services/bounded-tempo-query.js';

export type { REDMetrics, TempoREDMetricsServiceOptions } from './services/tempo-red-metrics.js';
export {
	TempoREDMetricsService,
	createTempoREDMetricsService,
} from './services/tempo-red-metrics.js';

export type {
	QueryExecution,
	QueryMetrics,
	SlowQuery,
	PerformanceSummary,
	QueryPerformanceServiceOptions,
} from './services/query-performance.js';
export {
	QueryPerformanceService,
	createQueryPerformanceService,
} from './services/query-performance.js';


export type { SavedQuery, SavedQueriesOptions } from './persistence/saved-queries.js';
export {
	loadSavedQueries,
	saveQuery,
	deleteQuery,
	trackQueryUsage,
	getQueriesByCategory,
	getQueriesByUser,
	updateQuery,
} from './persistence/saved-queries.js';


// Loki-backed analytics data reader, merged from the retired
// tummycrypt_tinyland_analytics_data module. The full, unchanged API lives at
// the "./analytics-data" subpath (@tummycrypt/tinyland-otel/analytics-data).
// These root aliases avoid clashing with the otel configure/Logger names.
export {
	configure as configureAnalyticsData,
	getConfig as getAnalyticsDataConfig,
	resetConfig as resetAnalyticsDataConfig,
	parseTimeRange as parseAnalyticsTimeRange,
	AnalyticsDataService,
	analyticsDataService,
	createAnalyticsDataService,
} from './analytics-data/index.js';
export type {
	PageView as AnalyticsPageView,
	AnalyticsMetrics,
	AnalyticsDataConfig,
	Logger as AnalyticsDataLogger,
	FetchResponse as AnalyticsFetchResponse,
} from './analytics-data/index.js';


// In-memory site metrics collector and SSE event stream manager, merged from
// the retired tummycrypt_tinyland_metrics module. The full, unchanged API also
// lives at the "./metrics" subpath (@tummycrypt/tinyland-otel/metrics). None of
// these names clash with the otel exports, so the root keeps the original names.
export {
	configureMetrics,
	getMetricsConfig,
	resetMetricsConfig,
	MetricsCollector,
	createMetricsCollector,
	getMetricsCollector,
	resetMetricsCollectorSingleton,
	EventStreamManager,
	getEventStreamManager,
} from './metrics/index.js';
export type {
	MetricsConfig,
	MetricsLogger,
	ResolvedMetricsConfig,
	MetricsData,
	PageMetrics,
	RealtimeEvent,
	RequestDurationBuckets,
	SerializedPageMetrics,
	SessionMetrics,
	TopPage,
	TrafficSource,
} from './metrics/index.js';


// Process, session, auth, accessibility and client gauge collectors, merged
// from the retired tummycrypt_tinyland_metrics_collectors module. The full,
// unchanged API also lives at the "./metrics-collectors" subpath
// (@tummycrypt/tinyland-otel/metrics-collectors). None of these names clash with
// the otel or metrics exports, so the root keeps the original names.
export {
	configureMetricsCollectors,
	getMetricsCollectorsConfig,
	resetMetricsCollectorsConfig,
	collectProcessMetrics,
	collectSessionMetrics,
	collectAccessibilityMetrics,
	collectAuthMetrics,
	collectClientMetrics,
	collectAllMetrics,
} from './metrics-collectors/index.js';
export type {
	MetricsWriter,
	AccessibilityMetricsData,
	MetricsCollectorsConfig,
} from './metrics-collectors/index.js';


// Prometheus-compatible text-format registry (counters, gauges, histograms),
// merged from the retired tummycrypt_tinyland_prometheus module. The full,
// unchanged API also lives at the "./prometheus" subpath
// (@tummycrypt/tinyland-otel/prometheus). None of these names clash with the
// otel, analytics-data, metrics or metrics-collectors exports, so the root keeps
// the original names. The root and the subpath share one metricsRegistry
// singleton.
export {
	MetricsRegistry,
	metricsRegistry,
	incrementCounter,
	setGauge,
	observeHistogram,
	exportMetrics,
} from './prometheus/index.js';
export type {
	Metric,
	HistogramBucket,
	HistogramMetric,
} from './prometheus/index.js';
