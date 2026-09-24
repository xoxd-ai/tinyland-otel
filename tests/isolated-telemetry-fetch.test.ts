import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context, propagation, trace, ROOT_CONTEXT } from '@opentelemetry/api';
import { NodeSDK, core, metrics, tracing } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { createIsolatedTelemetryFetch, isIsolatedTelemetryRequest,
  setIsolatedTelemetryWiring } from '../src/services/isolated-telemetry-fetch.js';

afterEach(() => { setIsolatedTelemetryWiring(null); vi.restoreAllMocks(); });

describe('opt-in telemetry fetch isolation (configured HTTP/Undici instrumentations)', () => {
  it('denies missing SDK wiring and disallowed request options before fetch', async () => {
    expect(() => createIsolatedTelemetryFetch()).toThrow('INVALID_INPUT');
    const nativeFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    let ready = true;
    setIsolatedTelemetryWiring(core, () => ready);
    const fetcher = createIsolatedTelemetryFetch();
    const base: RequestInit = { method: 'POST', body: '{}',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: new AbortController().signal, redirect: 'manual', credentials: 'omit',
      cache: 'no-store', referrerPolicy: 'no-referrer' };
    for (const init of [
      { ...base, headers: { ...base.headers, Authorization: 'Bearer sentinel' } },
      { ...base, headers: { ...base.headers, traceparent: 'sentinel' } },
      { ...base, headers: { ...base.headers, baggage: 'credential=sentinel' } },
      { ...base, credentials: 'include' as RequestCredentials },
      { ...base, redirect: 'follow' as RequestRedirect },
      { ...base, signal: undefined },
      { ...base, body: new Uint8Array([1]) },
    ]) {
      await expect(Promise.resolve().then(() => fetcher('https://collector.invalid/v1/traces', init)))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
    await expect(Promise.resolve().then(() => fetcher('https://user:secret@collector.invalid/v1/traces', base)))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    let accessorReads = 0;
    const accessor = { ...base, get body() { accessorReads++; return accessorReads === 1 ? '{}' : 'secret'; } };
    await expect(Promise.resolve().then(() => fetcher('https://collector.invalid/v1/traces', accessor)))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(accessorReads).toBe(0);
    const hostileProxy = new Proxy(base, {
      getOwnPropertyDescriptor() { throw new Error('private-proxy-sentinel'); },
    });
    await expect(Promise.resolve().then(() => fetcher('https://collector.invalid/v1/traces', hostileProxy)))
      .rejects.toMatchObject({ code: 'INVALID_INPUT', message: 'Bounded telemetry operation failed: INVALID_INPUT' });
    const ineffectiveContext = vi.spyOn(context, 'active').mockReturnValue(ROOT_CONTEXT);
    await expect(Promise.resolve().then(() => fetcher('https://collector.invalid/v1/traces', base)))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    ineffectiveContext.mockRestore();
    expect(nativeFetch).not.toHaveBeenCalled();
    ready = false;
    await expect(Promise.resolve().then(() => fetcher('https://collector.invalid/v1/traces', base)))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(nativeFetch).not.toHaveBeenCalled();
    setIsolatedTelemetryWiring(null);
    await expect(Promise.resolve().then(() => fetcher('https://collector.invalid/v1/traces', base)))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('skips marked request hooks, spans, propagation and metrics while ordinary fetch remains instrumented', async () => {
    const observed: Array<Record<string, string | string[] | undefined>> = [];
    const server = createServer((request, response) => {
      observed.push(request.headers as Record<string, string | string[] | undefined>);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing loopback port');
    const url = `http://127.0.0.1:${address.port}/v1/traces`;

    const spans = new tracing.InMemorySpanExporter();
    const metricExport = new metrics.InMemoryMetricExporter(metrics.AggregationTemporality.DELTA);
    const metricReader = new metrics.PeriodicExportingMetricReader({ exporter: metricExport, exportIntervalMillis: 60000 });
    const clientMetricPoints = () => metricExport.getMetrics().flatMap((item) => item.scopeMetrics)
      .flatMap((item) => item.metrics)
      .filter((item) => item.descriptor.name.includes('http.client'))
      .flatMap((item) => item.dataPoints).length;
    let undiciStartHooks = 0;
    let undiciRequestHooks = 0;
    let httpStartHooks = 0;
    const instrumentations = getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingRequestHook: () => true,
        ignoreOutgoingRequestHook: isIsolatedTelemetryRequest,
        startOutgoingSpanHook: () => { httpStartHooks++; return {}; },
      },
      '@opentelemetry/instrumentation-undici': {
        enabled: true,
        ignoreRequestHook: isIsolatedTelemetryRequest,
        startSpanHook: () => { undiciStartHooks++; return {}; },
        requestHook: () => { undiciRequestHooks++; },
      },
    }).filter((item) => ['@opentelemetry/instrumentation-http',
      '@opentelemetry/instrumentation-undici'].includes(item.instrumentationName));
    expect(instrumentations.map((item) => item.instrumentationName).sort()).toEqual([
      '@opentelemetry/instrumentation-http', '@opentelemetry/instrumentation-undici',
    ]);
    const http = instrumentations.find((item) => item.instrumentationName === '@opentelemetry/instrumentation-http');
    const undici = instrumentations.find((item) => item.instrumentationName === '@opentelemetry/instrumentation-undici');
    const hooksReady = () => Boolean(http && undici && http.isEnabled() && undici.isEnabled() &&
      (http.getConfig() as { ignoreOutgoingRequestHook?: unknown }).ignoreOutgoingRequestHook === isIsolatedTelemetryRequest &&
      (undici.getConfig() as { ignoreRequestHook?: unknown }).ignoreRequestHook === isIsolatedTelemetryRequest);
    const sdk = new NodeSDK({
      instrumentations,
      spanProcessor: new tracing.SimpleSpanProcessor(spans),
      sampler: new tracing.AlwaysOnSampler(),
      metricReader,
      textMapPropagator: new core.CompositePropagator({ propagators: [
        new core.W3CTraceContextPropagator(), new core.W3CBaggagePropagator(),
      ] }),
    });
    try {
      sdk.start();
      expect(hooksReady()).toBe(true);
      setIsolatedTelemetryWiring(core, hooksReady);
      const isolated = createIsolatedTelemetryFetch();
      const init: RequestInit = { method: 'POST', body: '{}',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        signal: new AbortController().signal, redirect: 'manual', credentials: 'omit',
        cache: 'no-store', referrerPolicy: 'no-referrer' };

      const parent = trace.getTracer('isolation-test').startSpan('parent');
      const baggage = propagation.createBaggage({ secret: { value: 'baggage-sentinel' } });
      const ambient = propagation.setBaggage(trace.setSpan(ROOT_CONTEXT, parent), baggage);
      await context.with(ambient, async () => {
        const response = await isolated(url, init);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('{}');
      });
      await metricReader.forceFlush();
      expect(observed).toHaveLength(1);
      expect(observed[0]).not.toHaveProperty('traceparent');
      expect(observed[0]).not.toHaveProperty('baggage');
      expect(undiciStartHooks).toBe(0);
      expect(undiciRequestHooks).toBe(0);
      expect(httpStartHooks).toBe(0);
      expect(spans.getFinishedSpans().filter((span) => span.name !== 'parent')).toHaveLength(0);
      expect(clientMetricPoints()).toBe(0);

      await context.with(ambient, async () => {
        const response = await globalThis.fetch(url, init);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('{}');
      });
      parent.end();
      await metricReader.forceFlush();
      expect(observed).toHaveLength(2);
      expect(observed[1].traceparent).toBeDefined();
      expect(observed[1].baggage).toContain('baggage-sentinel');
      expect(undiciStartHooks).toBeGreaterThan(0);
      expect(undiciRequestHooks).toBeGreaterThan(0);
      expect(spans.getFinishedSpans().some((span) => span.name !== 'parent')).toBe(true);
      expect(clientMetricPoints()).toBeGreaterThan(0);

      // A controlled fetch adapter that synchronously uses node:http exercises
      // the separately configured HTTP ignore hook, not arbitrary fetch patches.
      const priorFetch = globalThis.fetch;
      globalThis.fetch = ((target: string, request: RequestInit) => new Promise<Response>((resolve, reject) => {
        const outgoing = httpRequest(target, { method: request.method, headers: request.headers as Record<string, string> },
          (incoming) => {
            incoming.resume();
            incoming.on('end', () => resolve(new Response('{}', { status: incoming.statusCode })));
          });
        outgoing.on('error', reject);
        outgoing.end(request.body as string | undefined);
      })) as typeof fetch;
      try {
        const beforeHttp = httpStartHooks;
        const beforeSpans = spans.getFinishedSpans().length;
        const beforeMetrics = clientMetricPoints();
        await context.with(ambient, async () => {
          const response = await createIsolatedTelemetryFetch()(url, init);
          expect(response.status).toBe(200);
          expect(await response.text()).toBe('{}');
        });
        await metricReader.forceFlush();
        expect(observed[2]).not.toHaveProperty('traceparent');
        expect(observed[2]).not.toHaveProperty('baggage');
        expect(httpStartHooks).toBe(beforeHttp);
        expect(spans.getFinishedSpans()).toHaveLength(beforeSpans);
        expect(clientMetricPoints()).toBe(beforeMetrics);
        await context.with(ambient, async () => {
          const response = await globalThis.fetch(url, init);
          expect(response.status).toBe(200);
          expect(await response.text()).toBe('{}');
        });
        expect(observed[3].traceparent).toBeDefined();
        expect(observed[3].baggage).toContain('baggage-sentinel');
        expect(httpStartHooks).toBeGreaterThan(beforeHttp);
        await metricReader.forceFlush();
        expect(clientMetricPoints()).toBeGreaterThan(beforeMetrics);
      } finally {
        globalThis.fetch = priorFetch;
      }

      const priorUndiciConfig = undici!.getConfig();
      const replacedUndiciConfig = { ...priorUndiciConfig, ignoreRequestHook: () => false };
      undici!.setConfig(replacedUndiciConfig);
      const requestCount = observed.length;
      await expect(Promise.resolve().then(() => isolated(url, init)))
        .rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(observed).toHaveLength(requestCount);
      undici!.setConfig(priorUndiciConfig);
    } finally {
      setIsolatedTelemetryWiring(null);
      await sdk.shutdown();
      server.close();
      await once(server, 'close');
    }
  });
});
