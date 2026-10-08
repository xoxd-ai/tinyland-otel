# @tummycrypt/tinyland-otel

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
- `otel-node` binds the HTTP control after instrumentation starts and declares
  the Prometheus exporter semantic-conventions edge.
- No existing export changed or was removed. Peer and runtime stack unchanged.

### Distribution

- Bazel is the only distribution path (RU6): consume the module
  `tummycrypt_tinyland_otel` 0.3.0 from xoxd-ai/bazel-registry via `bazel_dep`.
- The npm publish surface is removed (RU8): no `publishConfig`, no
  `prepublishOnly`, and the Publish workflow is validation-only with no publish
  permissions or secrets. Existing npm versions are not unpublished.

## 0.2.3

- Previous release (see the v0.2.3 GitHub release).
