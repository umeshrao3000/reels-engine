type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function write(level: LogLevel, event: string, fields?: LogFields): void {
  const line = JSON.stringify({ level, event, ...fields, timestamp: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Minimal structured logger — single-line JSON so log lines stay greppable
 * in Vercel's log viewer. Not a metrics/telemetry system; just consistent
 * shape for the events services need to record (per REELS_ENGINE_V1_BLUEPRINT.md).
 */
export const logger = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
