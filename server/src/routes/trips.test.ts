import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../middleware/database.js", () => ({
  ensureDatabaseConnection: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { default: app } = await import("../app.js");
const api = request(app);

// ---------------------------------------------------------------------------
// Shared state – created once in beforeAll to stay within auth rate limits.
// ---------------------------------------------------------------------------

let ownerToken: string;
let intruderToken: string;

const TRIPS_IP = "10.30.1.1";
const INTRUDER_IP = "10.30.1.2";

const VALID_PASSWORD = "SuperSecure!123";

function uniqueEmail() {
  return `trips-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
}

async function register(ip: string) {
  const res = await api
    .post("/api/auth/register")
    .set("X-Forwarded-For", ip)
    .send({ email: uniqueEmail(), password: VALID_PASSWORD, displayName: "Trip Tester", timezone: "UTC" });
  return { accessToken: res.body.accessToken as string, cookie: (res.headers["set-cookie"] as string[]) ?? [] };
}

beforeAll(async () => {
  const owner = await register(TRIPS_IP);
  ownerToken = owner.accessToken;
  const intruder = await register(INTRUDER_IP);
  intruderToken = intruder.accessToken;
});

// ---------------------------------------------------------------------------
// Shared trip body
// ---------------------------------------------------------------------------

const VALID_TRIP_BODY = {
  title: "Lisbon Weekend",
  summary: "A quick trip.",
  constraints: {
    startDate: "2026-08-04",
    endDate: "2026-08-05",
    budgetCap: { amount: 300, currency: "EUR" },
    partySize: 2,
    origin: {
      type: "Point",
      coordinates: [-9.1393, 38.7223],
      label: "Lisbon",
      city: "Lisbon",
      country: "Portugal",
      countryCode: "PT",
    },
    destinations: [
      {
        type: "Point",
        coordinates: [-9.1393, 38.7223],
        label: "Lisbon",
        city: "Lisbon",
        country: "Portugal",
        countryCode: "PT",
      },
    ],
    maxDailyTravelMinutes: 120,
    mustInclude: [],
    mustAvoidTags: [],
    mobilityLimit: "unrestricted",
  },
};

// ---------------------------------------------------------------------------
// POST /api/trips
// ---------------------------------------------------------------------------

describe("POST /api/trips", () => {
  it("creates a trip and returns 201 with trip payload", async () => {
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${ownerToken}`).send(VALID_TRIP_BODY);
    expect(res.status).toBe(201);
    expect(res.body.trip).toBeDefined();
    expect(typeof res.body.trip.id).toBe("string");
    expect(res.body.trip.title).toBe("Lisbon Weekend");
  });

  it("returns 401 when no token is provided", async () => {
    const res = await api.post("/api/trips").send(VALID_TRIP_BODY);
    expect(res.status).toBe(401);
  });

  it("returns 400 when constraints are missing from the body", async () => {
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${ownerToken}`).send({ title: "Bad Trip" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when startDate is after endDate", async () => {
    const body = {
      ...VALID_TRIP_BODY,
      constraints: { ...VALID_TRIP_BODY.constraints, startDate: "2026-08-05", endDate: "2026-08-04" },
    };
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${ownerToken}`).send(body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when partySize is zero", async () => {
    const body = { ...VALID_TRIP_BODY, constraints: { ...VALID_TRIP_BODY.constraints, partySize: 0 } };
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${ownerToken}`).send(body);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trips/:id  – ownership enforcement
// ---------------------------------------------------------------------------

describe("GET /api/trips/:id", () => {
  let tripId: string;

  beforeAll(async () => {
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${ownerToken}`).send(VALID_TRIP_BODY);
    tripId = res.body.trip.id as string;
  });

  it("returns the trip for the authenticated owner", async () => {
    const res = await api.get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.trip.id).toBe(tripId);
  });

  it("returns 404 when a different user tries to read another user's trip", async () => {
    const res = await api.get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${intruderToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 401 when no token is provided", async () => {
    const res = await api.get(`/api/trips/${tripId}`);
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed trip id (not a valid ObjectId)", async () => {
    const res = await api.get("/api/trips/not-a-valid-id").set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
  });

  it("sets Cache-Control: private on the response", async () => {
    const res = await api.get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${ownerToken}`);
    expect(res.headers["cache-control"]).toMatch(/private/);
  });
});

// ---------------------------------------------------------------------------
// POST /api/trips/:id/replan  – revision bump + ownership
// ---------------------------------------------------------------------------

describe("POST /api/trips/:id/replan", () => {
  let tripId: string;
  let initialRevision: number;

  beforeAll(async () => {
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${ownerToken}`).send(VALID_TRIP_BODY);
    tripId = res.body.trip.id as string;
    initialRevision = res.body.trip.itinerary.revision as number;
  });

  it("bumps the revision number on a successful replan", async () => {
    expect(initialRevision).toBe(1);
    const res = await api.post(`/api/trips/${tripId}/replan`).set("Authorization", `Bearer ${ownerToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.trip.itinerary.revision).toBe(2);
  });

  it("returns 404 when a non-owner attempts to replan", async () => {
    const res = await api.post(`/api/trips/${tripId}/replan`).set("Authorization", `Bearer ${intruderToken}`).send({});
    expect(res.status).toBe(404);
  });

  it("returns 401 with no token", async () => {
    const res = await api.post(`/api/trips/${tripId}/replan`).send({});
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trips/:id/events  – SSE headers
// ---------------------------------------------------------------------------

describe("GET /api/trips/:id/events (SSE)", () => {
  let tripId: string;

  beforeAll(async () => {
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${ownerToken}`).send(VALID_TRIP_BODY);
    tripId = res.body.trip.id as string;
  });

  it("returns text/event-stream with correct SSE headers", async () => {
    const req = api
      .get(`/api/trips/${tripId}/events`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .timeout(1500)
      .buffer(false);

    await new Promise<void>((resolve) => {
      req.on("response", (res) => {
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
        expect(res.headers["cache-control"]).toMatch(/no-store/);
        req.abort();
        resolve();
      });
      req.on("error", () => resolve());
      req.end();
    });
  });

  it("returns 401 when no token is provided for the SSE endpoint", async () => {
    const res = await api.get(`/api/trips/${tripId}/events`);
    expect(res.status).toBe(401);
  });
});
