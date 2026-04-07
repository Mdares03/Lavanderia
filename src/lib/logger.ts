type LogPayload = Record<string, unknown>;

function out(level: "info" | "warn" | "error", message: string, payload?: LogPayload) {
  const stamp = new Date().toISOString();
  const line = payload ? `${stamp} [${level}] ${message} ${JSON.stringify(payload)}` : `${stamp} [${level}] ${message}`;
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info: (message: string, payload?: LogPayload) => out("info", message, payload),
  warn: (message: string, payload?: LogPayload) => out("warn", message, payload),
  error: (message: string, payload?: LogPayload) => out("error", message, payload)
};
