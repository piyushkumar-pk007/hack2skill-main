import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { verifyAccessToken, verifyRefreshToken } from "../lib/auth.js";
import { unauthorized } from "../lib/errors.js";

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function getQueryAccessToken(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = getBearerToken(req.header("authorization")) ?? getQueryAccessToken(req.query.accessToken);

  if (!token) {
    next(unauthorized());
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      tokenType: payload.type,
    };
    next();
  } catch {
    next(unauthorized("Authentication failed."));
  }
};

export const requireRefreshAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[env.refreshCookieName] as string | undefined;

  if (!token) {
    next(unauthorized("Refresh session not available."));
    return;
  }

  try {
    const payload = verifyRefreshToken(token);
    req.auth = {
      userId: payload.sub,
      tokenType: payload.type,
    };
    next();
  } catch {
    next(unauthorized("Refresh session is invalid."));
  }
};
