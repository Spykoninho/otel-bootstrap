# @spyko/otel-bootstrap

Two-line OpenTelemetry + [pino](https://getpino.io) bootstrap for Node backends:
OTLP traces and JSON logs with **`trace_id` correlation baked in**.

## Why this exists

This package is part of my personal **golden path** — an opinionated, pre-decided
default stack for solo side projects, where observability is provided by a shared
platform (Grafana Alloy → VictoriaMetrics / Loki / Tempo / Grafana). See
[@spyko/eslint-config](https://www.npmjs.com/package/@spyko/eslint-config) for the
architecture side of the same method.

Trace ↔ logs correlation only works if **every log line carries the current
`trace_id`**. That rule is too easy to forget when instrumentation is 40 lines of
copy-pasted setup — so it lives in a package, and an app needs exactly two lines.

## Usage

```bash
npm install @spyko/otel-bootstrap
```

```ts
// main.ts — line 1, before any other import
import '@spyko/otel-bootstrap/register'
```

```ts
// anywhere
import { createLogger } from '@spyko/otel-bootstrap'

const logger = createLogger()
logger.info('ready') // {"level":30,"trace_id":"…","span_id":"…","msg":"ready"}
```

Or explicitly, to control the service name from code:

```ts
import { startTelemetry } from '@spyko/otel-bootstrap'

startTelemetry({ serviceName: 'my-api' })
```

## Behavior

- **Traces**: OpenTelemetry Node SDK with auto-instrumentation (HTTP, Express/Nest,
  Postgres, …), exported over OTLP to `OTEL_EXPORTER_OTLP_ENDPOINT`. Service
  identity comes from `OTEL_SERVICE_NAME`. The noisy `fs` instrumentation is
  disabled.
- **Logs**: pino JSON to stdout. A mixin injects `trace_id`/`span_id` whenever a
  span is active — deterministic, no module patching involved. `LOG_LEVEL` sets
  the level (default `info`).
- **Local dev**: when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, telemetry is a
  no-op and logs pretty-print to the console. No collector required, no error
  spam.
- **Shutdown**: SIGTERM/SIGINT flush the trace buffer before exit.

## Environment variables

| Variable | Role |
|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint; unset = telemetry off |
| `OTEL_SERVICE_NAME` | Service identity in traces and metrics |
| `LOG_LEVEL` | pino level, defaults to `info` |

## License

MIT
