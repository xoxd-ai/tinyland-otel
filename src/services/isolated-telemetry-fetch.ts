/** An opt-in fetch boundary for this package's bounded OTLP/Tempo transports.
 *
 * Only the NodeSDK instance configured by initializeServerTracing can admit it.
 * The private marker is consumed by that instance's HTTP and Undici ignore hooks.
 * Suppression and a root context also prevent inherited span/baggage propagation.
 * This does not claim to isolate arbitrary third-party fetch wrappers.
 */
import { ROOT_CONTEXT, context, createContextKey } from '@opentelemetry/api';
import { TelemetryTransportError, type BoundedFetch } from './bounded-http.js';

type TracingCore = {
  suppressTracing: (value: typeof ROOT_CONTEXT) => typeof ROOT_CONTEXT;
  isTracingSuppressed: (value: typeof ROOT_CONTEXT) => boolean;
};

const isolatedTransportKey = createContextKey('tinyland-otel:isolated-telemetry-transport:v1');
let installedWiring: { core: TracingCore; ready: () => boolean } | null = null;

function wiringReady(wiring: { core: TracingCore; ready: () => boolean }): boolean {
  try { return wiring.ready(); } catch { return false; }
}

/** Internal SDK lifecycle hook; never exposed from the package entrypoint. */
export function setIsolatedTelemetryWiring(core: unknown, ready?: () => boolean): void {
  if (!core || typeof core !== 'object' ||
      typeof (core as TracingCore).suppressTracing !== 'function' ||
      typeof (core as TracingCore).isTracingSuppressed !== 'function' ||
      typeof ready !== 'function') {
    installedWiring = null;
    return;
  }
  installedWiring = { core: core as TracingCore, ready };
}

/** Called synchronously by the configured HTTP and Undici ignore hooks. */
export function isIsolatedTelemetryRequest(): boolean {
  const active = context.active();
  return installedWiring !== null && active.getValue(isolatedTransportKey) === true &&
    installedWiring.core.isTracingSuppressed(active);
}

type ApprovedRequest = { method: 'GET' | 'POST'; body?: string; signal: AbortSignal };

function dataFields(value: unknown, allowed: ReadonlySet<string>): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const fields: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key) || !('value' in descriptors[key])) return null;
    fields[key] = descriptors[key].value;
  }
  return fields;
}

/** Snapshot once; accessor/proxy reflection failures are denied without echo. */
function permittedRequest(url: string, init: RequestInit): ApprovedRequest | null {
  try {
    if (typeof url !== 'string' || url.length > 2048 || /[\s\\]/.test(url)) return null;
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol) || !target.hostname ||
        target.username || target.password || target.hash) return null;

    const request = dataFields(init, new Set([
      'method', 'body', 'headers', 'signal', 'redirect', 'credentials', 'cache', 'referrerPolicy',
    ]));
    if (!request || (request.method !== 'GET' && request.method !== 'POST') ||
        request.redirect !== 'manual' || request.credentials !== 'omit' ||
        request.cache !== 'no-store' || request.referrerPolicy !== 'no-referrer' ||
        !(request.signal instanceof AbortSignal)) return null;
    if (request.method === 'GET' ? request.body !== undefined :
        typeof request.body !== 'string' || Buffer.byteLength(request.body) > 65536) return null;

    const headers = dataFields(request.headers, new Set(['Accept', 'Content-Type']));
    if (!headers || headers.Accept !== 'application/json' ||
        (request.method === 'POST' ? headers['Content-Type'] !== 'application/json' :
          Object.hasOwn(headers, 'Content-Type')) ||
        Object.keys(headers).length !== (request.method === 'POST' ? 2 : 1)) return null;
    return { method: request.method, body: request.body as string | undefined, signal: request.signal };
  } catch { return null; }
}

/** Construct only after initializeServerTracing installed both ignore hooks.
 * The returned function checks the wiring and active suppression on every call.
 */
export function createIsolatedTelemetryFetch(): BoundedFetch {
  if (!installedWiring || !wiringReady(installedWiring) || typeof globalThis.fetch !== 'function') {
    throw new TelemetryTransportError('INVALID_INPUT');
  }
  const nativeFetch = globalThis.fetch;
  return (url, init) => {
    const wiring = installedWiring;
    const approved = permittedRequest(url, init);
    if (!wiring || !wiringReady(wiring) || !approved) {
      throw new TelemetryTransportError('INVALID_INPUT');
    }
    // Pass only reviewed fields even if the caller later extends its object.
    const safeInit: RequestInit = {
      method: approved.method, body: approved.body, signal: approved.signal,
      headers: { Accept: 'application/json',
        ...(approved.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      redirect: 'manual', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    };
    const isolated = wiring.core.suppressTracing(ROOT_CONTEXT).setValue(isolatedTransportKey, true);
    return context.with(isolated, () => {
      // A missing/ineffective context manager must deny before fetch starts.
      if (installedWiring !== wiring || !wiringReady(wiring) || !isIsolatedTelemetryRequest()) {
        throw new TelemetryTransportError('INVALID_INPUT');
      }
      return nativeFetch.call(globalThis, url, safeInit);
    });
  };
}
