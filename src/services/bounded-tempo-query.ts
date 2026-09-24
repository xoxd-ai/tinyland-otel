import { attributeKeys, attributes, BoundedHttpOperation, endpoint, integer, invalid, malformed,
  object, scalar, TelemetryTransportError, type BoundedFetch, type SpanScalar } from './bounded-http.js';

export interface BoundedTempoReaderOptions {
  /** Server-configured Tempo base URL. Never a browser-selected destination. */
  endpoint: string;
  fetch: BoundedFetch;
  attributeKeys: readonly string[];
  timeoutMs?: number;
  /** Aggregate decoded response bytes across search and all fetched traces. */
  maxResponseBytes?: number;
}
export interface BoundedTempoQuery {
  name: string;
  equals: Readonly<Record<string, SpanScalar>>;
  startUnixSeconds: number;
  endUnixSeconds: number;
  limit?: number;
}
export interface BoundedTempoSpan {
  traceId: string;
  spanId: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Record<string, SpanScalar>;
}
export interface BoundedTempoResult {
  spans: BoundedTempoSpan[];
  /** Search/result cap reached; never interpret this as a complete history. */
  truncated: boolean;
}
export interface BoundedTempoReader {
  query(query: BoundedTempoQuery, options?: { signal?: AbortSignal }): Promise<BoundedTempoResult>;
}

function id(value: unknown, bytes: number, allowBase64 = false): string {
  if (typeof value !== 'string') malformed();
  if (new RegExp(`^[a-fA-F0-9]{${bytes * 2}}$`).test(value) && !/^0+$/.test(value)) return value.toLowerCase();
  // Tempo's generic protobuf JSON encoder can use canonical base64 bytes;
  // OTLP JSON uses hex. Require an exact-length canonical decoding, not a guess.
  if (allowBase64 && /^[a-zA-Z0-9+/]+={0,2}$/.test(value) && value.length <= 24) {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.length === bytes && decoded.toString('base64') === value && decoded.some((byte) => byte !== 0)) {
      return decoded.toString('hex');
    }
  }
  return malformed();
}
function nanos(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,19}$/.test(value) || BigInt(value) > 18446744073709551615n) malformed();
  return value;
}
function readScalar(value: unknown): SpanScalar {
  if (!object(value) || Object.keys(value).length !== 1) malformed();
  let result: unknown;
  if (Object.hasOwn(value, 'stringValue')) result = typeof value.stringValue === 'string' ? value.stringValue : null;
  else if (Object.hasOwn(value, 'boolValue')) result = typeof value.boolValue === 'boolean' ? value.boolValue : null;
  else if (Object.hasOwn(value, 'doubleValue')) result = typeof value.doubleValue === 'number' ? value.doubleValue : null;
  else if (Object.hasOwn(value, 'intValue')) {
    const raw = value.intValue;
    if (!((typeof raw === 'string' && /^-?(0|[1-9][0-9]{0,18})$/.test(raw)) || typeof raw === 'number')) malformed();
    const number = Number(raw);
    if (!Number.isSafeInteger(number)) malformed();
    result = number;
  } else return malformed();
  if (!scalar(result)) malformed();
  return result;
}
function readAttributes(value: unknown, keys: ReadonlySet<string>): Record<string, SpanScalar> {
  if (!Array.isArray(value) || value.length > 256) malformed();
  const result: Record<string, SpanScalar> = Object.create(null);
  const seen = new Set<string>();
  for (const entry of value) {
    if (!object(entry) || typeof entry.key !== 'string' || seen.has(entry.key)) malformed();
    seen.add(entry.key);
    if (keys.has(entry.key)) result[entry.key] = readScalar(entry.value);
  }
  return result;
}
function completeTrace(value: unknown, expectedId: string, name: string, equals: Record<string, SpanScalar>,
  keys: ReadonlySet<string>, start: number, end: number): BoundedTempoSpan[] {
  if (!object(value)) malformed();
  if (value.status === 'PARTIAL' || value.status === 1) throw new TelemetryTransportError('PARTIAL');
  if (value.status !== undefined && value.status !== 'COMPLETE' && value.status !== 0) malformed();
  if (!object(value.trace)) malformed();
  const trace = value.trace;
  if (trace.batches !== undefined && trace.resourceSpans !== undefined) malformed();
  const batches = trace.resourceSpans ?? trace.batches;
  if (!Array.isArray(batches) || batches.length === 0 || batches.length > 256) malformed();
  const found: BoundedTempoSpan[] = [];
  const seen = new Set<string>();
  let scanned = 0;
  for (const batch of batches) {
    if (!object(batch) || !Array.isArray(batch.scopeSpans) || batch.scopeSpans.length > 256) malformed();
    for (const scope of batch.scopeSpans) {
      if (!object(scope) || !Array.isArray(scope.spans) || scope.spans.length > 4096) malformed();
      for (const span of scope.spans) {
        if (++scanned > 4096 || !object(span)) malformed();
        if (id(span.traceId, 16, true) !== expectedId) malformed();
        const spanId = id(span.spanId, 8, true);
        if (seen.has(spanId)) malformed();
        seen.add(spanId);
        if (typeof span.name !== 'string') malformed();
        if (span.name !== name) continue;
        const attrs = readAttributes(span.attributes ?? [], keys);
        if (!Object.entries(equals).every(([key, expected]) => Object.hasOwn(attrs, key) && attrs[key] === expected)) continue;
        const began = nanos(span.startTimeUnixNano); const ended = nanos(span.endTimeUnixNano);
        if (BigInt(ended) < BigInt(began)) malformed();
        if (BigInt(began) < BigInt(start) * 1000000000n || BigInt(began) > BigInt(end) * 1000000000n) continue;
        found.push({ traceId: expectedId, spanId, name, startTimeUnixNano: began,
          endTimeUnixNano: ended, attributes: attrs });
      }
    }
  }
  if (scanned === 0) malformed();
  return found;
}

