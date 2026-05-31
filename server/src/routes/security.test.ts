import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../middleware/database.js", () => ({
  ensureDatabaseConnection: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { default: app } = await import("../app.js");

const api = request(app);

// Test secrets match what env.ts returns when VITEST=true and the vars are unset
const TEST_ACCESS_SECRET = "test-jwt_access_secret";
const TEST_REFRESH_SECRET = "test-jwt_refresh_secret";

const VALID_LOGIN_BODY = { email: "nosql@example.com", password: "SomePassword123" };

// ---------------------------------------------------------------------------
// Expired / invalid JWT
// ---------------------------------------------------------------------------

describe("authentication – JWT validation", () => {
  it("returns 401 for a completely invalid token string", async () => {
    const res = await api.get("/api/trips/507f1f77bcf86cd799439011").set("Authorization", "Bearer this-is-not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired access token", async () => {
    const expiredToken = jwt.sign(
      { sub: "507f1f77bcf86cd799439011", type: "access", exp: Math.floor(Date.now() / 1000) - 3600 },
      TEST_ACCESS_SECRET
    );
    const res = await api.get("/api/trips/507f1f77bcf86cd799439011").set("Authorization", `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 when a refresh token is used as an access token", async () => {
    // Sign with REFRESH secret → verifyAccessToken uses ACCESS secret → verification fails
    const refreshAsAccess = jwt.sign(
      { sub: "507f1f77bcf86cd799439011", type: "refresh" },
      TEST_REFRESH_SECRET,
      { expiresIn: "7d" }
    );
    const res = await api.get("/api/trips/507f1f77bcf86cd799439011").set("Authorization", `Bearer ${refreshAsAccess}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 when the Authorization header scheme is not Bearer", async () => {
    const res = await api.get("/api/trips/507f1f77bcf86cd799439011").set("Authorization", "Basic abc123");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// NoSQL injection
// ---------------------------------------------------------------------------

describe("security – NoSQL injection prevention", () => {
  it("rejects MongoDB operator payloads in the login body with 400", async () => {
    // Sanitizer strips nested $ keys → email becomes {} → Zod fails
    const res = await api.post("/api/auth/login").send({ email: { $gt: "" }, password: "x" });
    expect(res.status).toBe(400);
  });

  it("rejects top-level $ operator keys in the request body", async () => {
    // Sanitizer strips top-level $ key → email is missing → Zod fails
    const res = await api.post("/api/auth/login").send({ $where: "true", password: "x" });
    expect(res.status).toBe(400);
  });

  it("does not return a 200 for injection attempts that bypass validation", async () => {
    const res = await api.post("/api/auth/login").send({ email: { $in: ["admin@example.com", "root@example.com"] }, password: "x" });
    expect(res.status).not.toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Password hash not leaked
// ---------------------------------------------------------------------------

describe("security – sensitive field exposure", () => {
  it("does not include passwordHash in the registration response", async () => {
    const email = `sec-${Date.now()}@example.com`;
    const res = await api.post("/api/auth/register").send({
      email,
      password: "SecureTestPassword!",
      displayName: "Sec Test",
      timezone: "UTC",
    });
    expect(res.status).toBe(201);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("refreshTokenHash");
    expect(body).not.toContain("refreshTokenExpiresAt");
  });

  it("does not include passwordHash in the login response", async () => {
    const email = `sec-login-${Date.now()}@example.com`;
    await api.post("/api/auth/register").send({
      email,
      password: "SecureTestPassword!",
      displayName: "Sec Login",
      timezone: "UTC",
    });
    const loginRes = await api.post("/api/auth/login").send({ email, password: "SecureTestPassword!" });
    const body = JSON.stringify(loginRes.body);
    expect(body).not.toContain("passwordHash");
    expect(body).not.toContain("refreshTokenHash");
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe("security – rate limiting", () => {
  // Use a unique X-Forwarded-For IP so this test's quota is isolated from others.
  // The Express app has `trust proxy: 1` so it reads X-Forwarded-For as req.ip.
  const RATE_LIMIT_IP = "10.99.88.77";

  it("returns 429 after exceeding the auth rate limit (max 10 per 15 min)", async () => {
    const attemptLogin = () =>
      api
        .post("/api/auth/login")
        .set("X-Forwarded-For", RATE_LIMIT_IP)
        .send({ email: "ratelimit@example.com", password: "badpassword" });

    // Exhaust the 10-request window
    for (let i = 0; i < 10; i++) {
      const r = await attemptLogin();
      // Each attempt fails with 401 (wrong credentials) but the counter increments
      expect([400, 401]).toContain(r.status);
    }

    // 11th request must be rate-limited
    const eleventh = await attemptLogin();
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.message).toMatch(/too many/i);
  });
});
