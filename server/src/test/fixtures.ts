import type { Experience } from "../../../shared/src/types.js";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek: dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  opensAt: "09:00",
  closesAt: "20:00",
  isClosed: false,
}));

const BASE_LOCATION = {
  type: "Point" as const,
  coordinates: [-9.1393, 38.7223] as [number, number],
  label: "Lisbon Center",
  city: "Lisbon",
  country: "Portugal",
  countryCode: "PT",
};

const BASE_ACCESSIBILITY = {
  wheelchairAccessible: true,
  stepFree: true,
  lowVisionSupport: true,
  hearingSupport: true,
  mobilityLevel: "easy" as const,
};

/** Build a fully valid Experience with sensible defaults. */
export function makeExperience(overrides: Partial<Experience> & { id: string; slug: string }): Experience {
  return {
    id: overrides.id,
    slug: overrides.slug,
    title: overrides.title ?? `Experience ${overrides.id}`,
    category: overrides.category ?? "culture",
    destinationKey: overrides.destinationKey ?? "lisbon-portugal",
    location: overrides.location ?? BASE_LOCATION,
    summary: overrides.summary ?? "A great experience",
    price: overrides.price ?? { amount: 20, currency: "EUR" },
    durationMinutes: overrides.durationMinutes ?? 90,
    tags: overrides.tags ?? ["culture"],
    openingHours: overrides.openingHours ?? ALL_DAYS,
    accessibility: overrides.accessibility ?? BASE_ACCESSIBILITY,
    supportedDietary: overrides.supportedDietary ?? [],
    preferredTransportModes: overrides.preferredTransportModes ?? ["walk", "metro"],
    isActive: overrides.isActive ?? true,
  };
}

/** Trip constraints valid for a 2-day Lisbon trip. */
export function makeConstraints(overrides: Record<string, unknown> = {}) {
  return {
    startDate: "2026-08-04",
    endDate: "2026-08-05",
    budgetCap: { amount: 300, currency: "EUR" },
    partySize: 2,
    origin: BASE_LOCATION,
    destinations: [BASE_LOCATION],
    maxDailyTravelMinutes: 120,
    mustInclude: [] as string[],
    mustAvoidTags: [] as string[],
    mobilityLimit: "unrestricted" as const,
    ...overrides,
  };
}

/** Minimal valid user registration body with a unique email. */
export function makeRegisterBody(suffix = Date.now()) {
  return {
    email: `test-${suffix}@example.com`,
    password: "SuperSecure!123",
    displayName: "Test User",
    timezone: "UTC",
  };
}

/** Valid trip creation body for the API (no candidate experiences needed for empty itinerary). */
export function makeTripBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Lisbon Weekend",
    summary: "A quick weekend trip.",
    constraints: makeConstraints(),
    ...overrides,
  };
}