/**
 * Search + v2 full traces share ONE deadline and decoded byte budget. No cache,
 * arbitrary TraceQL, automatic fallback, resource projection or backend errors.
 * v2 is required to observe COMPLETE/PARTIAL (available in Tempo 2.7.2).
 * https://grafana.com/docs/tempo/latest/api_docs/#query-v2
 * https://github.com/grafana/tempo/blob/v2.7.2/pkg/tempopb/tempo.proto
 * Returned spans remain UNTRUSTED data: callers must verify app provenance.
 * Injected fetch must be reviewed/non-instrumented; a patched global fetch can
 * otherwise record selectors externally, outside this package's control.
 */
export function createBoundedTempoReader(options: BoundedTempoReaderOptions): BoundedTempoReader {
  const base = endpoint(options.endpoint);
  if (typeof options.fetch !== 'function') invalid();
  const fetcher = options.fetch;
  const keys = attributeKeys(options.attributeKeys);
  const timeout = integer(options.timeoutMs ?? 3000, 1, 10000);
  const responseBytes = integer(options.maxResponseBytes ?? 2097152, 256, 4194304);
  return {
    async query(input, call = {}) {
      if (typeof input.name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(input.name)) invalid();
      const name = input.name;
      const equals = attributes(input.equals, keys);
      if (Object.keys(equals).length === 0) invalid();
      const start = integer(input.startUnixSeconds, 1, 4294967295);
      const end = integer(input.endUnixSeconds, start + 1, 4294967295);
      if (end - start > 86400) invalid();
      const limit = integer(input.limit ?? 20, 1, 20);
      // Restrict identifiers and escape scalar values; tag search is substring
      // matching, so it cannot replace these exact TraceQL predicates.
      const query = `{ span:name = ${JSON.stringify(name)} && ${Object.entries(equals)
        .map(([key, value]) => `span.${key} = ${JSON.stringify(value)}`).join(' && ')} }`;
      const params = new URLSearchParams({ q: query, start: String(start), end: String(end), limit: String(limit), spss: '1' });
      const operation = new BoundedHttpOperation(fetcher, timeout, responseBytes, call.signal);
      try {
        const search = await operation.json(`${base}/api/search?${params}`, 262144);
        if (!object(search) || (!Array.isArray(search.traces) && !(search.traces === undefined && object(search.metrics)))) malformed();
        if (search.metrics !== undefined) {
          if (!object(search.metrics)) malformed();
          const total = search.metrics.totalJobs ?? 0; const complete = search.metrics.completedJobs ?? 0;
          if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 ||
              typeof complete !== 'number' || !Number.isSafeInteger(complete) || complete < 0 || complete > total) malformed();
          if (complete < total) throw new TelemetryTransportError('PARTIAL');
        }
        const records = (search.traces ?? []) as unknown[];
        if (records.length > limit) malformed();
        const ids = [...new Set(records.map((record) => { if (!object(record)) malformed(); return id(record.traceID, 16); }))];
        const matches: BoundedTempoSpan[] = [];
        let position = 0;
        const worker = async () => {
          while (position < ids.length) {
            const traceId = ids[position++];
            const result = await operation.json(`${base}/api/v2/traces/${traceId}?start=${start}&end=${end}`, 524288);
            matches.push(...completeTrace(result, traceId, name, equals, keys, start, end));
            operation.check();
          }
        };
        await Promise.all(Array.from({ length: Math.min(2, ids.length) }, worker));
        matches.sort((left, right) => BigInt(left.startTimeUnixNano) > BigInt(right.startTimeUnixNano) ? -1 :
          BigInt(left.startTimeUnixNano) < BigInt(right.startTimeUnixNano) ? 1 : left.spanId.localeCompare(right.spanId));
        operation.check();
        return { spans: matches.slice(0, limit), truncated: records.length === limit || matches.length > limit };
      } finally { operation.close(); }
    },
  };
}
