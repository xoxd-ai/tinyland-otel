import { afterEach, describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';
import { createServerSpanTransport } from '../src/services/server-span-transport.js';
import type { BoundedFetch } from '../src/services/bounded-http.js';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
const input = { name: 'session.observed', attributes: { 'evidence.binding': 'opaque', 'evidence.count': 2 },
  occurredAtUnixMs: 1780000000000 };
const options = (fetcher: BoundedFetch) => ({ endpoint: 'https://collector.invalid/v1/traces', fetch: fetcher,
  resource: { 'service.name': 'test-app' }, attributeKeys: ['evidence.binding', 'evidence.count'] });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('explicit server OTLP transport (synthetic fetch only)', () => {
  it('constructs without network and emits one root OTLP JSON span, not ambient identity/context', async () => {
    const fetcher = vi.fn(async () => json({}));
    const settings = options(fetcher);
    const transport = createServerSpanTransport(settings);
    expect(fetcher).not.toHaveBeenCalled();
    settings.resource['service.name'] = 'mutated';
    settings.attributeKeys.push('session.id');
    expect(await transport.emit(input)).toEqual({ status: 'accepted' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://collector.invalid/v1/traces');
    expect(request).toMatchObject({ method: 'POST', redirect: 'manual', credentials: 'omit', cache: 'no-store' });
    expect(request.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
    const wire = JSON.parse(request.body as string);
    expect(wire.resourceSpans[0].resource.attributes).toEqual([{ key: 'service.name', value: { stringValue: 'test-app' } }]);
    const span = wire.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span).toMatchObject({ name: input.name, kind: 1, startTimeUnixNano: '1780000000000000000',
      endTimeUnixNano: '1780000000000000000' });
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(span).not.toHaveProperty('parentSpanId');
    expect(span).not.toHaveProperty('events');
    expect(span.attributes).toContainEqual({ key: 'evidence.count', value: { intValue: '2' } });
    await expect(transport.emit({ ...input, attributes: { 'session.id': 'bearer-sentinel' } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['https://user:secret@collector.invalid/v1/traces', 'https://collector.invalid/v1/traces?token=x',
    'https://collector.invalid/v1/traces#secret', 'file:///v1/traces', 'https://collector.invalid/wrong'])('rejects unsafe endpoint %s', (endpoint) => {
    const fetcher = vi.fn();
    expect(() => createServerSpanTransport({ ...options(fetcher), endpoint })).toThrow('INVALID_INPUT');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects invalid limits, duplicate keys and unknown resources without network', () => {
    const fetcher = vi.fn();
    expect(() => createServerSpanTransport({ ...options(fetcher), timeoutMs: Infinity })).toThrow('INVALID_INPUT');
    expect(() => createServerSpanTransport({ ...options(fetcher), attributeKeys: ['x', 'x'] })).toThrow('INVALID_INPUT');
    expect(() => createServerSpanTransport({ ...options(fetcher), resource: { 'service.name': 'test', 'user.id': 'private' } })).toThrow('INVALID_INPUT');
  });

  it('rejects request byte overflow, invalid time and non-finite attributes before fetch', async () => {
    const fetcher = vi.fn();
    const small = createServerSpanTransport({ ...options(fetcher), maxRequestBytes: 256 });
    await expect(small.emit(input)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const transport = createServerSpanTransport(options(fetcher));
    await expect(transport.emit({ ...input, occurredAtUnixMs: 18446744073710 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(transport.emit({ ...input, attributes: { 'evidence.count': NaN } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([{ partialSuccess: { rejectedSpans: '1', errorMessage: 'bearer-sentinel' } },
    { partialSuccess: { rejectedSpans: 1 } }])('rejects OTLP partial acceptance without retry or echo', async (response) => {
    const fetcher = vi.fn(async () => json(response));
    await expect(createServerSpanTransport(options(fetcher)).emit(input)).rejects.toMatchObject({
      code: 'PARTIAL', message: 'Bounded telemetry operation failed: PARTIAL',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('accepts a zero-rejection warning without returning its text', async () => {
    const transport = createServerSpanTransport(options(async () => json({ partialSuccess: { rejectedSpans: '0', errorMessage: 'private-warning' } })));
    expect(await transport.emit(input)).toEqual({ status: 'accepted' });
  });

  it.each([null, [], { partialSuccess: { rejectedSpans: -1 } }, { partialSuccess: 'bad' }])('fails malformed acknowledgment %j', async (response) => {
    await expect(createServerSpanTransport(options(async () => json(response))).emit(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('refuses redirects and HTTP errors without reading/logging their bodies', async () => {
    const redirect = new Response('secret-response', { status: 302, headers: { Location: 'https://other.invalid/?token=secret' } });
    await expect(createServerSpanTransport(options(async () => redirect)).emit(input)).rejects.toMatchObject({ code: 'REDIRECT' });
    await expect(createServerSpanTransport(options(async () => json({ error: 'secret' }, 503))).emit(input)).rejects.toMatchObject({
      code: 'HTTP', message: 'Bounded telemetry operation failed: HTTP',
    });
  });

  it('bounds unknown-length response streams and cancels them', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8193)); }, cancel });
    const fetcher = vi.fn(async () => new Response(body, { headers: { 'content-type': 'application/json' } }));
    await expect(createServerSpanTransport(options(fetcher)).emit(input)).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    expect(cancel).toHaveBeenCalled();
  });

  it('rejects non-JSON content, invalid UTF-8 and truncated JSON', async () => {
    for (const response of [new Response('{}'),
      new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }),
      new Response('{', { headers: { 'content-type': 'application/json' } })]) {
      await expect(createServerSpanTransport(options(async () => response)).emit(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('enforces a deadline even if injected fetch ignores abort', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => undefined));
    const result = createServerSpanTransport({ ...options(fetcher), timeoutMs: 25 }).emit(input);
    const assertion = expect(result).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
  });

  it('cancels before fetch and sanitizes exceptions from injected transport', async () => {
    const controller = new AbortController(); controller.abort('secret-reason');
    const fetcher = vi.fn(async () => { throw new Error('credential in transport error'); });
    const transport = createServerSpanTransport(options(fetcher));
    await expect(transport.emit(input, { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(transport.emit(input)).rejects.toMatchObject({ code: 'NETWORK', message: 'Bounded telemetry operation failed: NETWORK' });
  });

  it('cancels a late fetch response after the bounded operation has timed out', async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const result = createServerSpanTransport({ ...options(fetcher), timeoutMs: 10 }).emit(input);
    const assertion = expect(result).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    const canceled = vi.fn();
    resolveFetch(new Response(new ReadableStream({ cancel: canceled }), { headers: { 'content-type': 'application/json' } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(canceled).toHaveBeenCalled();
  });

  it('bounds continuously ready empty chunks even when microtasks starve the timer', async () => {
    let tick = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => tick++);
    const canceled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(0)); }, cancel: canceled,
    });
    const fetcher = vi.fn(async () => new Response(body, { headers: { 'content-type': 'application/json' } }));
    await expect(createServerSpanTransport({ ...options(fetcher), timeoutMs: 25 }).emit(input))
      .rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(canceled).toHaveBeenCalled();
    expect(tick).toBeLessThan(40);
  });

  it('cancels a response when the deadline is first detected after fetch resolves', async () => {
    let time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    const canceled = vi.fn();
    const fetcher = vi.fn(async () => {
      // No timer dispatch or abort event: the post-race monotonic check is
      // the first observer of this deadline crossing.
      time = 26;
      return new Response(new ReadableStream({ cancel: canceled }), { headers: { 'content-type': 'application/json' } });
    });
    await expect(createServerSpanTransport({ ...options(fetcher), timeoutMs: 25 }).emit(input))
      .rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(canceled).toHaveBeenCalled();
  });
});
