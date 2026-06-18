import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Defense-in-depth: even if a call site forgets, never let user content or a
  // live credential reach the logs (which platform operators can read). Call
  // sites are also fixed individually; this is the backstop. A single "*"
  // matches one path segment, so each key is listed at the top level and one
  // level deep (covers logger.warn({ payload: {...} }) etc.).
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      // live credentials — never log, never replayable from a leak
      "token", "*.token", "resetToken", "*.resetToken", "resetUrl", "*.resetUrl",
      // user content — message/prayer/journal/gratitude text, previews, titles
      "body", "*.body", "text", "*.text", "preview", "*.preview",
      "content", "*.content", "intention", "*.intention",
      "payload.body", "payload.title", "*.payload.body", "*.payload.title",
      // PII — addresses we don't need spelled out in logs
      "email", "*.email", "userEmail", "*.userEmail", "to", "*.to",
    ],
    censor: "[redacted]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
