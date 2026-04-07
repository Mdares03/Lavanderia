export const APP_DEFAULTS = {
  timezone: "America/Monterrey",
  currency: "MXN",
  locale: "es-MX",
  serialBaudRate: 9600,
  serialPortPath: "COM3"
} as const;

export function getNodeEnv(): "development" | "test" | "production" {
  if (process.env.NODE_ENV === "production") {
    return "production";
  }
  if (process.env.NODE_ENV === "test") {
    return "test";
  }
  return "development";
}

export function nowDate() {
  return new Date();
}
