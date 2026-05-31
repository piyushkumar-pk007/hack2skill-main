import type { Constraints, Experience, Preferences } from "../../../shared/src/types.js";
import { describe, expect, it } from "vitest";
import { makeConstraints, makeExperience } from "../test/fixtures.js";
import { planItinerary } from "./planner.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const basePreferences: Preferences = {
  interests: ["culture", "food"],
  pace: "balanced",
  travelStyle: "comfort",
  dietary: ["vegetarian"],
  accessibilityNeeds: [],
  preferredTransport: ["walk", "metro"],
};

const baseConstraints: Constraints = makeConstraints() as unknown as Constraints;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek: dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  opensAt: "09:00",
  closesAt: "20:00",
  isClosed: false,
}));

function makePool(count: number, overrides: Partial<Experience> = {}): Experience[] {
  return Array.from({ length: count }, (_, i) =>
    makeExperience({ id: `exp-${i + 1}`, slug: `experience-${i + 1}`, ...overrides })
  );
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("produces identical output for the same seed and inputs", () => {
    const candidateExperiences = makePool(6);
    const a = planItinerary({ preferences: basePreferences, constraints: baseConstraints, candidateExperiences, seed: 42 });
    const b = planItinerary({ preferences: basePreferences, constraints: baseConstraints, candidateExperiences, seed: 42 });
    expect(a).toEqual(b);
  });

  it("produces a different ordering with a different seed", () => {
    const candidateExperiences = makePool(8);
    const a = planItinerary({ preferences: basePreferences, constraints: baseConstraints, candidateExperiences, seed: 1 });
    const b = planItinerary({ preferences: basePreferences, constraints: baseConstraints, candidateExperiences, seed: 999 });
    // At least one day may differ (not guaranteed but overwhelmingly likely with 8 candidates)
    const idsA = a.selectedExperienceIds.join(",");
    const idsB = b.selectedExperienceIds.join(",");
    expect(idsA).not.toBe(idsB);
  });
});

// ---------------------------------------------------------------------------
// Hard constraint: budget cap
// ---------------------------------------------------------------------------

