import { trace } from '@opentelemetry/api'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { NodeSDK } from '@opentelemetry/sdk-node'
import type { DestinationStream, Logger, LoggerOptions } from 'pino'
import { pino } from 'pino'

export interface TelemetryOptions {
  /** Overrides OTEL_SERVICE_NAME. */
  serviceName?: string
}

/**
 * Starts the OpenTelemetry Node SDK with auto-instrumentation (HTTP, Postgres, …)
 * and an OTLP trace exporter.
 *
 * No-ops and returns null when OTEL_EXPORTER_OTLP_ENDPOINT is unset — local dev
 * runs without observability by design.
 *
 * Call this first thing in your entrypoint, before importing anything that must
 * be instrumented (frameworks, drivers).
 */
export function startTelemetry(options: TelemetryOptions = {}): NodeSDK | null {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return null

  if (options.serviceName) process.env.OTEL_SERVICE_NAME = options.serviceName

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs emits hundreds of low-value spans per request
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // trace_id injection is handled deterministically by the createLogger mixin
        '@opentelemetry/instrumentation-pino': { enabled: false },
        // adds ~8s to shutdown and feeds a MeterProvider we don't configure
        '@opentelemetry/instrumentation-runtime-node': { enabled: false },
      }),
    ],
  })
  sdk.start()

  const shutdown = (): void => {
    void sdk.shutdown()
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)

  return sdk
}

/**
 * Creates a pino logger that injects trace_id/span_id into every log line when a
 * span is active — this is what makes trace ↔ logs correlation work in Grafana.
 *
 * Pretty-prints in local development (no OTLP endpoint, non-production NODE_ENV);
 * emits plain JSON otherwise.
 */
export function createLogger(options: LoggerOptions = {}, destination?: DestinationStream): Logger {
  const env = process.env.NODE_ENV
  const pretty =
    !destination &&
    !process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
    env !== 'production' &&
    env !== 'test'

  const base: LoggerOptions = {
    level: process.env.LOG_LEVEL ?? 'info',
    mixin() {
      const span = trace.getActiveSpan()
      if (!span) return {}
      const { traceId, spanId } = span.spanContext()
      return { trace_id: traceId, span_id: spanId }
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
    ...options,
  }

  return destination ? pino(base, destination) : pino(base)
}
