import { Types } from "mongoose";
import { serializeForApi } from "../lib/serialize.js";
import { UpdateEventModel } from "../models/index.js";
import type { TripRuntimeRecord } from "../types/runtime.js";
import { deriveAffectedDayNumber, eventViolatesHardConstraints, replanTrip } from "./trip.service.js";

export async function createTripUpdateEvent(
  trip: TripRuntimeRecord,
  input: {
    type: "weather" | "priceChange" | "closure" | "availability" | "delay";
    affectedItemId?: string;
    payload: Record<string, unknown>;
    severity: "info" | "warning" | "critical";
  }
) {
  const shouldReplan = eventViolatesHardConstraints(trip, input);

  if (shouldReplan) {
    const affectedDayNumber = deriveAffectedDayNumber(trip, input.affectedItemId);
    await replanTrip(trip, {
      targetDayNumber: affectedDayNumber ?? undefined,
      bypassDebounce: true,
    });
  }

  const tripId = trip.id ?? String(trip._id);
  const event = await UpdateEventModel.create({
    tripId: new Types.ObjectId(tripId),
    itineraryRevision: trip.itinerary.revision,
    type: input.type,
    affectedItemId: input.affectedItemId,
    payload: input.payload,
    severity: input.severity,
    createdAt: new Date(),
  });

  return {
    event: serializeForApi(event),
    replanned: shouldReplan,
    itineraryRevision: trip.itinerary.revision,
  };
}
