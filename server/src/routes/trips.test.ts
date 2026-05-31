import { describe, expect, it, vi } from "vitest";
import request from "supertest";

// Mock the DB-connection gate so tests can connect via setup.ts directly.
vi.mock("../middleware/database.js", () => ({
  ensureDatabaseConnection: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { default: app } = await import("../app.js");

const api = request(app);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueEmail() {
  return `trips-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

const VALID_PASSWORD = "SuperSecure!123";

async function createAuthenticatedUser() {
  const email = uniqueEmail();
  const res = await api.post("/api/auth/register").send({
    email,
    password: VALID_PASSWORD,
    displayName: "Trip Tester",
    timezone: "UTC",
  });
  return {
    accessToken: res.body.accessToken as string,
    userId: res.body.user.id as string,
    cookie: (res.headers["set-cookie"] as string[]) ?? [],
  };
}

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
    const { accessToken } = await createAuthenticatedUser();
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${accessToken}`).send(VALID_TRIP_BODY);

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
    const { accessToken } = await createAuthenticatedUser();
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${accessToken}`).send({ title: "Bad Trip" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when startDate is after endDate", async () => {
    const { accessToken } = await createAuthenticatedUser();
    const body = {
      ...VALID_TRIP_BODY,
      constraints: { ...VALID_TRIP_BODY.constraints, startDate: "2026-08-05", endDate: "2026-08-04" },
    };
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${accessToken}`).send(body);
    expect(res.status).toBe(400);
  });

  it("returns 400 when partySize is zero", async () => {
    const { accessToken } = await createAuthenticatedUser();
    const body = { ...VALID_TRIP_BODY, constraints: { ...VALID_TRIP_BODY.constraints, partySize: 0 } };
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${accessToken}`).send(body);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trips/:id  – ownership enforcement
// ---------------------------------------------------------------------------

describe("GET /api/trips/:id", () => {
  it("returns the trip for the authenticated owner", async () => {
    const { accessToken } = await createAuthenticatedUser();
    const create = await api.post("/api/trips").set("Authorization", `Bearer ${accessToken}`).send(VALID_TRIP_BODY);
    const tripId = create.body.trip.id as string;

    const get = await api.get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${accessToken}`);
    expect(get.status).toBe(200);
    expect(get.body.trip.id).toBe(tripId);
  });

  it("returns 404 when a different user tries to read another user's trip", async () => {
    const owner = await createAuthenticatedUser();
    const intruder = await createAuthenticatedUser();

    const create = await api.post("/api/trips").set("Authorization", `Bearer ${owner.accessToken}`).send(VALID_TRIP_BODY);
    const tripId = create.body.trip.id as string;

    const get = await api.get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${intruder.accessToken}`);
    expect(get.status).toBe(404);
  });

  it("returns 401 when no token is provided", async () => {
    const { accessToken } = await createAuthenticatedUser();
    const create = await api.post("/api/trips").set("Authorization", `Bearer ${accessToken}`).send(VALID_TRIP_BODY);
    const tripId = create.body.trip.id as string;

    const get = await api.get(`/api/trips/${tripId}`);
    expect(get.status).toBe(401);
  });

  it("returns 400 for a malformed trip id (not a valid ObjectId)", async () => {
    const { accessToken } = await createAuthenticatedUser();
    const get = await api.get("/api/trips/not-a-valid-id").set("Authorization", `Bearer ${accessToken}`);
    expect(get.status).toBe(400);
  });

  it("sets Cache-Control: private on the response", async () => {
    const { accessToken } = await createAuthenticatedUser();
    const create = await api.post("/api/trips").set("Authorization", `Bearer ${accessToken}`).send(VALID_TRIP_BODY);
    const tripId = create.body.trip.id as string;

    const get = await api.get(`/api/trips/${tripId}`).set("Authorization", `Bearer ${accessToken}`);
    expect(get.headers["cache-control"]).toMatch(/private/);
  });
});

// ---------------------------------------------------------------------------
// POST /api/trips/:id/replan  – revision bump + ownership
// ---------------------------------------------------------------------------

describe("POST /api/trips/:id/replan", () => {
  async function createTrip(accessToken: string) {
    const res = await api.post("/api/trips").set("Authorization", `Bearer ${accessToken}`).send(VALID_TRIP_BODY);
    return res.body.trip as { id: string; itinerary: { revision: number } };
  }

  it("bumps the revision number on a successful replan", async () => {
    const { accessToken } = await createAuthenticatedUser();
    const trip = await createTrip(accessToken);
    expect(trip.itinerary.revision).toBe(1);

    const replan = await api
      .post(`/api/trips/${trip.id}/replan`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(replan.status).toBe(200);
    expect(replan.body.trip.itinerary.revision).toBe(2);
  });

  it("returns 404 when a non-owner attempts to replan", async () => {
    const owner = await createAuthenticatedUser();
    const intruder = await createAuthenticatedUser();

    const trip = await createTrip(owner.accessToken);

    const res = await api
      .post(`/api/trips/${trip.id}/replan`)
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it("returns 401 with no token", async () => {
    const { accessToken } = await createAuthenticatedUser();
    const trip = await createTrip(accessToken);

    const res = await api.post(`/api/trips/${trip.id}/replan`).send({});
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/trips/:id/events  – SSE headers
// ---------------------------------------------------------------------------

describe("GET /api/trips/:id/events (SSE)", () => {
  it("returns text/event-stream with correct SSE headers", async () => {
    const { accessToken } = await createAuthenticatedUser();
    const create = await api.post("/api/trips").set("Authorization", `Bearer ${accessToken}`).send(VALID_TRIP_BODY);
    const tripId = create.body.trip.id as string;

    // Open the SSE stream but abort immediately so the test doesn't hang
    const req = api.get(`/api/trips/${tripId}/events`).set("Authorization", `Bearer ${accessToken}`).timeout(1500).buffer(false);

    await new Promise<void>((resolve) => {
      req.on("response", (res) => {
        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
        expect(res.headers["cache-control"]).toMatch(/no-store/);
        req.abort();
        resolve();
      });
      req.on("error", () => resolve()); // Ignore abort errors
      req.end();
    });
  });

  it("returns 401 when no token is provided for the SSE endpoint", async () => {
    const { accessToken } = await createAuthenticatedUser();
    const create = await api.post("/api/trips").set("Authorization", `Bearer ${accessToken}`).send(VALID_TRIP_BODY);
    const tripId = create.body.trip.id as string;

    const res = await api.get(`/api/trips/${tripId}/events`);
    expect(res.status).toBe(401);
  });
});
