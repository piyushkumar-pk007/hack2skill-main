import type { Constraints, Experience, Preferences } from "../../../shared/src/types.js";
import { describe, expect, it } from "vitest";
import { planItinerary } from "./planner.js";

const preferences: Preferences = {
  interests: ["culture", "food"],
  pace: "balanced",
  travelStyle: "comfort",
  dietary: ["vegetarian"],
  accessibilityNeeds: ["step-free"],
  preferredTransport: ["walk", "metro"],
};

const constraints: Constraints = {
  startDate: "2026-06-10",
  endDate: "2026-06-12",
  budgetCap: {
    amount: 240,
    currency: "EUR",
  },
  partySize: 2,
  origin: {
    type: "Point",
    coordinates: [-9.142685, 38.736946],
    label: "Lisbon Airport",
    city: "Lisbon",
    country: "Portugal",
    countryCode: "PT",
  },
  destinations: [
    {
      type: "Point",
      coordinates: [-9.139337, 38.722252],
      label: "Baixa",
      city: "Lisbon",
      country: "Portugal",
      countryCode: "PT",
    },
  ],
  maxDailyTravelMinutes: 90,
  mustInclude: ["tram", "museum"],
  mustAvoidTags: ["stairs-only"],
  mobilityLimit: "limited-walking",
};

const dailyHours = [
  { dayOfWeek: 0 as const, opensAt: "09:00", closesAt: "18:00", isClosed: false },
  { dayOfWeek: 1 as const, opensAt: "09:00", closesAt: "18:00", isClosed: false },
  { dayOfWeek: 2 as const, opensAt: "09:00", closesAt: "18:00", isClosed: false },
  { dayOfWeek: 3 as const, opensAt: "09:00", closesAt: "18:00", isClosed: false },
  { dayOfWeek: 4 as const, opensAt: "09:00", closesAt: "18:00", isClosed: false },
  { dayOfWeek: 5 as const, opensAt: "09:00", closesAt: "18:00", isClosed: false },
  { dayOfWeek: 6 as const, opensAt: "09:00", closesAt: "18:00", isClosed: false },
];

const experiences: Experience[] = [
  {
    id: "exp-1",
    slug: "city-history-museum",
    title: "City History Museum",
    category: "history",
    destinationKey: "lisbon-portugal",
    location: {
      type: "Point",
      coordinates: [-9.1365, 38.7139],
      label: "Museum Quarter",
      city: "Lisbon",
      country: "Portugal",
      countryCode: "PT",
    },
    summary: "Museum stop",
    price: { amount: 20, currency: "EUR" },
    durationMinutes: 120,
    tags: ["museum", "culture", "tram"],
    openingHours: dailyHours,
    accessibility: {
      wheelchairAccessible: true,
      stepFree: true,
      lowVisionSupport: true,
      hearingSupport: true,
      mobilityLevel: "easy",
    },
    supportedDietary: [],
    preferredTransportModes: ["walk", "metro"],
    isActive: true,
  },
  {
    id: "exp-2",
    slug: "vegetarian-market-lunch",
    title: "Vegetarian Market Lunch",
    category: "food",
    destinationKey: "lisbon-portugal",
    location: {
      type: "Point",
      coordinates: [-9.1412, 38.7099],
      label: "Market Hall",
      city: "Lisbon",
      country: "Portugal",
      countryCode: "PT",
    },
    summary: "Food stop",
    price: { amount: 18, currency: "EUR" },
    durationMinutes: 75,
    tags: ["food", "local", "market"],
    openingHours: dailyHours,
    accessibility: {
      wheelchairAccessible: true,
      stepFree: true,
      lowVisionSupport: false,
      hearingSupport: false,
      mobilityLevel: "easy",
    },
    supportedDietary: ["vegetarian", "vegan"],
    preferredTransportModes: ["walk"],
    isActive: true,
  },
  {
    id: "exp-3",
    slug: "hilltop-lookout",
    title: "Hilltop Lookout",
    category: "nature",
    destinationKey: "lisbon-portugal",
    location: {
      type: "Point",
      coordinates: [-9.1304, 38.7148],
      label: "Hilltop",
      city: "Lisbon",
      country: "Portugal",
      countryCode: "PT",
    },
    summary: "Difficult mobility",
    price: { amount: 5, currency: "EUR" },
    durationMinutes: 60,
    tags: ["viewpoint", "stairs-only"],
    openingHours: dailyHours,
    accessibility: {
      wheelchairAccessible: false,
      stepFree: false,
      lowVisionSupport: false,
      hearingSupport: false,
      mobilityLevel: "demanding",
    },
    supportedDietary: [],
    preferredTransportModes: ["walk"],
    isActive: true,
  },
];

describe("planItinerary", () => {
  it("is deterministic for the same seed", () => {
    const first = planItinerary({
      preferences,
      constraints,
      candidateExperiences: experiences,
      seed: 42,
      revision: 1,
    });
    const second = planItinerary({
      preferences,
      constraints,
      candidateExperiences: experiences,
      seed: 42,
      revision: 1,
    });

    expect(first).toEqual(second);
  });

  it("applies hard filters before scoring", () => {
    const result = planItinerary({
      preferences,
      constraints,
      candidateExperiences: experiences,
      seed: 7,
      revision: 2,
    });

    expect(result.itinerary.hardFilterSummary.rejectedByTags).toBe(1);
    expect(result.selectedExperienceIds).not.toContain("exp-3");
    expect(result.itinerary.days.some((day) => day.items.length > 0)).toBe(true);
  });
});
