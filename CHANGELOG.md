# @tummycrypt/tinyland-otel

## 1.2.0

### Minor Changes

- Merge the retired `tummycrypt_tinyland_metrics` module
  (`@tummycrypt/tinyland-metrics` 0.2.2, the in-memory page view and session
  metrics collector and the SSE event stream manager) into this package as a
  new export (RU2/RU7). The stack is unchanged from 1.1.0 (TypeScript 7.0.2,
  vitest 5.0.3), so this is a minor release.
  - New subpath `./metrics` (`@tummycrypt/tinyland-otel/metrics`) with the same
    API as the old package: `configureMetrics`, `getMetricsConfig`,
    `resetMetricsConfig`, `MetricsCollector`, `createMetricsCollector`,
    `getMetricsCollector`, `resetMetricsCollectorSingleton`,
    `EventStreamManager`, `getEventStreamManager`, and the types
    `MetricsConfig`, `MetricsLogger`, `ResolvedMetricsConfig`, `MetricsData`,
    `PageMetrics`, `RealtimeEvent`, `RequestDurationBuckets`,
    `SerializedPageMetrics`, `SessionMetrics`, `TopPage` and `TrafficSource`.
  - The root re-exports the same names unchanged, since none of them clash
    with the otel exports. The metrics configuration stays separate from
    `configureOtel`.
  - The sources and tests are carried over byte for byte (tests change only
    their import paths). The standalone repo and the tinyland.dev
    `packages/tinyland-metrics` copy had identical sources and tests.
- No existing export was removed or renamed.

### Migration

- Bazel consumers of `tummycrypt_tinyland_metrics`: drop that `bazel_dep` and
  use `bazel_dep(name = "tummycrypt_tinyland_otel", version = "1.2.0")`.
- Change imports from `@tummycrypt/tinyland-metrics` to
  `@tummycrypt/tinyland-otel/metrics` (or the package root). No other source
  change is needed.
- Consumers of 1.0.0 or 1.1.0 need no change.

## 1.1.0

### Minor Changes

- Merge the retired `tummycrypt_tinyland_analytics_data` module
  (`@tummycrypt/tinyland-analytics-data` 0.2.2, the Loki-backed page view and
  session analytics reader) into this package as a new export (RU2/RU7). The
  stack is unchanged from 1.0.0 (TypeScript 7.0.2, vitest 5.0.3), so this is a
  minor release.
  - New subpath `./analytics-data` (`@tummycrypt/tinyland-otel/analytics-data`)
    with the same API as the old package: `configure`, `getConfig`,
    `resetConfig`, `parseTimeRange`, `AnalyticsDataService`,
    `analyticsDataService`, `createAnalyticsDataService`, and the types
    `PageView`, `AnalyticsMetrics`, `AnalyticsDataConfig`, `Logger` and
    `FetchResponse`.
  - Root aliases that do not clash with the otel names: `configureAnalyticsData`,
    `getAnalyticsDataConfig`, `resetAnalyticsDataConfig`,
    `parseAnalyticsTimeRange`, `AnalyticsDataService`, `analyticsDataService`,
    `createAnalyticsDataService`, and the types `AnalyticsPageView`,
    `AnalyticsMetrics`, `AnalyticsDataConfig`, `AnalyticsDataLogger` and
    `AnalyticsFetchResponse`. The analytics configuration stays separate from
    `configureOtel`.
  - The sources and tests are carried over unchanged, with one exception:
    `AnalyticsDataService` no longer copies `lokiUrl` and `prometheusUrl` into
    private fields, because nothing read those fields and this package's
    `noUnusedLocals` setting rejects them. Both settings are still required in
    `AnalyticsDataConfig`, and behavior is unchanged.
- No existing export was removed or renamed.

### Migration

- Bazel consumers of `tummycrypt_tinyland_analytics_data`: drop that
  `bazel_dep` and use `bazel_dep(name = "tummycrypt_tinyland_otel", version = "1.1.0")`.
- Change imports from `@tummycrypt/tinyland-analytics-data` to
  `@tummycrypt/tinyland-otel/analytics-data`. No other source change is needed.
- Consumers of 1.0.0 need no change.

## 1.0.0

### Major Changes

