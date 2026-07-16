import {
  context,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import { OpenTelemetry } from "@ai-sdk/otel";
import { registerTelemetry } from "ai";
import type {
  ActiveTrace,
  Observability,
  ObservabilityFields,
  RuntimeName,
} from "../../application/observability";

export interface LogFields extends ObservabilityFields {
  runtime?: RuntimeName;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  tripId?: string;
  agentSessionId?: string;
  turnId?: string;
  messageId?: string;
  suggestionId?: string;
  toolCallId?: string;
  errorCode?: string;
  errorType?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface TraceFields extends LogFields {
  [key: string]: unknown;
}

type ErrorReporter = (error: unknown, fields?: LogFields) => void;

const tracer = trace.getTracer("opentrip-api");
let aiTelemetryRegistered = false;
let errorReporter: ErrorReporter = () => {};
let defaultRuntime: RuntimeName = "node";

const SECRET_KEY =
  /authorization|cookie|password|secret|token|api[_-]?key|access[_-]?key|database[_-]?url/i;
const DATA_URL = /^data:/i;
const BASE64_BLOB = /^[A-Za-z0-9+/]{512,}={0,2}$/;

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.search) url.search = "";
    if (url.hash) url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function redactSecretsInText(value: string): string {
  return value
    .replace(/\b(?:postgres(?:ql)?|mysql):\/\/[^\s]+/gi, "[DATABASE URL REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=([^\s&]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(/https?:\/\/[^\s"']+/gi, (url) => sanitizeUrl(url));
}

function sanitizeString(value: string, key: string): unknown {
  if (DATA_URL.test(value) || BASE64_BLOB.test(value)) return "[BINARY REDACTED]";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.stringify(sanitizeTelemetryValue(JSON.parse(trimmed), key));
    } catch {
      // Keep non-JSON model text unchanged except for credential redaction.
    }
  }
  return redactSecretsInText(sanitizeUrl(value));
}

export function sanitizeTelemetryValue(
  value: unknown,
  key = "",
  seen = new WeakSet<object>(),
): unknown {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecretsInText(value.message),
      stack: value.stack ? redactSecretsInText(value.stack) : undefined,
    };
  }
  if (typeof value === "string") {
    return sanitizeString(value, key);
  }
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTelemetryValue(item, key, seen));
  }
  return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [
      childKey,
      sanitizeTelemetryValue(child, childKey, seen),
    ]),
  );
}

export function sanitizeSpan<T>(span: T): T {
  if (span == null || typeof span !== "object") return span;
  const value = span as T & {
    attributes?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
  if (value.attributes) {
    value.attributes = sanitizeTelemetryValue(value.attributes) as Record<string, unknown>;
  }
  if (value.data) {
    value.data = sanitizeTelemetryValue(value.data) as Record<string, unknown>;
  }
  return span;
}

export function registerAiTelemetry(): void {
  if (aiTelemetryRegistered) return;
  registerTelemetry(
    new OpenTelemetry({
      usage: true,
      providerMetadata: true,
      runtimeContext: true,
      headers: false,
      schema: false,
      toolChoice: false,
      enrichSpan: ({ runtimeContext }) =>
        sanitizeAttributes(runtimeContext ?? {}),
    }),
  );
  aiTelemetryRegistered = true;
}

export function setErrorReporter(reporter: ErrorReporter): void {
  errorReporter = reporter;
}

export function setRuntimeName(runtime: RuntimeName): void {
  defaultRuntime = runtime;
}

export function captureException(error: unknown, fields?: LogFields): void {
  try {
    errorReporter(error, fields);
  } catch {
    // Observability must never affect product behavior.
  }
}

export function getTraceIds(span: Span | undefined = trace.getActiveSpan()): {
  traceId?: string;
  spanId?: string;
} {
  const context = span?.spanContext();
  return context
    ? { traceId: context.traceId, spanId: context.spanId }
    : {};
}

function sanitizeAttributes(fields: TraceFields): Attributes {
  const safe = sanitizeTelemetryValue(fields) as Record<string, unknown>;
  const canonicalNames: Record<string, string> = {
    requestId: "request.id",
    tripId: "opentrip.trip.id",
    agentSessionId: "opentrip.agent.session_id",
    turnId: "opentrip.agent.turn_id",
    messageId: "opentrip.agent.message_id",
    suggestionId: "opentrip.agent.suggestion_id",
    toolCallId: "gen_ai.tool.call.id",
    operationKind: "opentrip.operation.kind",
    tripVersionBefore: "opentrip.trip.version_before",
    trigger: "opentrip.agent.trigger",
    runtime: "opentrip.runtime",
    uiContractVersion: "opentrip.agent.ui.contract_version",
    uiAttempt: "opentrip.agent.ui.attempt",
    uiHighRisk: "opentrip.agent.ui.high_risk",
    uiOutcome: "opentrip.agent.ui.outcome",
    uiReason: "opentrip.agent.ui.reason",
  };
  return Object.fromEntries(
    Object.entries(safe).filter(
      (entry): entry is [string, string | number | boolean] =>
        ["string", "number", "boolean"].includes(typeof entry[1]),
    ).map(([key, value]) => [canonicalNames[key] ?? key, value]),
  );
}

export function setActiveSpanAttributes(fields: TraceFields): void {
  trace.getActiveSpan()?.setAttributes(sanitizeAttributes(fields));
}

export async function startSpan<T>(
  name: string,
  fields: TraceFields,
  operation: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes: sanitizeAttributes(fields) }, async (span) => {
    try {
      const result = await operation(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function startManualSpan(name: string, fields: TraceFields): Span {
  return tracer.startSpan(name, { attributes: sanitizeAttributes(fields) });
}

export function runWithSpan<T>(span: Span, operation: () => T): T {
  return context.with(trace.setSpan(context.active(), span), operation);
}

export function recordSpanError(error: unknown, span = trace.getActiveSpan()): void {
  if (!span) return;
  span.recordException(error instanceof Error ? error : new Error(String(error)));
  span.setStatus({ code: SpanStatusCode.ERROR });
}

function activeTrace(span: Span): ActiveTrace {
  return {
    run: (operation) => runWithSpan(span, operation),
    setAttribute: (name, value) => span.setAttribute(name, value),
    recordError: (error) => recordSpanError(error, span),
    end: () => span.end(),
  };
}

function writeLog(level: "debug" | "info" | "warn" | "error", event: string, fields: LogFields): void {
  const ids = getTraceIds();
  const payload = sanitizeTelemetryValue({
    timestamp: new Date().toISOString(),
    level,
    event,
    runtime: defaultRuntime,
    ...ids,
    ...fields,
  });
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
}

export const logger = {
  debug: (event: string, fields: LogFields = {}) => writeLog("debug", event, fields),
  info: (event: string, fields: LogFields = {}) => writeLog("info", event, fields),
  warn: (event: string, fields: LogFields = {}) => writeLog("warn", event, fields),
  error: (event: string, fields: LogFields = {}) => writeLog("error", event, fields),
};

export const observability: Observability = {
  logger,
  captureException,
  startTrace: (name, fields = {}) => activeTrace(startManualSpan(name, fields)),
  startSpan: (name, fields, operation) =>
    startSpan(name, fields, (span) => operation(activeTrace(span))),
};
