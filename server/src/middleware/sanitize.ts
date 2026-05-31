import type { RequestHandler } from "express";

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (key.startsWith("$") || key.includes(".")) {
        continue;
      }

      sanitized[key] = sanitizeValue(nestedValue);
    }

    return sanitized;
  }

  return value;
}

export const sanitizeMutableInput: RequestHandler = (req, _res, next) => {
  req.body = sanitizeValue(req.body) as typeof req.body;
  req.params = sanitizeValue(req.params) as typeof req.params;
  next();
};
