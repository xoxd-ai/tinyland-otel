import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoundedTempoReader, type BoundedTempoQuery } from '../src/services/bounded-tempo-query.js';
import { createServerSpanTransport } from '../src/services/server-span-transport.js';
import type { BoundedFetch } from '../src/services/bounded-http.js';

const TRACE = '11223344556677889900aabbccddeeff';
const SECOND = '21223344556677889900aabbccddeeff';
const SPAN = '1122334455667788';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
const query: BoundedTempoQuery = { name: 'session.observed', equals: { 'evidence.binding': 'opaque' },
  startUnixSeconds: 1780000000, endUnixSeconds: 1780000600 };
const options = (fetcher: BoundedFetch) => ({ endpoint: 'https://tempo.invalid', fetch: fetcher,
  attributeKeys: ['evidence.binding', 'evidence.signature', 'evidence.count'] });
function span(traceId = TRACE, spanId = SPAN) {
  return { traceId, spanId, name: query.name, startTimeUnixNano: '1780000000000000000',
    endTimeUnixNano: '1780000000001000000', attributes: [
      { key: 'evidence.binding', value: { stringValue: 'opaque' } },
      { key: 'evidence.signature', value: { stringValue: 'signed-app-fixture' } },
      { key: 'session.id', value: { stringValue: 'bearer-sentinel' } },
    ] };
}
const trace = (spans = [span()]) => ({ trace: { resourceSpans: [{ resource: {
  attributes: [{ key: 'user.id', value: { stringValue: 'raw-owner-sentinel' } }],
}, scopeSpans: [{ spans }] }] } });
function sequence(responses: Response[]) {
  return vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error('unexpected fetch');
    return response;
  });
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('bounded exact-match Tempo reader (no collector traffic)', () => {
  it('fetches v2 full traces and returns allowlisted matching spans only', async () => {
    const unrelated = { ...span(TRACE, '2222334455667788'), name: 'http.request' };
    const fetcher = sequence([json({ traces: [{ traceID: TRACE }] }), json(trace([span(), unrelated]))]);
    const settings = options(fetcher);
    const reader = createBoundedTempoReader(settings);
    settings.attributeKeys.push('session.id');
    expect(fetcher).not.toHaveBeenCalled();
    const result = await reader.query(query);
    expect(result).toMatchObject({ truncated: false, spans: [{ traceId: TRACE, spanId: SPAN,
      attributes: { 'evidence.binding': 'opaque', 'evidence.signature': 'signed-app-fixture' } }] });
    expect(result.spans).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('sentinel');
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(new URL(calls[0][0]).searchParams.get('q')).toBe('{ span:name = "session.observed" && span.evidence.binding = "opaque" }');
    expect(calls[1][0]).toBe(`https://tempo.invalid/api/v2/traces/${TRACE}?start=1780000000&end=1780000600`);
    expect(calls.every(([, init]) => init.redirect === 'manual' && init.credentials === 'omit')).toBe(true);
  });

  it('supports a complete export-to-Tempo-shaped read fixture without global SDK state', async () => {
    let emitted: Record<string, unknown> | undefined;
    const exporter = createServerSpanTransport({ endpoint: 'https://collector.invalid/v1/traces',
      fetch: async (_url, request) => { emitted = JSON.parse(request.body as string); return json({}); },
      resource: { 'service.name': 'fixture' }, attributeKeys: options(vi.fn()).attributeKeys });
    await exporter.emit({ name: query.name, occurredAtUnixMs: 1780000000100,
      attributes: { 'evidence.binding': 'opaque', 'evidence.signature': 'app-owned-signature', 'evidence.count': 1 } });
    const resourceSpans = emitted!.resourceSpans as Array<{ scopeSpans: Array<{ spans: Array<{ traceId: string }> }> }>;
    const traceId = resourceSpans[0].scopeSpans[0].spans[0].traceId;
    const fetcher = sequence([json({ traces: [{ traceID: traceId }] }), json({ trace: { resourceSpans }, status: 'COMPLETE' })]);
    const result = await createBoundedTempoReader(options(fetcher)).query(query);
    expect(result.spans[0].attributes).toEqual({ 'evidence.binding': 'opaque',
      'evidence.signature': 'app-owned-signature', 'evidence.count': 1 });
    // This verifies wire composition only: cryptographic provenance is app-owned.
  });

  it.each([{ traces: [] }, { metrics: { totalJobs: 0, completedJobs: 0 } }])('distinguishes valid empty protobuf response %j', async (response) => {
    const fetcher = sequence([json(response)]);
    expect(await createBoundedTempoReader(options(fetcher)).query(query)).toEqual({ spans: [], truncated: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([{}, null, { traces: 'wrong' }, { traces: [{ traceID: '../private' }] },
    { traces: [{ traceID: '0'.repeat(32) }] }])('rejects malformed search rather than returning an empty result: %j', async (response) => {
    await expect(createBoundedTempoReader(options(sequence([json(response)]))).query(query)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails partial search jobs and partial v2 traces instead of projecting them', async () => {
    await expect(createBoundedTempoReader(options(sequence([json({ traces: [], metrics: { totalJobs: 2, completedJobs: 1 } })]))).query(query))
      .rejects.toMatchObject({ code: 'PARTIAL' });
    for (const status of ['PARTIAL', 1]) {
      const fetcher = sequence([json({ traces: [{ traceID: TRACE }] }), json({ ...trace(), status, message: 'private-message' })]);
      await expect(createBoundedTempoReader(options(fetcher)).query(query)).rejects.toMatchObject({
        code: 'PARTIAL', message: 'Bounded telemetry operation failed: PARTIAL',
      });
    }
  });

  it('rejects missing/unknown v2 trace envelope, wrong trace identity, and duplicate span identity', async () => {
    const bad = [{ batches: [] }, { trace: {} }, { ...trace(), status: 'MAYBE' }, trace([span(SECOND)]), trace([span(), span()])];
    for (const response of bad) {
      const fetcher = sequence([json({ traces: [{ traceID: TRACE }] }), json(response)]);
      await expect(createBoundedTempoReader(options(fetcher)).query(query)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('normalizes canonical protobuf base64 IDs and legacy batches nested in v2 only', async () => {
    const item = { ...span(), traceId: Buffer.from(TRACE, 'hex').toString('base64'), spanId: Buffer.from(SPAN, 'hex').toString('base64') };
    const fetcher = sequence([json({ traces: [{ traceID: TRACE.toUpperCase() }] }), json({ status: 0,
      trace: { batches: [{ scopeSpans: [{ spans: [item] }] }] } })]);
    expect((await createBoundedTempoReader(options(fetcher)).query(query)).spans[0]).toMatchObject({ traceId: TRACE, spanId: SPAN });
  });

  it('rejects duplicate or mistyped selected attributes and invalid timestamps', async () => {
    const first = span();
    const bad = [
      { ...first, attributes: [...first.attributes, first.attributes[0]] },
      { ...first, attributes: [{ key: 'evidence.binding', value: { stringValue: true } }] },
      { ...first, endTimeUnixNano: '0' },
      { ...first, startTimeUnixNano: '18446744073709551616' },
    ];
    for (const item of bad) {
      const response = { trace: { resourceSpans: [{ scopeSpans: [{ spans: [item] }] }] } };
      await expect(createBoundedTempoReader(options(sequence([json({ traces: [{ traceID: TRACE }] }), json(response)]))).query(query))
        .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('rechecks exact predicates and time window rather than trusting search matches', async () => {
    const wrong = { ...span(), attributes: [{ key: 'evidence.binding', value: { stringValue: 'another-owner' } }] };
    const old = { ...span(TRACE, '2222334455667788'), startTimeUnixNano: '1779999999000000000' };
    const fetcher = sequence([json({ traces: [{ traceID: TRACE }] }), json(trace([wrong, old]))]);
    expect(await createBoundedTempoReader(options(fetcher)).query(query)).toEqual({ spans: [], truncated: false });
  });

  it('labels a search cap as truncated and rejects backend results beyond that cap', async () => {
    const fetcher = sequence([json({ traces: [{ traceID: TRACE }] }), json(trace())]);
    expect((await createBoundedTempoReader(options(fetcher)).query({ ...query, limit: 1 })).truncated).toBe(true);
    const excess = sequence([json({ traces: [{ traceID: TRACE }, { traceID: SECOND }] })]);
    await expect(createBoundedTempoReader(options(excess)).query({ ...query, limit: 1 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(excess).toHaveBeenCalledTimes(1);
  });

  it('escapes selector values and disallows unconfigured keys/raw TraceQL', async () => {
    const fetcher = sequence([json({ traces: [] })]);
    const reader = createBoundedTempoReader(options(fetcher));
    const injected = 'a" } || { true }';
    await reader.query({ ...query, equals: { 'evidence.binding': injected } });
    const calls = fetcher.mock.calls as unknown as Array<[string]>;
    expect(new URL(calls[0][0]).searchParams.get('q')).toBe(`{ span:name = "session.observed" && span.evidence.binding = ${JSON.stringify(injected)} }`);
    await expect(reader.query({ ...query, equals: { 'user.id': 'private' } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(reader.query({ ...query, equals: {} })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(reader.query({ ...query, endUnixSeconds: query.startUnixSeconds + 86401 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('enforces an aggregate response-byte budget over the entire operation', async () => {
    const search = { traces: [{ traceID: TRACE }] };
    // Each response fits individually, but their sum does not.
    const budget = Math.max(Buffer.byteLength(JSON.stringify(search)), Buffer.byteLength(JSON.stringify(trace()))) + 1;
    const fetcher = sequence([json(search), json(trace())]);
    await expect(createBoundedTempoReader({ ...options(fetcher), maxResponseBytes: budget }).query(query))
      .rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });

  it('does not turn missing/full-trace HTTP failures into empty results', async () => {
    const fetcher = sequence([json({ traces: [{ traceID: TRACE }] }), json({ error: 'private backend detail' }, 404)]);
    await expect(createBoundedTempoReader(options(fetcher)).query(query)).rejects.toMatchObject({ code: 'HTTP' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('shares the deadline across search and concurrent fetches, not per request', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async (url: string, _init: RequestInit) => {
      if (url.includes('/api/search?')) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return json({ traces: [{ traceID: TRACE }, { traceID: SECOND }] });
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      return json(trace());
    });
    const result = createBoundedTempoReader({ ...options(fetcher), timeoutMs: 30 }).query(query);
    const assertion = expect(result).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([, init]) => init.signal?.aborted)).toBe(true);
  });

  it('aborts a hanging body reader and never returns partial rows', async () => {
    const controller = new AbortController();
    const canceled = vi.fn();
    const fetcher = vi.fn(async () => {
      return new Response(new ReadableStream({
        pull() { queueMicrotask(() => controller.abort('private abort reason')); }, cancel: canceled,
      }, { highWaterMark: 0 }), { headers: { 'content-type': 'application/json' } });
    });
    await expect(createBoundedTempoReader(options(fetcher)).query(query, { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(canceled).toHaveBeenCalled();
  });
});
