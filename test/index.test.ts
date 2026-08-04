import { Writable } from 'node:stream'

import { trace } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { afterEach, describe, expect, it } from 'vitest'

import { createLogger, startTelemetry } from '../src/index.js'

function captureStream(): { lines: string[]; stream: Writable } {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString())
      callback()
    },
  })
  return { lines, stream }
}

afterEach(() => {
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
})

describe('createLogger', () => {
  it('injects trace_id and span_id when a span is active', async () => {
    const provider = new NodeTracerProvider()
    provider.register()

    const { lines, stream } = captureStream()
    const logger = createLogger({}, stream)

    let expectedTraceId = ''
    trace.getTracer('test').startActiveSpan('op', (span) => {
      expectedTraceId = span.spanContext().traceId
      logger.info('hello')
      span.end()
    })

    const entry = JSON.parse(lines[0]) as Record<string, unknown>
    expect(entry.trace_id).toBe(expectedTraceId)
    expect(entry.span_id).toBeDefined()
    expect(entry.msg).toBe('hello')

    await provider.shutdown()
  })

  it('emits plain JSON without trace fields outside of any span', () => {
    const { lines, stream } = captureStream()
    const logger = createLogger({}, stream)

    logger.info('no span here')

    const entry = JSON.parse(lines[0]) as Record<string, unknown>
    expect(entry.trace_id).toBeUndefined()
    expect(entry.msg).toBe('no span here')
  })
})

describe('startTelemetry', () => {
  it('no-ops without OTEL_EXPORTER_OTLP_ENDPOINT (local dev)', () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    expect(startTelemetry()).toBeNull()
  })

  it('starts and shuts down cleanly when an endpoint is configured', async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:9'
    const sdk = startTelemetry({ serviceName: 'test-service' })
    expect(sdk).not.toBeNull()
    await expect(sdk?.shutdown()).resolves.toBeUndefined()
  })
})
