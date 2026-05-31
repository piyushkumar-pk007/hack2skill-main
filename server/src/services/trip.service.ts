import { Types } from "mongoose";
import type { Constraints, Experience, Preferences } from "../../../shared/src/types.js";
import { env } from "../config/env.js";
import { planItinerary } from "../engine/planner.js";
import { tooManyRequests } from "../lib/errors.js";
import { serializeForApi } from "../lib/serialize.js";
import { ExperienceModel, TripModel } from "../models/index.js";
import type { TripRuntimeRecord } from "../types/runtime.js";

const EXPERIENCE_PROJECTION = {
  slug: 1,
  title: 1,
  category: 1,
  destinationKey: 1,
  location: 1,
  summary: 1,
  price: 1,
  durationMinutes: 1,
  tags: 1,
  openingHours: 1,
  accessibility: 1,
  supportedDietary: 1,
  preferredTransportModes: 1,
  isActive: 1,
} as const;

function toDestinationKey(destination: Constraints["destinations"][number]) {
  return `${destination.city}-${destination.country}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildCandidateExperienceFilter(preferences: Preferences, constraints: Constraints) {
  const destinationKeys = constraints.destinations.map(toDestinationKey);
  const accessibilityFilters: Record<string, unknown> = {};

  if (preferences.accessibilityNeeds.includes("wheelchair")) {
    accessibilityFilters["accessibility.wheelchairAccessible"] = true;
  }
  if (preferences.accessibilityNeeds.includes("step-free")) {
    accessibilityFilters["accessibility.stepFree"] = true;
  }
  if (preferences.accessibilityNeeds.includes("low-vision")) {
    accessibilityFilters["accessibility.lowVisionSupport"] = true;
  }
  if (preferences.accessibilityNeeds.includes("hearing-support")) {
    accessibilityFilters["accessibility.hearingSupport"] = true;
  }
  if (constraints.mobilityLimit === "wheelchair-dependent") {
    accessibilityFilters["accessibility.mobilityLevel"] = "easy";
  }
  if (constraints.mobilityLimit === "limited-walking") {
    accessibilityFilters["accessibility.mobilityLevel"] = { $in: ["easy", "moderate"] };
  }

  return {
    destinationKey: { $in: destinationKeys },
    isActive: true,
    "price.currency": constraints.budgetCap.currency,
    "price.amount": { $lte: constraints.budgetCap.amount },
    ...(constraints.mustAvoidTags.length > 0 ? { tags: { $nin: constraints.mustAvoidTags.map((tag) => tag.toLowerCase()) } } : {}),
    ...accessibilityFilters,
  };
}

function normalizeExperience(experience: Record<string, unknown>): Experience {
  const serialized = serializeForApi(experience) as Record<string, unknown>;

  return {
    ...(serialized as unknown as Experience),
    id: String(serialized.id),
  };
}

export async function fetchPlannerCandidates(preferences: Preferences, constraints: Constraints): Promise<Experience[]> {
  const filter = buildCandidateExperienceFilter(preferences, constraints);

  // Verify index usage locally if needed:
  // await ExperienceModel.find(filter, EXPERIENCE_PROJECTION).explain("executionStats");
  const experiences = await ExperienceModel.find(filter, EXPERIENCE_PROJECTION)
    .sort({ updatedAt: -1 })
    .lean();

  return experiences.map((experience) => normalizeExperience(experience as Record<string, unknown>));
}

export function assertReplanNotDebounced(trip: TripRuntimeRecord) {
  const lastGeneratedAt = trip.planning.lastGeneratedAt ? new Date(trip.planning.lastGeneratedAt as string | number | Date).getTime() : 0;
  if (Date.now() - lastGeneratedAt < env.replanDebounceMs) {
    throw tooManyRequests("Trip replanning is temporarily throttled. Please wait a moment before trying again.");
  }
}

function nextSeed(currentSeed?: number) {
  return currentSeed && currentSeed > 0 ? currentSeed : Math.floor(Math.random() * 2_000_000_000) + 1;
}

export async function createPlannedTrip(input: {
  userId: string;
  title: string;
  summary?: string;
  preferences: Preferences;
  constraints: Constraints;
  seed?: number;
}) {
  const seed = nextSeed(input.seed);
  const candidates = await fetchPlannerCandidates(input.preferences, input.constraints);
  const result = planItinerary({
    preferences: input.preferences,
    constraints: input.constraints,
    candidateExperiences: candidates,
    seed,
    revision: 1,
  });

  const trip = await TripModel.create({
    userId: new Types.ObjectId(input.userId),
    title: input.title,
    summary: input.summary ?? `Auto-planned itinerary for ${input.title}`,
    status: "ready",
    preferences: input.preferences,
    constraints: input.constraints,
    itinerary: result.itinerary,
    planning: {
      isDerived: true,
      isRecomputable: true,
      engineVersion: result.engineVersion,
      generationSeed: seed,
      lastGeneratedAt: result.itinerary.generatedAt,
      candidateExperienceIds: candidates.map((experience: Experience) => new Types.ObjectId(experience.id)),
      totalScore: result.totalScore,
    },
  });

  return trip;
}

function recalculateItineraryTotals(days: Array<Record<string, unknown>>): { totalEstimatedCost: number } {
  return days.reduce<{ totalEstimatedCost: number }>(
    (accumulator, day) => {
      accumulator.totalEstimatedCost += Number(day.dailyCost ?? 0);
      return accumulator;
    },
    {
      totalEstimatedCost: 0,
    }
  );
}

export async function replanTrip(
  trip: TripRuntimeRecord,
  options?: {
    constraints?: Constraints;
    seed?: number;
    targetDayNumber?: number;
    bypassDebounce?: boolean;
  }
) {
  if (!options?.bypassDebounce) {
    assertReplanNotDebounced(trip);
  }

  if (options?.constraints) {
    trip.constraints = options.constraints as never;
  }

  const seed = nextSeed(options?.seed ?? Number(trip.planning.generationSeed));
  const candidates = await fetchPlannerCandidates(trip.preferences as unknown as Preferences, trip.constraints as unknown as Constraints);
  const nextRevision = trip.itinerary.revision + 1;
  const result = planItinerary({
    preferences: trip.preferences as unknown as Preferences,
    constraints: trip.constraints as unknown as Constraints,
    candidateExperiences: candidates,
    seed,
    revision: nextRevision,
  });

  if (options?.targetDayNumber) {
    const replacementDay = result.itinerary.days.find((day) => day.dayNumber === options.targetDayNumber);
    if (replacementDay) {
      const existingDays = serializeForApi(trip.itinerary.days) as Array<Record<string, unknown>>;
      const mergedDays = existingDays.map((day: Record<string, unknown>) =>
        Number(day.dayNumber) === options.targetDayNumber ? (replacementDay as unknown as Record<string, unknown>) : day
      );
      const totals = recalculateItineraryTotals(mergedDays);

      trip.itinerary = {
        ...trip.itinerary.toObject(),
        ...result.itinerary,
        days: mergedDays as never,
        totalEstimatedCost: totals.totalEstimatedCost,
        warnings: Array.from(
          new Set([
            ...trip.itinerary.warnings,
            ...result.itinerary.warnings,
            `Day ${options.targetDayNumber} was auto-replanned after an update event.`,
          ])
        ),
      } as never;
    } else {
      trip.itinerary = result.itinerary as never;
    }
  } else {
    trip.itinerary = result.itinerary as never;
  }

  trip.status = "ready";
  trip.planning = {
    ...trip.planning.toObject(),
    engineVersion: result.engineVersion,
    generationSeed: seed,
    lastGeneratedAt: result.itinerary.generatedAt,
    candidateExperienceIds: candidates.map((experience: Experience) => new Types.ObjectId(experience.id)),
    totalScore: result.totalScore,
  } as never;

  await trip.save();
  return trip;
}

export function serializeTripPayload(trip: unknown) {
  return serializeForApi(trip);
}

export function deriveAffectedDayNumber(trip: TripRuntimeRecord, affectedItemId: string | undefined) {
  if (!affectedItemId) {
    return null;
  }

  for (const day of trip.itinerary.days) {
    const match = day.items.find((item: { id: string }) => item.id === affectedItemId);
    if (match) {
      return day.dayNumber;
    }
  }

  return null;
}

export function eventViolatesHardConstraints(
  trip: TripRuntimeRecord,
  input: {
    type: string;
    payload: Record<string, unknown>;
    affectedItemId?: string;
  }
) {
  if (input.type === "closure") {
    return true;
  }

  if (input.type === "availability" && input.payload.available === false) {
    return true;
  }

  if (input.type === "weather" && (input.payload.closed === true || input.payload.unsafe === true || input.payload.severity === "critical")) {
    return true;
  }

  if (input.type === "delay") {
    const delayMinutes = Number(input.payload.delayMinutes ?? 0);
    return delayMinutes > trip.constraints.maxDailyTravelMinutes;
  }

  if (input.type === "priceChange") {
    const nextAmount = Number(input.payload.newAmount ?? input.payload.amount ?? 0);
    if (!Number.isFinite(nextAmount) || !input.affectedItemId) {
      return false;
    }

    for (const day of trip.itinerary.days) {
      const item = day.items.find((entry: { id: string; estimatedCost: number }) => entry.id === input.affectedItemId);
      if (!item) {
        continue;
      }

      const nextTotal = trip.itinerary.totalEstimatedCost - item.estimatedCost + nextAmount;
      return nextTotal > trip.constraints.budgetCap.amount;
    }
  }

  return false;
}
