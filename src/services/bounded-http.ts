/** Internal transport mechanics. No ambient configuration, logging or retries. */
import { performance } from 'node:perf_hooks';
import type { ReadableStreamDefaultReader } from 'node:stream/web';

/** Caller-admitted transport; must honor redirect/abort and must not add instrumentation. */
export type BoundedFetch = (url: string, init: RequestInit) => Promise<Response>;
export type TelemetryTransportCode = 'INVALID_INPUT' | 'ABORTED' | 'TIMEOUT' |
  'NETWORK' | 'HTTP' | 'REDIRECT' | 'RESPONSE_TOO_LARGE' | 'INVALID_RESPONSE' | 'PARTIAL';

/** Deliberately carries no URL, response text, credential, query or nested cause. */
export class TelemetryTransportError extends Error {
  constructor(public readonly code: TelemetryTransportCode) {
    super(`Bounded telemetry operation failed: ${code}`);
    this.name = 'TelemetryTransportError';
  }
}

export function invalid(): never { throw new TelemetryTransportError('INVALID_INPUT'); }
export function malformed(): never { throw new TelemetryTransportError('INVALID_RESPONSE'); }
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}
export function endpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) invalid();
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname ||
      parsed.username || parsed.password || parsed.search || parsed.hash) invalid();
  return parsed.toString().replace(/\/$/, '');
}
export function attributeKeys(value: readonly string[]): ReadonlySet<string> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32 ||
      value.some((key) => typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.]{0,95}$/.test(key)) ||
      new Set(value).size !== value.length) invalid();
  return new Set(value);
}
export type SpanScalar = string | number | boolean;
export function scalar(value: unknown): value is SpanScalar {
  return typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) ||
    (typeof value === 'string' && Buffer.byteLength(value) <= 1024 && !/[\u0000-\u001f\u007f]/.test(value));
}
export function attributes(value: unknown, keys: ReadonlySet<string>): Record<string, SpanScalar> {
  if (!object(value) || Object.keys(value).length > 32) invalid();
  const copy: Record<string, SpanScalar> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (!keys.has(key) || !scalar(item)) invalid();
    copy[key] = item;
  }
  return copy;
}

function cancelResponse(response: Response): void {
  try { if (response.body) void response.body.cancel().catch(() => undefined); } catch { /* Best effort. */ }
}

export class BoundedHttpOperation {
  private readonly controller = new AbortController();
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly deadline: number;
  private failure: TelemetryTransportCode | undefined;
  private remaining: number;
  private readonly onAbort = () => this.stop('ABORTED');

  constructor(private readonly fetcher: BoundedFetch, timeoutMs: number, bytes: number,
    private readonly callerSignal?: AbortSignal) {
    this.remaining = bytes;
    this.deadline = performance.now() + timeoutMs;
    this.timer = setTimeout(() => this.stop('TIMEOUT'), timeoutMs);
    callerSignal?.addEventListener('abort', this.onAbort, { once: true });
    if (callerSignal?.aborted) this.stop('ABORTED');
  }
  private stop(code: TelemetryTransportCode): void {
    this.failure ??= code;
    this.controller.abort();
  }
  check(): void {
    // Ready stream reads can starve timers through an endless microtask chain.
    // A monotonic wall-clock guard is required in addition to the abort timer.
    if (!this.failure && performance.now() >= this.deadline) this.stop('TIMEOUT');
    if (this.failure) throw new TelemetryTransportError(this.failure);
  }
  private async wait<T>(work: () => Promise<T>, discard?: (value: T) => void): Promise<T> {
    this.check();
    let aborted: (() => void) | undefined;
    const cancellation = new Promise<never>((_resolve, reject) => {
      aborted = () => reject(new TelemetryTransportError(this.failure ?? 'ABORTED'));
      this.controller.signal.addEventListener('abort', aborted, { once: true });
    });
    try {
      const pending = Promise.resolve().then(() => { this.check(); return work(); }).then((value) => {
        // A nonconforming injected fetch may resolve after cancellation. Its
        // body must not remain open merely because our bounded call returned.
        if (this.controller.signal.aborted) discard?.(value);
        return value;
      });
      const result = await Promise.race([pending, cancellation]);
      try { this.check(); } catch (failure) { discard?.(result); throw failure; }
      return result;
    } finally {
      if (aborted) this.controller.signal.removeEventListener('abort', aborted);
    }
  }
  async json(url: string, maxBytes: number, body?: string): Promise<unknown> {
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      response = await this.wait(() => this.fetcher(url, {
        method: body === undefined ? 'GET' : 'POST', body,
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        signal: this.controller.signal, redirect: 'manual', credentials: 'omit',
        cache: 'no-store', referrerPolicy: 'no-referrer',
      }), cancelResponse);
      if (response.redirected || (response.status >= 300 && response.status < 400)) throw new TelemetryTransportError('REDIRECT');
      if (response.status !== 200) throw new TelemetryTransportError('HTTP');
      if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') malformed();
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > Math.min(maxBytes, this.remaining))) {
        throw new TelemetryTransportError('RESPONSE_TOO_LARGE');
      }
      if (!response.body) malformed();
      reader = response.body.getReader();
      // One capped allocation; millions of tiny chunks cannot grow an array
      // of per-chunk objects beyond the advertised decoded-byte envelope.
      const bytes = Buffer.allocUnsafe(Math.min(maxBytes, this.remaining));
      let size = 0;
      while (true) {
        const result = await this.wait(() => reader!.read());
        if (result.done) break;
        size += result.value.byteLength;
        this.remaining -= result.value.byteLength;
        if (size > maxBytes || this.remaining < 0) throw new TelemetryTransportError('RESPONSE_TOO_LARGE');
        bytes.set(result.value, size - result.value.byteLength);
      }
      this.check();
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))); }
      catch { return malformed(); }
      this.check();
      return parsed;
    } catch (cause) {
      // Abort all parallel fetches on the first failed member; no partial result.
      const failure = cause instanceof TelemetryTransportError ? cause : new TelemetryTransportError('NETWORK');
      this.stop(failure.code);
      throw failure;
    } finally {
      // Cancellation is best effort; never await a hostile/hung stream's cancel.
      if (reader) { void reader.cancel().catch(() => undefined); }
      else if (response) cancelResponse(response);
    }
  }
  close(): void {
    clearTimeout(this.timer);
    this.callerSignal?.removeEventListener('abort', this.onAbort);
    this.stop('ABORTED');
  }
}
