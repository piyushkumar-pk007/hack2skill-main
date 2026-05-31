import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

// Mock the DB-connection gate so tests can connect via setup.ts directly.
vi.mock("../middleware/database.js", () => ({
  ensureDatabaseConnection: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Import app AFTER mocks are hoisted.
const { default: app } = await import("../app.js");

const api = request(app);

function uniqueEmail() {
  return `auth-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const VALID_PASSWORD = "SuperSecure!123";

async function registerUser(email = uniqueEmail()) {
  const res = await api.post("/api/auth/register").send({
    email,
    password: VALID_PASSWORD,
    displayName: "Test User",
    timezone: "UTC",
  });
  return { res, email };
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------

describe("POST /api/auth/register", () => {
  it("returns 201 with accessToken and user on valid body", async () => {
    const { res } = await registerUser();
    expect(res.status).toBe(201);
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.user).toBeDefined();
    expect(res.body.expiresInMinutes).toBeTypeOf("number");
  });

  it("does not expose passwordHash or refreshTokenHash in the response", async () => {
    const { res } = await registerUser();
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("refreshTokenHash");
  });

  it("sets a httpOnly refresh-token cookie", async () => {
    const { res } = await registerUser();
    const setCookie = res.headers["set-cookie"] as string[] | string | undefined;
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(";") : (setCookie ?? "");
    expect(cookieStr).toMatch(/wayfinder_refresh_token/i);
    expect(cookieStr).toMatch(/HttpOnly/i);
  });

  it("returns 400 when email is already taken", async () => {
    const email = uniqueEmail();
    await registerUser(email);
    const second = await api.post("/api/auth/register").send({
      email,
      password: VALID_PASSWORD,
      displayName: "Duplicate",
      timezone: "UTC",
    });
    expect(second.status).toBe(400);
  });

  it("returns 400 when the body fails schema validation (missing password)", async () => {
    const res = await api.post("/api/auth/register").send({
      email: uniqueEmail(),
      displayName: "No Password",
      timezone: "UTC",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("bad_request");
  });

  it("returns 400 when password is too short (< 10 chars)", async () => {
    const res = await api.post("/api/auth/register").send({
      email: uniqueEmail(),
      password: "short",
      displayName: "Test",
      timezone: "UTC",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid email format", async () => {
    const res = await api.post("/api/auth/register").send({
      email: "not-an-email",
      password: VALID_PASSWORD,
      displayName: "Test",
      timezone: "UTC",
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  it("returns 200 with a valid accessToken for correct credentials", async () => {
    const email = uniqueEmail();
    await registerUser(email);
    const res = await api.post("/api/auth/login").send({ email, password: VALID_PASSWORD });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("returns 401 for a wrong password", async () => {
    const email = uniqueEmail();
    await registerUser(email);
    const res = await api.post("/api/auth/login").send({ email, password: "WrongPassword1!" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a non-existent email", async () => {
    const res = await api.post("/api/auth/login").send({ email: "nobody@example.com", password: VALID_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("returns 400 when email is missing from body", async () => {
    const res = await api.post("/api/auth/login").send({ password: VALID_PASSWORD });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------

describe("POST /api/auth/refresh", () => {
  it("issues a new accessToken when the refresh cookie is valid", async () => {
    const email = uniqueEmail();
    const { res: reg } = await registerUser(email);
    const cookie = (reg.headers["set-cookie"] as string[]) ?? [];

    const refresh = await api.post("/api/auth/refresh").set("Cookie", cookie);
    expect(refresh.status).toBe(200);
    expect(typeof refresh.body.accessToken).toBe("string");
  });

  it("returns 401 when no refresh cookie is present", async () => {
    const res = await api.post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  it("returns 204 and clears the refresh cookie", async () => {
    const { res: reg } = await registerUser();
    const cookie = (reg.headers["set-cookie"] as string[]) ?? [];

    const logout = await api.post("/api/auth/logout").set("Cookie", cookie);
    expect(logout.status).toBe(204);
    const setCookie = logout.headers["set-cookie"] as string[] | undefined;
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(";") : "";
    // The refresh cookie should be cleared (expires in the past or Max-Age=0)
    expect(cookieStr).toMatch(/wayfinder_refresh_token/i);
  });

  it("returns 401 when there is no refresh cookie", async () => {
    const res = await api.post("/api/auth/logout");
    expect(res.status).toBe(401);
  });
});
