import { randomBytes } from 'node:crypto';
import { attributeKeys, attributes, BoundedHttpOperation, endpoint, integer, invalid, malformed,
  object, TelemetryTransportError, type BoundedFetch, type SpanScalar } from './bounded-http.js';

export interface ServerSpanTransportOptions {
  /** Full collector URL, normally ending /v1/traces; no credential/query/fragment. */
  endpoint: string;
  fetch: BoundedFetch;
  resource: Readonly<Record<string, string>>;
  attributeKeys: readonly string[];
  timeoutMs?: number;
  maxRequestBytes?: number;
}
export interface ServerSpanInput {
  name: string;
  attributes: Readonly<Record<string, SpanScalar>>;
  occurredAtUnixMs: number;
}
export interface ServerSpanTransport {
  /** Collector acceptance only, not Tempo indexing or durable retention. No retry. */
  emit(span: ServerSpanInput, options?: { signal?: AbortSignal }): Promise<{ status: 'accepted' }>;
}

/**
 * Standalone OTLP/JSON request, not a global tracer/SDK. No ambient resource,
 * parent, baggage, headers, environment, exception recording or queued flush.
 * Consent, signing, endpoint trust and attribute meaning belong to the caller.
 * The injected fetch must be reviewed/non-instrumented: using a globally patched
 * fetch could add OTHER spans externally. This package cannot suppress that.
 * Wire: https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding
 */
export function createServerSpanTransport(options: ServerSpanTransportOptions): ServerSpanTransport {
  const url = endpoint(options.endpoint);
  if (!new URL(url).pathname.endsWith('/v1/traces') || typeof options.fetch !== 'function') invalid();
  const fetcher = options.fetch;
  const keys = attributeKeys(options.attributeKeys);
  const timeout = integer(options.timeoutMs ?? 3000, 1, 10000);
  const requestBytes = integer(options.maxRequestBytes ?? 16384, 256, 65536);
  const resources = attributes(options.resource, new Set(['service.name', 'service.version', 'service.namespace', 'deployment.environment']));
  if (typeof resources['service.name'] !== 'string' || !resources['service.name'] ||
      Object.values(resources).some((value) => typeof value !== 'string')) invalid();
  const resource = Object.entries(resources).map(([key, value]) => ({ key, value: { stringValue: value } }));
  return {
    async emit(input, call = {}) {
      if (typeof input.name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(input.name)) invalid();
      const stamp = integer(input.occurredAtUnixMs, 1, 18446744073709);
      const values = attributes(input.attributes, keys);
      const attrs = Object.entries(values).map(([key, value]) => ({ key, value:
        typeof value === 'string' ? { stringValue: value } : typeof value === 'boolean' ? { boolValue: value } :
          Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value } }));
      const nanos = (BigInt(stamp) * 1000000n).toString();
      const body = JSON.stringify({ resourceSpans: [{ resource: { attributes: resource }, scopeSpans: [{
        scope: { name: 'tinyland-otel.server-span-transport' },
        spans: [{ traceId: randomBytes(16).toString('hex'), spanId: randomBytes(8).toString('hex'),
          name: input.name, kind: 1, startTimeUnixNano: nanos, endTimeUnixNano: nanos, attributes: attrs }],
      }] }] });
      if (Buffer.byteLength(body) > requestBytes) invalid();
      const operation = new BoundedHttpOperation(fetcher, timeout, 8192, call.signal);
      try {
        const result = await operation.json(url, 8192, body);
        if (!object(result)) malformed();
        if (result.partialSuccess !== undefined) {
          if (!object(result.partialSuccess)) malformed();
          const count = result.partialSuccess.rejectedSpans ?? '0';
          if (!((typeof count === 'string' && /^\d{1,20}$/.test(count)) ||
              (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0))) malformed();
          if (BigInt(count) > 0n) throw new TelemetryTransportError('PARTIAL');
          // A zero-rejection warning is valid acceptance; never echo its text.
          if (result.partialSuccess.errorMessage !== undefined && typeof result.partialSuccess.errorMessage !== 'string') malformed();
        }
        // Unknown OTLP fields are ignored for protocol forward compatibility.
        operation.check();
        return { status: 'accepted' };
      } finally { operation.close(); }
    },
  };
}
