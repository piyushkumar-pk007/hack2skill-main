import { z } from "zod";

const experienceCategoryValues = [
  "culture",
  "food",
  "nature",
  "nightlife",
  "wellness",
  "adventure",
  "family",
  "shopping",
  "history",
] as const;
const tripPaceValues = ["relaxed", "balanced", "packed"] as const;
const travelStyleValues = ["budget", "comfort", "luxury"] as const;
const dietaryValues = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "pescatarian",
] as const;
const accessibilityValues = [
  "wheelchair",
  "step-free",
  "low-vision",
  "hearing-support",
  "sensory-friendly",
] as const;
const transportValues = [
  "walk",
  "tram",
  "metro",
  "bus",
  "train",
  "taxi",
  "ferry",
  "rideshare",
  "bike",
] as const;
const mobilityValues = ["unrestricted", "limited-walking", "wheelchair-dependent"] as const;
const updateTypeValues = ["weather", "priceChange", "closure", "availability", "delay"] as const;
const updateSeverityValues = ["info", "warning", "critical"] as const;

const coordinateSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const objectIdParamSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid resource id."),
  })
  .strict();

export const geoPointSchema = z
  .object({
    type: z.literal("Point"),
    coordinates: coordinateSchema,
    label: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(80),
    country: z.string().trim().min(1).max(80),
    countryCode: z.string().trim().toUpperCase().min(2).max(3).optional(),
  })
  .strict();

export const preferencesSchema = z
  .object({
    interests: z.array(z.enum(experienceCategoryValues)).min(1),
    pace: z.enum(tripPaceValues),
    travelStyle: z.enum(travelStyleValues),
    dietary: z.array(z.enum(dietaryValues)),
    accessibilityNeeds: z.array(z.enum(accessibilityValues)),
    preferredTransport: z.array(z.enum(transportValues)).min(1),
  })
  .strict();

export const constraintsSchema = z
  .object({
    startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    budgetCap: z
      .object({
        amount: z.number().nonnegative(),
        currency: z.string().trim().toUpperCase().length(3),
      })
      .strict(),
    partySize: z.number().int().min(1).max(30),
    origin: geoPointSchema,
    destinations: z.array(geoPointSchema).min(1),
    maxDailyTravelMinutes: z.number().int().min(0).max(1440),
    mustInclude: z.array(z.string().trim().min(1).max(80)),
    mustAvoidTags: z.array(z.string().trim().min(1).max(40)),
    mobilityLimit: z.enum(mobilityValues),
  })
  .strict()
  .refine((value) => new Date(value.startDate).getTime() <= new Date(value.endDate).getTime(), {
    message: "endDate must be on or after startDate.",
    path: ["endDate"],
  });

export const registerBodySchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(10).max(128),
    displayName: z.string().trim().min(2).max(120),
    timezone: z.string().trim().min(2).max(64),
    homeBase: geoPointSchema.optional(),
    preferences: preferencesSchema.optional(),
  })
  .strict();

export const loginBodySchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(1).max(128),
  })
  .strict();

export const preferencesBodySchema = z
  .object({
    preferences: preferencesSchema,
  })
  .strict();

export const createTripBodySchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    summary: z.string().trim().min(2).max(500).optional(),
    constraints: constraintsSchema,
    seed: z.number().int().min(1).max(2_147_483_647).optional(),
  })
  .strict();

export const replanTripBodySchema = z
  .object({
    constraints: constraintsSchema.optional(),
    seed: z.number().int().min(1).max(2_147_483_647).optional(),
    targetDayNumber: z.number().int().min(1).optional(),
  })
  .strict();

export const createUpdateEventBodySchema = z
  .object({
    type: z.enum(updateTypeValues),
    affectedItemId: z.string().trim().min(1).max(120).optional(),
    payload: z.record(z.unknown()).default({}),
    severity: z.enum(updateSeverityValues),
  })
  .strict();

function csvArray(value: unknown): string[] | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function booleanQuery(value: unknown): boolean | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

export const experiencesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(12),
    destinationKey: z.string().trim().toLowerCase().max(80).optional(),
    category: z.enum(experienceCategoryValues).optional(),
    tags: z.preprocess(csvArray, z.array(z.string().trim().toLowerCase().min(1)).optional()),
    maxPrice: z.coerce.number().nonnegative().optional(),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    transport: z.enum(transportValues).optional(),
    accessibleOnly: z.preprocess(booleanQuery, z.boolean().optional()),
    sort: z.enum(["updatedDesc", "priceAsc", "priceDesc", "durationAsc"]).default("updatedDesc"),
  })
  .strict();

export const sseEventsQuerySchema = z
  .object({
    since: z.string().datetime({ offset: true }).optional(),
    accessToken: z.string().min(1).optional(),
  })
  .strict();
