import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import { env } from "../config/env.js";

export interface AuthTokenPayload {
  sub: string;
  type: "access" | "refresh";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "access" } satisfies AuthTokenPayload, env.jwtAccessSecret, {
    expiresIn: `${env.accessTokenTtlMinutes}m`,
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "refresh" } satisfies AuthTokenPayload, env.jwtRefreshSecret, {
    expiresIn: `${env.refreshTokenTtlDays}d`,
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AuthTokenPayload;
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as AuthTokenPayload;
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function setRefreshTokenCookie(res: Response, token: string) {
  res.cookie(env.refreshCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });
}

export function clearRefreshTokenCookie(res: Response) {
  res.clearCookie(env.refreshCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/api/auth",
  });
}

export function getRefreshExpiryDate(): Date {
  return new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}