describe("hard filter – budget cap", () => {
  it("rejects an experience whose per-party cost exceeds the budget cap", () => {
    // budgetCap = 300, partySize = 2 → per-party threshold = 150 per experience
    const expensive = makeExperience({
      id: "expensive-1",
      slug: "expensive-experience",
      price: { amount: 200, currency: "EUR" }, // 200 * 2 = 400 > 300 budget
    });
    const affordable = makeExperience({
      id: "cheap-1",
      slug: "affordable-experience",
      price: { amount: 10, currency: "EUR" },
    });

    const result = planItinerary({
      preferences: basePreferences,
      constraints: baseConstraints,
      candidateExperiences: [expensive, affordable],
      seed: 1,
    });

    expect(result.itinerary.hardFilterSummary.rejectedByBudget).toBe(1);
    expect(result.selectedExperienceIds).not.toContain("expensive-1");
    expect(result.selectedExperienceIds).toContain("cheap-1");
  });

  it("never lets total itinerary cost exceed the budget cap", () => {
    const candidates = makePool(10, { price: { amount: 40, currency: "EUR" } }); // 40*2=80 per exp
    const result = planItinerary({
      preferences: basePreferences,
      constraints: { ...baseConstraints, budgetCap: { amount: 200, currency: "EUR" }, partySize: 2 } as Constraints,
      candidateExperiences: candidates,
      seed: 1,
    });
    expect(result.itinerary.totalEstimatedCost).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// Hard constraint: date availability
// ---------------------------------------------------------------------------

describe("hard filter – date availability", () => {
  it("rejects an experience that is closed on every trip day", () => {
    // Trip: 2026-08-04 (Tue=2), 2026-08-05 (Wed=3)
    // Experience open only on Sunday (0) → always closed during trip
    const closedExp = makeExperience({
      id: "closed-exp",
      slug: "sunday-only",
      openingHours: [
        { dayOfWeek: 0, opensAt: "10:00", closesAt: "18:00", isClosed: false },
        { dayOfWeek: 1, isClosed: true },
        { dayOfWeek: 2, isClosed: true },
        { dayOfWeek: 3, isClosed: true },
        { dayOfWeek: 4, isClosed: true },
        { dayOfWeek: 5, isClosed: true },
        { dayOfWeek: 6, isClosed: true },
      ],
    });
    const openExp = makeExperience({ id: "open-exp", slug: "always-open" });

    const result = planItinerary({
      preferences: basePreferences,
      constraints: baseConstraints,
      candidateExperiences: [closedExp, openExp],
      seed: 1,
    });

    expect(result.itinerary.hardFilterSummary.rejectedByDate).toBeGreaterThanOrEqual(1);
    expect(result.selectedExperienceIds).not.toContain("closed-exp");
  });

  it("rejects an inactive experience", () => {
    const inactive = makeExperience({ id: "inactive-exp", slug: "inactive", isActive: false });
    const active = makeExperience({ id: "active-exp", slug: "active" });

    const result = planItinerary({
      preferences: basePreferences,
      constraints: baseConstraints,
      candidateExperiences: [inactive, active],
      seed: 1,
    });

    expect(result.selectedExperienceIds).not.toContain("inactive-exp");
    expect(result.selectedExperienceIds).toContain("active-exp");
  });
});

// ---------------------------------------------------------------------------
// Hard constraint: accessibility
// ---------------------------------------------------------------------------

describe("hard filter – accessibility", () => {
  it("excludes experiences lacking wheelchair access when wheelchair is required", () => {
    const noWheelchair = makeExperience({
      id: "no-wheel",
      slug: "no-wheelchair",
      accessibility: { wheelchairAccessible: false, stepFree: true, lowVisionSupport: false, hearingSupport: false, mobilityLevel: "easy" },
    });
    const fullAccess = makeExperience({ id: "full", slug: "full-access" });

    const result = planItinerary({
      preferences: { ...basePreferences, accessibilityNeeds: ["wheelchair"] },
      constraints: baseConstraints,
      candidateExperiences: [noWheelchair, fullAccess],
      seed: 1,
    });

    expect(result.itinerary.hardFilterSummary.rejectedByAccessibility).toBe(1);
    expect(result.selectedExperienceIds).not.toContain("no-wheel");
  });

  it("excludes experiences lacking step-free access when step-free is required", () => {
    const hasStairs = makeExperience({
      id: "stairs",
      slug: "has-stairs",
      accessibility: { wheelchairAccessible: true, stepFree: false, lowVisionSupport: false, hearingSupport: false, mobilityLevel: "easy" },
    });
    const stepFree = makeExperience({ id: "step-free-exp", slug: "step-free" });

    const result = planItinerary({
      preferences: { ...basePreferences, accessibilityNeeds: ["step-free"] },
      constraints: baseConstraints,
      candidateExperiences: [hasStairs, stepFree],
      seed: 1,
    });

    expect(result.itinerary.hardFilterSummary.rejectedByAccessibility).toBe(1);
    expect(result.selectedExperienceIds).not.toContain("stairs");
  });

  it("includes experiences when no accessibility needs are specified", () => {
    const anyAccess = makeExperience({
      id: "any",
      slug: "any-access",
      accessibility: { wheelchairAccessible: false, stepFree: false, lowVisionSupport: false, hearingSupport: false, mobilityLevel: "demanding" },
    });

    const result = planItinerary({
      preferences: { ...basePreferences, accessibilityNeeds: [] },
      constraints: baseConstraints,
      candidateExperiences: [anyAccess],
      seed: 1,
    });

    expect(result.itinerary.hardFilterSummary.rejectedByAccessibility).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Hard constraint: mustAvoidTags
// ---------------------------------------------------------------------------

describe("hard filter – mustAvoidTags", () => {
  it("rejects experiences containing a mustAvoidTag", () => {
    const taggedExp = makeExperience({
      id: "tagged",
      slug: "has-bad-tag",
      tags: ["culture", "stairs-only"],
    });
    const cleanExp = makeExperience({ id: "clean", slug: "no-bad-tag", tags: ["culture"] });

    const result = planItinerary({
      preferences: basePreferences,
      constraints: { ...baseConstraints, mustAvoidTags: ["stairs-only"] } as Constraints,
      candidateExperiences: [taggedExp, cleanExp],
      seed: 1,
    });

    expect(result.itinerary.hardFilterSummary.rejectedByTags).toBe(1);
    expect(result.selectedExperienceIds).not.toContain("tagged");
    expect(result.selectedExperienceIds).toContain("clean");
  });

  it("performs case-insensitive tag matching", () => {
    const exp = makeExperience({ id: "upper", slug: "upper-tag", tags: ["Stairs-Only"] });

    const result = planItinerary({
      preferences: basePreferences,
      constraints: { ...baseConstraints, mustAvoidTags: ["stairs-only"] } as Constraints,
      candidateExperiences: [exp],
      seed: 1,
    });

    expect(result.itinerary.hardFilterSummary.rejectedByTags).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Hard constraint: mobility limit
// ---------------------------------------------------------------------------

describe("hard filter – mobility limit", () => {
  it("rejects demanding experiences for limited-walking constraint", () => {
    const demanding = makeExperience({
      id: "demand",
      slug: "demanding-trail",
      accessibility: { wheelchairAccessible: false, stepFree: false, lowVisionSupport: false, hearingSupport: false, mobilityLevel: "demanding" },
    });
    const easy = makeExperience({ id: "easy-exp", slug: "easy-walk" });

    const result = planItinerary({
      preferences: basePreferences,
      constraints: { ...baseConstraints, mobilityLimit: "limited-walking" } as Constraints,
      candidateExperiences: [demanding, easy],
      seed: 1,
    });

    expect(result.itinerary.hardFilterSummary.rejectedByMobility).toBe(1);
    expect(result.selectedExperienceIds).not.toContain("demand");
  });

  it("rejects non-easy experiences for wheelchair-dependent constraint", () => {
    const moderate = makeExperience({
      id: "moderate-exp",
      slug: "moderate-walk",
      accessibility: { wheelchairAccessible: true, stepFree: true, lowVisionSupport: false, hearingSupport: false, mobilityLevel: "moderate" },
    });
    const easyWheelchair = makeExperience({
      id: "easy-wheel",
      slug: "easy-wheelchair",
      accessibility: { wheelchairAccessible: true, stepFree: true, lowVisionSupport: false, hearingSupport: false, mobilityLevel: "easy" },
    });

    const result = planItinerary({
      preferences: basePreferences,
      constraints: { ...baseConstraints, mobilityLimit: "wheelchair-dependent" } as Constraints,
      candidateExperiences: [moderate, easyWheelchair],
      seed: 1,
    });

    expect(result.itinerary.hardFilterSummary.rejectedByMobility).toBe(1);
    expect(result.selectedExperienceIds).not.toContain("moderate-exp");
    expect(result.selectedExperienceIds).toContain("easy-wheel");
  });
});

// ---------------------------------------------------------------------------
// Pace: item count per day
// ---------------------------------------------------------------------------

describe("pace – items per day", () => {
  const LOTS_OF_EXPERIENCES = makePool(12);

  it("relaxed pace caps items at 2 per day", () => {
    const result = planItinerary({
      preferences: { ...basePreferences, pace: "relaxed" },
      constraints: baseConstraints,
      candidateExperiences: LOTS_OF_EXPERIENCES,
      seed: 1,
    });
    for (const day of result.itinerary.days) {
      expect(day.items.length).toBeLessThanOrEqual(2);
    }
    expect(result.selectedExperienceIds.length).toBeGreaterThan(0);
  });

  it("balanced pace caps items at 3 per day", () => {
    const result = planItinerary({
      preferences: { ...basePreferences, pace: "balanced" },
      constraints: baseConstraints,
      candidateExperiences: LOTS_OF_EXPERIENCES,
      seed: 1,
    });
    for (const day of result.itinerary.days) {
      expect(day.items.length).toBeLessThanOrEqual(3);
    }
  });

  it("packed pace caps items at 4 per day", () => {
    const result = planItinerary({
      preferences: { ...basePreferences, pace: "packed" },
      constraints: baseConstraints,
      candidateExperiences: LOTS_OF_EXPERIENCES,
      seed: 1,
    });
    for (const day of result.itinerary.days) {
      expect(day.items.length).toBeLessThanOrEqual(4);
    }
  });

  it("relaxed pace selects fewer total experiences than packed pace (same pool)", () => {
    const relaxed = planItinerary({
      preferences: { ...basePreferences, pace: "relaxed" },
      constraints: baseConstraints,
      candidateExperiences: LOTS_OF_EXPERIENCES,
      seed: 1,
    });
    const packed = planItinerary({
      preferences: { ...basePreferences, pace: "packed" },
      constraints: baseConstraints,
      candidateExperiences: LOTS_OF_EXPERIENCES,
      seed: 1,
    });
    expect(relaxed.selectedExperienceIds.length).toBeLessThanOrEqual(packed.selectedExperienceIds.length);
  });
});

// ---------------------------------------------------------------------------
// Must-include scoring
// ---------------------------------------------------------------------------

describe("mustInclude scoring", () => {
  it("prioritises must-include experiences by boosting their score to the top", () => {
    const mustHave = makeExperience({
      id: "must-exp",
      slug: "museum-tour",
      title: "Museum Tour",
      category: "culture",
      tags: ["museum"],
    });
    const regularPool = makePool(5);

    const result = planItinerary({
      preferences: basePreferences,
      constraints: { ...baseConstraints, mustInclude: ["museum"] } as Constraints,
      candidateExperiences: [mustHave, ...regularPool],
      seed: 1,
    });

    expect(result.selectedExperienceIds).toContain("must-exp");
    const item = result.itinerary.days.flatMap((d) => d.items).find((i) => i.experienceId === "must-exp");
    expect(item?.notes).toMatch(/must-include/i);
  });

  it("warns when a must-include token cannot be satisfied", () => {
    const result = planItinerary({
      preferences: basePreferences,
      constraints: { ...baseConstraints, mustInclude: ["opera-house"] } as Constraints,
      candidateExperiences: makePool(3),
      seed: 1,
    });

    expect(result.itinerary.hardFilterSummary.missingMustInclude).toContain("opera-house");
    expect(result.itinerary.warnings.some((w) => w.includes("mustInclude"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty candidates
// ---------------------------------------------------------------------------

describe("empty / zero-candidate scenarios", () => {
  it("returns an empty itinerary with a warning when no candidates are provided", () => {
    const result = planItinerary({
      preferences: basePreferences,
      constraints: baseConstraints,
      candidateExperiences: [],
      seed: 1,
    });

    expect(result.selectedExperienceIds).toHaveLength(0);
    expect(result.itinerary.days.every((d) => d.items.length === 0)).toBe(true);
    expect(result.itinerary.warnings.length).toBeGreaterThan(0);
  });

  it("returns revision and engineVersion even for empty runs", () => {
    const result = planItinerary({
      preferences: basePreferences,
      constraints: baseConstraints,
      candidateExperiences: [],
      seed: 7,
      revision: 3,
    });

    expect(result.itinerary.revision).toBe(3);
    expect(result.engineVersion).toBe("1.0.0");
  });
});

// ---------------------------------------------------------------------------
// Item IDs and revision tracking
// ---------------------------------------------------------------------------

describe("revision and item ids", () => {
  it("generates item ids scoped to the given revision", () => {
    const result = planItinerary({
      preferences: basePreferences,
      constraints: baseConstraints,
      candidateExperiences: makePool(4),
      seed: 1,
      revision: 5,
    });

    const items = result.itinerary.days.flatMap((d) => d.items);
    for (const item of items) {
      expect(item.id).toMatch(/^item-5-/);
    }
  });
});

// ---------------------------------------------------------------------------
// Legacy tests (kept from the original file)
// ---------------------------------------------------------------------------

const legacyDailyHours = ALL_DAYS;

const legacyExperiences: Experience[] = [
  makeExperience({
    id: "exp-1",
    slug: "city-history-museum",
    title: "City History Museum",
    category: "history",
    price: { amount: 20, currency: "EUR" },
    durationMinutes: 120,
    tags: ["museum", "culture", "tram"],
    openingHours: legacyDailyHours,
    accessibility: { wheelchairAccessible: true, stepFree: true, lowVisionSupport: true, hearingSupport: true, mobilityLevel: "easy" },
    preferredTransportModes: ["walk", "metro"],
  }),
  makeExperience({
    id: "exp-2",
    slug: "vegetarian-market-lunch",
    title: "Vegetarian Market Lunch",
    category: "food",
    price: { amount: 18, currency: "EUR" },
    durationMinutes: 75,
    tags: ["food", "local", "market"],
    openingHours: legacyDailyHours,
    accessibility: { wheelchairAccessible: true, stepFree: true, lowVisionSupport: false, hearingSupport: false, mobilityLevel: "easy" },
    supportedDietary: ["vegetarian", "vegan"],
    preferredTransportModes: ["walk"],
  }),
  makeExperience({
    id: "exp-3",
    slug: "hilltop-lookout",
    title: "Hilltop Lookout",
    category: "nature",
    price: { amount: 5, currency: "EUR" },
    durationMinutes: 60,
    tags: ["viewpoint", "stairs-only"],
    openingHours: legacyDailyHours,
    accessibility: { wheelchairAccessible: false, stepFree: false, lowVisionSupport: false, hearingSupport: false, mobilityLevel: "demanding" },
    preferredTransportModes: ["walk"],
  }),
];

const legacyConstraints: Constraints = {
  startDate: "2026-06-10",
  endDate: "2026-06-12",
  budgetCap: { amount: 240, currency: "EUR" },
  partySize: 2,
  origin: { type: "Point", coordinates: [-9.142685, 38.736946], label: "Lisbon Airport", city: "Lisbon", country: "Portugal", countryCode: "PT" },
  destinations: [{ type: "Point", coordinates: [-9.139337, 38.722252], label: "Baixa", city: "Lisbon", country: "Portugal", countryCode: "PT" }],
  maxDailyTravelMinutes: 90,
  mustInclude: ["tram", "museum"],
  mustAvoidTags: ["stairs-only"],
  mobilityLimit: "limited-walking",
};

const legacyPreferences: Preferences = {
  interests: ["culture", "food"],
  pace: "balanced",
  travelStyle: "comfort",
  dietary: ["vegetarian"],
  accessibilityNeeds: ["step-free"],
  preferredTransport: ["walk", "metro"],
};

describe("planItinerary (legacy suite)", () => {
  it("is deterministic for the same seed", () => {
    const first = planItinerary({ preferences: legacyPreferences, constraints: legacyConstraints, candidateExperiences: legacyExperiences, seed: 42, revision: 1 });
    const second = planItinerary({ preferences: legacyPreferences, constraints: legacyConstraints, candidateExperiences: legacyExperiences, seed: 42, revision: 1 });
    expect(first).toEqual(second);
  });

  it("applies hard filters before scoring (stairs-only + limited-walking rejects exp-3)", () => {
    const result = planItinerary({ preferences: legacyPreferences, constraints: legacyConstraints, candidateExperiences: legacyExperiences, seed: 7, revision: 2 });
    expect(result.itinerary.hardFilterSummary.rejectedByTags).toBe(1);
    expect(result.selectedExperienceIds).not.toContain("exp-3");
    expect(result.itinerary.days.some((day) => day.items.length > 0)).toBe(true);
  });
});
