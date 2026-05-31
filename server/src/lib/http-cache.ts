import { createHash } from "node:crypto";
import type { Request, Response } from "express";

export function sendConditionalJson(
  req: Request,
  res: Response,
  payload: unknown,
  options: {
    cacheControl: string;
    statusCode?: number;
    etagSeed?: string;
  }
) {
  const body = JSON.stringify(payload);
  const etag = buildWeakEtag(options.etagSeed ? `${options.etagSeed}:${body}` : body);

  res.setHeader("Cache-Control", options.cacheControl);
  res.setHeader("ETag", etag);
  res.setHeader("Vary", "Origin, Authorization");

  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }

  res.status(options.statusCode ?? 200).type("application/json").send(body);
}

function buildWeakEtag(value: string): string {
  const digest = createHash("sha1").update(value).digest("base64url");
  return `W/"${digest}"`;
}