- The toolchain moves to the estate RU1 stack. The source and the public API are
  unchanged from 0.3.0: no export was added, removed or renamed.
  - TypeScript 7.0.2 (the native compiler) is the `typescript` package, pinned
    exact. Bazel builds with it through `aspect_rules_ts` 3.10.1, whose
    `typescript` extension reads the version from `package.json` (`version_from`).
  - vitest and `@vitest/coverage-v8` 5.0.3, pinned exact.
  - Node 22.22.0 is the Bazel toolchain and `engines.node` is `>=22.17.0`.
  - `tsconfig.json` lists `"types": ["node"]`, because TypeScript 6 and 7 no
    longer load every `@types/*` package by default.
- The optional peer ranges now accept the versions consumers actually run:
  `@opentelemetry/sdk-node` `>=0.209.0 <1.0.0`,
  `@opentelemetry/auto-instrumentations-node` `>=0.67.0 <1.0.0`,
  `@pyroscope/nodejs` `>=0.4.0 <1.0.0`, and `@opentelemetry/api` `^1.9.1`.
  The old ranges (`^0.209.0`, `^0.67.0`, `^0.4.0`) excluded the versions that
  tinyland.dev installs (0.221.x, 0.79.x and 0.6.x).
- The `@opentelemetry/exporter-prometheus@0.209.0` package extension is removed.
  The lock now resolves 0.223.0, which declares its semantic-conventions
  dependency itself. `tests/prometheus-dependency-edge.test.ts` still guards
  that edge.
- `package.json` is `"private": true`, and the validation-only `publish.yml`
  workflow is deleted (RU8). Bazel is the only distribution path (RU6).

### Migration

- Bazel consumers: use `bazel_dep(name = "tummycrypt_tinyland_otel", version = "1.0.0")`
  from xoxd-ai/bazel-registry. The module now depends on `aspect_rules_ts`
  3.10.1, so module resolution raises a consumer's `aspect_rules_ts` to at
  least 3.10.1.
- The root module's TypeScript pin still wins. A root that registers
  `npm_typescript` (through `typescript.deps`, or the deprecated `ext.deps`)
  compiles this module's `:pkg` target with its own TypeScript version.
- If a consumer root registers no TypeScript version and also depends on
  another module with a different non-root pin, the build now fails with the
  rules_ts error "Multiple non-root modules specify different versions". To
  fix it, pin TypeScript in the root module (the estate target is 7.0.2).
- Consumers on a Node version below 22.17 must upgrade Node.
- No source change is needed: every import that works against 0.3.0 also works
  against 1.0.0.

## 0.3.0

### Minor Changes

- Add a bounded, explicit server span transport and Tempo reader that do not
  depend on ambient auto-instrumentation: `createServerSpanTransport`,
  `createBoundedTempoReader`, `createIsolatedTelemetryFetch`,
  `TelemetryTransportError`, and the types `BoundedFetch`, `SpanScalar`,
  `TelemetryTransportCode`, `ServerSpanTransport`, `ServerSpanTransportOptions`,
  `ServerSpanInput`, `BoundedTempoReader`, `BoundedTempoReaderOptions`, `BoundedTempoQuery`,
  `BoundedTempoSpan` and `BoundedTempoResult`. Ported from the
  `candidate/otel-prometheus-edge-20260927` lineage (dcb7a9e9da, ce3bef0d38,
  6ac6eba354, 5e3e538423, cafa596d83) that the Mothership writer was built from.
- `otel-node` loads the SDK through `createRequire`. In 0.2.3 it called a bare
  `require` inside this ESM package, so in a plain ESM runtime (no bundler
  `require` shim) `initializeServerTracing()` threw, logged a failure and fell
  back to the NoopTracer. From 0.3.0 it starts the
  NodeSDK when `@opentelemetry/sdk-node` is installed, and it excludes isolated
  telemetry requests from the HTTP and undici auto-instrumentation. Consumers
  that called it without exporting traces will now export them.
- The Prometheus exporter to semantic-conventions dependency edge is declared in
  `pnpm-workspace.yaml`.
- No existing export changed or was removed. Peer and runtime stack unchanged.

### Distribution

- Bazel is the only distribution path (RU6): consume the module
  `tummycrypt_tinyland_otel` 0.3.0 from xoxd-ai/bazel-registry via `bazel_dep`.
- The npm publish surface is removed (RU8): no `publishConfig`, no
  `prepublishOnly`, and the Publish workflow is validation-only with no publish
  permissions or secrets. Existing npm versions are not unpublished.

## 0.2.3

- Previous release (see the v0.2.3 GitHub release).
