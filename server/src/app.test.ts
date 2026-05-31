import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "./app.js";

describe("GET /api/health", () => {
  it("returns the scaffold health payload", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      service: "wayfinder-server",
      status: "ok",
      realtimeTransport: "sse-or-conditional-polling",
    });
  });

  it("attaches CORS headers for an allowed browser origin", async () => {
    const response = await request(app).get("/api/health").set("Origin", "http://localhost:5173");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("answers preflight requests for allowed browser origins", async () => {
    const response = await request(app)
      .options("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
  });
});
