import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

vi.mock("../middleware/database.js", () => ({
  ensureDatabaseConnection: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { default: app } = await import("../app.js");
const api = request(app);

// Each describe group uses a different IP so requests stay within the auth rate limit
// (max 10 per 15 min per IP). This is explicit test isolation, not a workaround.
const REGISTER_IP = "10.20.1.1";
const LOGIN_IP = "10.20.1.2";
const REFRESH_IP = "10.20.1.3";
const LOGOUT_IP = "10.20.1.4";

const VALID_PASSWORD = "SuperSecure!123";

function uniqueEmail() {
  return `auth-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
}

// Two shared users created once in beforeAll.
// refreshUser is NEVER logged in, so its refresh cookie stays valid.
// loginUser is used only for login tests (login invalidates the refresh token).
let refreshUser: { email: string; cookie: string[] };
let loginUser: { email: string };

beforeAll(async () => {
  const refreshEmail = uniqueEmail();
  const refreshRes = await api
    .post("/api/auth/register")
    .set("X-Forwarded-For", REFRESH_IP)
    .send({ email: refreshEmail, password: VALID_PASSWORD, displayName: "Refresh User", timezone: "UTC" });
  refreshUser = { email: refreshEmail, cookie: (refreshRes.headers["set-cookie"] as string[]) ?? [] };

  const loginEmail = uniqueEmail();
  await api
    .post("/api/auth/register")
    .set("X-Forwarded-For", LOGIN_IP)
    .send({ email: loginEmail, password: VALID_PASSWORD, displayName: "Login User", timezone: "UTC" });
  loginUser = { email: loginEmail };
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
  it("returns 201 with accessToken and user on valid body", async () => {
    const res = await api
      .post("/api/auth/register")
      .set("X-Forwarded-For", REGISTER_IP)
      .send({ email: uniqueEmail(), password: VALID_PASSWORD, displayName: "Test User", timezone: "UTC" });
    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.user).toBeDefined();
    expect(res.body.expiresInMinutes).toBeTypeOf("number");
  });

  it("does not expose passwordHash or refreshTokenHash in the response", async () => {
    const res = await api
      .post("/api/auth/register")
      .set("X-Forwarded-For", REGISTER_IP)
      .send({ email: uniqueEmail(), password: VALID_PASSWORD, displayName: "Test User", timezone: "UTC" });
    expect(res.status).toBe(201);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("refreshTokenHash");
  });

  it("sets a httpOnly refresh-token cookie", async () => {
    const res = await api
      .post("/api/auth/register")
      .set("X-Forwarded-For", REGISTER_IP)
      .send({ email: uniqueEmail(), password: VALID_PASSWORD, displayName: "Test User", timezone: "UTC" });
    const cookieStr = [res.headers["set-cookie"]].flat().join(";");
    expect(cookieStr).toMatch(/wayfinder_refresh_token/i);
    expect(cookieStr).toMatch(/HttpOnly/i);
  });

  it("returns 400 when email is already taken", async () => {
    const email = uniqueEmail();
    await api
      .post("/api/auth/register")
      .set("X-Forwarded-For", REGISTER_IP)
      .send({ email, password: VALID_PASSWORD, displayName: "First", timezone: "UTC" });
    const res = await api
      .post("/api/auth/register")
      .set("X-Forwarded-For", REGISTER_IP)
      .send({ email, password: VALID_PASSWORD, displayName: "Duplicate", timezone: "UTC" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the body fails schema validation (missing password)", async () => {
    const res = await api
      .post("/api/auth/register")
      .set("X-Forwarded-For", REGISTER_IP)
      .send({ email: uniqueEmail(), displayName: "No Password", timezone: "UTC" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("bad_request");
  });

  it("returns 400 when password is too short (< 10 chars)", async () => {
    const res = await api
      .post("/api/auth/register")
      .set("X-Forwarded-For", REGISTER_IP)
      .send({ email: uniqueEmail(), password: "short", displayName: "Test", timezone: "UTC" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await api
      .post("/api/auth/register")
      .set("X-Forwarded-For", REGISTER_IP)
      .send({ email: "not-an-email", password: VALID_PASSWORD, displayName: "Test", timezone: "UTC" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  it("returns 200 with a valid accessToken for correct credentials", async () => {
    const res = await api
      .post("/api/auth/login")
      .set("X-Forwarded-For", LOGIN_IP)
      .send({ email: loginUser.email, password: VALID_PASSWORD });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("returns 401 for a wrong password", async () => {
    const res = await api
      .post("/api/auth/login")
      .set("X-Forwarded-For", LOGIN_IP)
      .send({ email: loginUser.email, password: "WrongPassword1!" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a non-existent email", async () => {
    const res = await api
      .post("/api/auth/login")
      .set("X-Forwarded-For", LOGIN_IP)
      .send({ email: "nobody@example.com", password: VALID_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("returns 400 when email is missing from body", async () => {
    const res = await api
      .post("/api/auth/login")
      .set("X-Forwarded-For", LOGIN_IP)
      .send({ password: VALID_PASSWORD });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

describe("POST /api/auth/refresh", () => {
  it("issues a new accessToken when the refresh cookie is valid", async () => {
    const res = await api
      .post("/api/auth/refresh")
      .set("X-Forwarded-For", REFRESH_IP)
      .set("Cookie", refreshUser.cookie);
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("returns 401 when no refresh cookie is present", async () => {
    const res = await api.post("/api/auth/refresh").set("X-Forwarded-For", REFRESH_IP);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout  (uses writeRateLimiter, not authRateLimiter)
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  it("returns 204 and clears the refresh cookie", async () => {
    // Re-register to get a fresh refresh cookie (logout uses writeRateLimiter)
    const email = uniqueEmail();
    const reg = await api
      .post("/api/auth/register")
      .set("X-Forwarded-For", LOGOUT_IP)
      .send({ email, password: VALID_PASSWORD, displayName: "Logout User", timezone: "UTC" });
    const cookie = (reg.headers["set-cookie"] as string[]) ?? [];

    const res = await api.post("/api/auth/logout").set("Cookie", cookie);
    expect(res.status).toBe(204);
    const setCookie = [res.headers["set-cookie"]].flat().join(";");
    expect(setCookie).toMatch(/wayfinder_refresh_token/i);
  });

  it("returns 401 when there is no refresh cookie", async () => {
    const res = await api.post("/api/auth/logout");
    expect(res.status).toBe(401);
  });
});
