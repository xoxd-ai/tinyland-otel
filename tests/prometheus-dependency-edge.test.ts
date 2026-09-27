import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

describe('the locked Prometheus exporter runtime edge', () => {
  it('resolves semantic conventions from the exporter itself', () => {
    const requireFromSdk = createRequire(import.meta.url);
    const sdkEntry = requireFromSdk.resolve('@opentelemetry/sdk-node');
    const requireFromSdkPackage = createRequire(sdkEntry);
    const exporterEntry = requireFromSdkPackage.resolve('@opentelemetry/exporter-prometheus');
    const requireFromExporter = createRequire(exporterEntry);

    expect(requireFromExporter.resolve('@opentelemetry/semantic-conventions'))
      .toMatch(/@opentelemetry[\\/]semantic-conventions[\\/]/);
  });
});
