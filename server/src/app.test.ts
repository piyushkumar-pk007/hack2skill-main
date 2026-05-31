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
});
