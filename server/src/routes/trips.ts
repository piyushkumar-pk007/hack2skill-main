import { Router } from "express";
import { Types } from "mongoose";
import { env } from "../config/env.js";
import { asyncRoute } from "../lib/async-route.js";
import { notFound } from "../lib/errors.js";
import { sendConditionalJson } from "../lib/http-cache.js";
import { serializeForApi } from "../lib/serialize.js";
import { requireAdminApiKey } from "../middleware/admin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireOwnedTripDocument } from "../middleware/ownership.js";
import { writeRateLimiter } from "../middleware/rate-limit.js";
import { validateRequest } from "../middleware/validate.js";
import { TripModel, UpdateEventModel, UserModel } from "../models/index.js";
import { createPlannedTrip, replanTrip, serializeTripPayload } from "../services/trip.service.js";
import { createTripUpdateEvent } from "../services/update-event.service.js";
import { createTripBodySchema, createUpdateEventBodySchema, objectIdParamSchema, replanTripBodySchema, sseEventsQuerySchema } from "../validators/common.js";

const tripsRouter = Router();

tripsRouter.post(
  "/trips",
  requireAuth,
  writeRateLimiter,
  validateRequest({ body: createTripBodySchema }),
  asyncRoute(async (req, res) => {
    const user = await UserModel.findById(req.auth!.userId, { preferences: 1 }).lean();
    if (!user) {
      throw notFound("User not found.");
    }

    const trip = await createPlannedTrip({
      userId: req.auth!.userId,
      title: req.body.title,
      summary: req.body.summary,
      preferences: serializeForApi(user.preferences) as never,
      constraints: req.body.constraints,
      seed: req.body.seed,
    });

    res.status(201).json({
      trip: serializeTripPayload(trip),
    });
  })
);

tripsRouter.get(
  "/trips/:id",
  requireAuth,
  validateRequest({ params: objectIdParamSchema }),
  asyncRoute(async (req, res) => {
    // Verify index usage locally if needed:
    // await TripModel.find({ userId: req.auth!.userId }).sort({ createdAt: -1 }).explain("executionStats");
    const trip = await TripModel.findOne(
      {
        _id: new Types.ObjectId(String(req.params.id)),
        userId: new Types.ObjectId(req.auth!.userId),
      },
      {
        userId: 1,
        title: 1,
        status: 1,
        summary: 1,
        preferences: 1,
        constraints: 1,
        itinerary: 1,
        planning: 1,
        createdAt: 1,
        updatedAt: 1,
      }
    ).lean();

    if (!trip) {
      throw notFound("Trip not found.");
    }

    sendConditionalJson(
      req,
      res,
      {
        trip: serializeForApi(trip),
      },
      {
        cacheControl: "private, max-age=0, must-revalidate",
        etagSeed: `${trip.updatedAt instanceof Date ? trip.updatedAt.toISOString() : req.params.id}:${trip.itinerary.revision}`,
      }
    );
  })
);

tripsRouter.post(
  "/trips/:id/replan",
  requireAuth,
  writeRateLimiter,
  validateRequest({ params: objectIdParamSchema, body: replanTripBodySchema }),
  requireOwnedTripDocument,
  asyncRoute(async (req, res) => {
    const trip = await replanTrip(req.tripDocument!, {
      constraints: req.body.constraints,
      seed: req.body.seed,
      targetDayNumber: req.body.targetDayNumber,
    });

    res.json({
      trip: serializeTripPayload(trip),
      replannedAt: trip.planning.lastGeneratedAt,
      debounceWindowMs: env.replanDebounceMs,
    });
  })
);

tripsRouter.get(
  "/trips/:id/events",
  requireAuth,
  validateRequest({ params: objectIdParamSchema, query: sseEventsQuerySchema }),
  requireOwnedTripDocument,
  asyncRoute(async (req, res) => {
    const tripId = req.tripDocument!.id;
    const lastEventIdHeader = req.header("last-event-id");
    const querySince = req.query.since;
    let cursorId = typeof lastEventIdHeader === "string" && /^[a-f0-9]{24}$/i.test(lastEventIdHeader) ? lastEventIdHeader : null;
    let closed = false;

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const writeEvent = (eventName: string, payload: unknown, id?: string) => {
      if (id) {
        res.write(`id: ${id}\n`);
      }
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const initialFilter: Record<string, unknown> = { tripId: new Types.ObjectId(tripId) };
    if (cursorId) {
      initialFilter._id = { $gt: new Types.ObjectId(cursorId) };
    } else if (typeof querySince === "string" && querySince.trim() !== "") {
      initialFilter.createdAt = { $gte: new Date(querySince) };
    }

    const initialEvents = await UpdateEventModel.find(initialFilter).sort({ createdAt: 1 }).limit(20).lean();
    writeEvent("connected", { tripId, itineraryRevision: req.tripDocument!.itinerary.revision });

    for (const event of initialEvents) {
      const payload = serializeForApi(event);
      const id = String((payload as Record<string, unknown>).id);
      writeEvent("update", payload, id);
      cursorId = id;
    }

    const poll = setInterval(async () => {
      if (closed) {
        return;
      }

      try {
        const filter: Record<string, unknown> = {
          tripId: new Types.ObjectId(tripId),
        };
        if (cursorId) {
          filter._id = { $gt: new Types.ObjectId(cursorId) };
        }

        const events = await UpdateEventModel.find(filter).sort({ createdAt: 1 }).limit(25).lean();
        for (const event of events) {
          const payload = serializeForApi(event);
          const id = String((payload as Record<string, unknown>).id);
          writeEvent("update", payload, id);
          cursorId = id;
        }

        if (events.length === 0) {
          res.write('event: heartbeat\ndata: {"ok":true}\n\n');
        }
      } catch {
        writeEvent("error", { message: "SSE polling failed." });
      }
    }, 3_000);

    req.on("close", () => {
      closed = true;
      clearInterval(poll);
      res.end();
    });
  })
);

tripsRouter.post(
  "/trips/:id/events",
  requireAuth,
  writeRateLimiter,
  requireAdminApiKey,
  validateRequest({ params: objectIdParamSchema, body: createUpdateEventBodySchema }),
  requireOwnedTripDocument,
  asyncRoute(async (req, res) => {
    const result = await createTripUpdateEvent(req.tripDocument!, req.body);

    res.status(201).json({
      ...result,
      tripId: req.tripDocument!.id,
    });
  })
);

export default tripsRouter;
