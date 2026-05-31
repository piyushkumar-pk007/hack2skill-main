import type {
  Constraints,
  Experience,
  Itinerary,
  ItineraryDay,
  ItineraryItem,
  Preferences,
  PreferredTransport,
} from "../../../shared/src/types.js";

const ENGINE_VERSION = "1.0.0";
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PACE_SLOT_COUNT: Record<Preferences["pace"], number> = {
  relaxed: 2,
  balanced: 3,
  packed: 4,
};
const TRANSPORT_SPEED_KMH: Record<PreferredTransport, number> = {
  walk: 4.5,
  tram: 16,
  metro: 28,
  bus: 18,
  train: 45,
  taxi: 24,
  ferry: 22,
  rideshare: 24,
  bike: 14,
};

export interface PlannerInput {
  preferences: Preferences;
  constraints: Constraints;
  candidateExperiences: Experience[];
  seed: number;
  revision?: number;
  generatedAt?: string;
}

export interface PlannerResult {
  itinerary: Itinerary;
  selectedExperienceIds: string[];
  totalScore: number;
  engineVersion: string;
}

interface FilteredExperience {
  experience: Experience;
  score: number;
  mustIncludeMatches: string[];
}

interface FilterCounters {
  rejectedByBudget: number;
  rejectedByDate: number;
  rejectedByAccessibility: number;
  rejectedByTags: number;
  rejectedByMobility: number;
}

/**
 * Deterministic itinerary planner for Wayfinder.
 *
 * Algorithm overview:
 * 1. Hard-filter candidate experiences against constraints. Budget, date availability,
 *    accessibility requirements, avoided tags, and mobility limits are non-negotiable.
 * 2. Soft-score the remaining experiences based on user preferences.
 *    Formula:
 *    - base score: 50
 *    - interest match: +30 if category is in `preferences.interests`
 *    - tag overlap with interests: +8 per overlap
 *    - pace fit: up to +18 depending on whether duration fits relaxed/balanced/packed pacing
 *    - travel style fit: up to +18 depending on per-person price alignment
 *    - dietary fit for food experiences: +12 if dietary options overlap
 *    - transport fit: +10 when experience transport overlaps preferred transport
 *    - must-include token match: +40 per match so required themes rise to the top
 * 3. Build the itinerary day by day using the seeded pseudo-random generator only as a
 *    stable tie-breaker. This keeps the same inputs + seed fully reproducible for tests.
 * 4. Enforce daily budget and max travel minutes while assigning opening-hour-aware time slots.
 */
export function planItinerary({
  preferences,
  constraints,
  candidateExperiences,
  seed,
  revision = 1,
  generatedAt = `${constraints.startDate}T00:00:00.000Z`,
}: PlannerInput): PlannerResult {
  const rng = createSeededRng(seed);
  const tripDates = enumerateTripDates(constraints.startDate, constraints.endDate);
  const filterCounters: FilterCounters = {
    rejectedByBudget: 0,
    rejectedByDate: 0,
    rejectedByAccessibility: 0,
    rejectedByTags: 0,
    rejectedByMobility: 0,
  };

  const eligible = candidateExperiences.flatMap((experience) => {
    const rejection = getHardFilterRejection({ preferences, constraints, experience, tripDates });

    if (rejection) {
      filterCounters[rejection] += 1;
      return [];
    }

    const mustIncludeMatches = getMustIncludeMatches(constraints.mustInclude, experience);

    return [
      {
        experience,
        score: scoreExperience(preferences, constraints, experience, mustIncludeMatches),
        mustIncludeMatches,
      } satisfies FilteredExperience,
    ];
  });

  const sortedEligible = eligible
    .map((item) => ({
      ...item,
      jitter: rng(),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.jitter !== right.jitter) {
        return left.jitter - right.jitter;
      }

      return left.experience.slug.localeCompare(right.experience.slug);
    });

  const selectedIds = new Set<string>();
  const itineraryDays: ItineraryDay[] = [];
  const warnings: string[] = [];
  const totalBudget = constraints.budgetCap.amount;
  let runningCost = 0;
  let runningTransitMinutes = 0;
  let totalScore = 0;

  const requiredTokens = new Set(constraints.mustInclude.map(normalizeToken));

  for (let index = 0; index < tripDates.length; index += 1) {
    const date = tripDates[index];
    const city = constraints.destinations[0]?.city ?? constraints.origin.city;
    const preferredCount = PACE_SLOT_COUNT[preferences.pace];
    const requiredForDay = sortedEligible.filter(
      (item) =>
        item.mustIncludeMatches.some((token) => requiredTokens.has(token)) &&
        !selectedIds.has(item.experience.id)
    );
    const generalPool = sortedEligible.filter((item) => !selectedIds.has(item.experience.id));
    const dayCandidates = dedupeById([...requiredForDay, ...generalPool]).slice(0, 20);

    let previousLocation = constraints.destinations[0] ?? constraints.origin;
    let currentMinutes = 9 * 60;
    let dailyTransitMinutes = 0;
    let dailyCost = 0;
    let dailyScore = 0;
    const items: ItineraryItem[] = [];

    for (const candidate of dayCandidates) {
      if (items.length >= preferredCount) {
        break;
      }

      const experience = candidate.experience;
      const dateHours = getOpeningHoursForDate(experience, date);

      if (!dateHours || dateHours.isClosed || !dateHours.opensAt || !dateHours.closesAt) {
        continue;
      }

      const experienceCost = experience.price.amount * constraints.partySize;
      if (runningCost + experienceCost > totalBudget) {
        continue;
      }

      const transportMode = resolveTransportMode(preferences.preferredTransport, experience.preferredTransportModes);
      const transitMinutes = estimateTransitMinutes(previousLocation.coordinates, experience.location.coordinates, transportMode);

      if (dailyTransitMinutes + transitMinutes > constraints.maxDailyTravelMinutes) {
        continue;
      }

      const openMinutes = parseClock(dateHours.opensAt);
      const closeMinutes = parseClock(dateHours.closesAt);
      const startMinutes = Math.max(currentMinutes + transitMinutes, openMinutes);
      const endMinutes = startMinutes + experience.durationMinutes;

      if (endMinutes > closeMinutes) {
        continue;
      }

      const itemType = experience.category === "food" ? "meal" : "experience";
      const itineraryItem: ItineraryItem = {
        id: makeItemId(revision, index + 1, experience.id),
        dayNumber: index + 1,
        title: experience.title,
        type: itemType,
        status: "suggested",
        startTime: toIsoAtMinutes(date, startMinutes),
        endTime: toIsoAtMinutes(date, endMinutes),
        location: experience.location,
        experienceId: experience.id,
        estimatedCost: experienceCost,
        currency: experience.price.currency,
        score: candidate.score,
        tags: experience.tags,
        transportMode,
        notes: candidate.mustIncludeMatches.length > 0 ? "Selected to satisfy must-include constraint." : undefined,
      };

      items.push(itineraryItem);
      selectedIds.add(experience.id);
      previousLocation = experience.location;
      currentMinutes = endMinutes + 30;
      dailyTransitMinutes += transitMinutes;
      runningTransitMinutes += transitMinutes;
      dailyCost += experienceCost;
      runningCost += experienceCost;
      dailyScore += candidate.score;
      totalScore += candidate.score;

      for (const token of candidate.mustIncludeMatches) {
        requiredTokens.delete(token);
      }
    }

    itineraryDays.push({
      dayNumber: index + 1,
      date,
      city,
      items,
      dailyScore,
      dailyCost,
    });
  }

  const missingMustInclude = Array.from(requiredTokens);
  if (missingMustInclude.length > 0) {
    warnings.push(`Unable to satisfy mustInclude constraints for: ${missingMustInclude.join(", ")}`);
  }

  if (runningCost > totalBudget) {
    warnings.push("Generated itinerary exceeds budget cap.");
  }

  if (itineraryDays.every((day) => day.items.length === 0)) {
    warnings.push("No eligible experiences could be scheduled for the requested window.");
  }

  return {
    itinerary: {
      revision,
      seed,
      generatedAt,
      startDate: constraints.startDate,
      endDate: constraints.endDate,
      days: itineraryDays,
      totalEstimatedCost: runningCost,
      totalTransitMinutes: runningTransitMinutes,
      warnings,
      hardFilterSummary: {
        inputCount: candidateExperiences.length,
        eligibleCount: sortedEligible.length,
        rejectedByBudget: filterCounters.rejectedByBudget,
        rejectedByDate: filterCounters.rejectedByDate,
        rejectedByAccessibility: filterCounters.rejectedByAccessibility,
        rejectedByTags: filterCounters.rejectedByTags,
        rejectedByMobility: filterCounters.rejectedByMobility,
        missingMustInclude,
      },
    },
    selectedExperienceIds: Array.from(selectedIds),
    totalScore,
    engineVersion: ENGINE_VERSION,
  };
}

type RejectionKind =
  | "rejectedByBudget"
  | "rejectedByDate"
  | "rejectedByAccessibility"
  | "rejectedByTags"
  | "rejectedByMobility";

function getHardFilterRejection({
  preferences,
  constraints,
  experience,
  tripDates,
}: {
  preferences: Preferences;
  constraints: Constraints;
  experience: Experience;
  tripDates: string[];
}): RejectionKind | null {
  if (!experience.isActive) {
    return "rejectedByDate";
  }

  const experienceCost = experience.price.amount * constraints.partySize;
  if (experienceCost > constraints.budgetCap.amount) {
    return "rejectedByBudget";
  }

  const avoidedTags = new Set(constraints.mustAvoidTags.map(normalizeToken));
  if (experience.tags.some((tag) => avoidedTags.has(normalizeToken(tag)))) {
    return "rejectedByTags";
  }

  if (!isAccessibleForNeeds(preferences.accessibilityNeeds, experience)) {
    return "rejectedByAccessibility";
  }

  if (!satisfiesMobilityLimit(constraints.mobilityLimit, experience)) {
    return "rejectedByMobility";
  }

  const hasOpeningDuringTrip = tripDates.some((date) => {
    const hours = getOpeningHoursForDate(experience, date);
    return Boolean(hours && !hours.isClosed && hours.opensAt && hours.closesAt);
  });

  if (!hasOpeningDuringTrip) {
    return "rejectedByDate";
  }

  return null;
}

function scoreExperience(
  preferences: Preferences,
  constraints: Constraints,
  experience: Experience,
  mustIncludeMatches: string[]
): number {
  let score = 50;

  if (preferences.interests.includes(experience.category)) {
    score += 30;
  }

  const interestTokens = new Set(preferences.interests.map(normalizeToken));
  score += experience.tags.reduce(
    (sum, tag) => sum + (interestTokens.has(normalizeToken(tag)) ? 8 : 0),
    0
  );

  score += scorePace(preferences.pace, experience.durationMinutes);
  score += scoreTravelStyle(preferences.travelStyle, constraints.budgetCap.amount, constraints.partySize, experience.price.amount);

  if (experience.category === "food" && preferences.dietary.some((item) => experience.supportedDietary.includes(item))) {
    score += 12;
  }

  if (preferences.preferredTransport.some((mode) => experience.preferredTransportModes.includes(mode))) {
    score += 10;
  }

  score += mustIncludeMatches.length * 40;

  return score;
}

function scorePace(pace: Preferences["pace"], durationMinutes: number): number {
  if (pace === "relaxed") {
    if (durationMinutes >= 90 && durationMinutes <= 210) {
      return 18;
    }

    return durationMinutes < 60 ? 4 : 10;
  }

  if (pace === "packed") {
    if (durationMinutes >= 30 && durationMinutes <= 120) {
      return 18;
    }

    return durationMinutes > 180 ? 2 : 10;
  }

  if (durationMinutes >= 60 && durationMinutes <= 180) {
    return 18;
  }

  return 8;
}

function scoreTravelStyle(
  travelStyle: Preferences["travelStyle"],
  totalBudget: number,
  partySize: number,
  experiencePrice: number
): number {
  const perPersonBudget = totalBudget / partySize;
  const ratio = experiencePrice / Math.max(perPersonBudget, 1);

  if (travelStyle === "budget") {
    return ratio <= 0.15 ? 18 : ratio <= 0.3 ? 12 : 4;
  }

  if (travelStyle === "luxury") {
    return ratio >= 0.3 && ratio <= 0.7 ? 18 : ratio > 0.7 ? 12 : 6;
  }

  return ratio >= 0.15 && ratio <= 0.45 ? 18 : 10;
}

function isAccessibleForNeeds(needs: Preferences["accessibilityNeeds"], experience: Experience): boolean {
  return needs.every((need) => {
    switch (need) {
      case "wheelchair":
        return experience.accessibility.wheelchairAccessible;
      case "step-free":
        return experience.accessibility.stepFree;
      case "low-vision":
        return experience.accessibility.lowVisionSupport;
      case "hearing-support":
        return experience.accessibility.hearingSupport;
      case "sensory-friendly":
        return experience.accessibility.mobilityLevel !== "demanding";
      default:
        return true;
    }
  });
}

function satisfiesMobilityLimit(limit: Constraints["mobilityLimit"], experience: Experience): boolean {
  if (limit === "wheelchair-dependent") {
    return experience.accessibility.wheelchairAccessible && experience.accessibility.mobilityLevel === "easy";
  }

  if (limit === "limited-walking") {
    return experience.accessibility.mobilityLevel !== "demanding";
  }

  return true;
}

function getMustIncludeMatches(tokens: string[], experience: Experience): string[] {
  const normalizedText = new Set([
    normalizeToken(experience.slug),
    normalizeToken(experience.title),
    normalizeToken(experience.category),
    ...experience.tags.map(normalizeToken),
  ]);

  return tokens.map(normalizeToken).filter((token) => normalizedText.has(token));
}

function getOpeningHoursForDate(experience: Experience, date: string) {
  const dayOfWeek = new Date(date).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return experience.openingHours.find((entry) => entry.dayOfWeek === dayOfWeek);
}

function resolveTransportMode(
  preferredTransport: Preferences["preferredTransport"],
  experienceModes: Experience["preferredTransportModes"]
): PreferredTransport {
  return preferredTransport.find((mode) => experienceModes.includes(mode)) ?? experienceModes[0];
}

function estimateTransitMinutes(
  fromCoordinates: [number, number],
  toCoordinates: [number, number],
  mode: PreferredTransport
): number {
  const distanceKm = haversineDistanceKm(fromCoordinates, toCoordinates);
  const speed = TRANSPORT_SPEED_KMH[mode];
  return Math.round((distanceKm / speed) * 60) + 10;
}

function haversineDistanceKm(from: [number, number], to: [number, number]): number {
  const [fromLng, fromLat] = from;
  const [toLng, toLat] = to;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const originLat = toRadians(fromLat);
  const destinationLat = toRadians(toLat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function enumerateTripDates(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];

  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += DAY_IN_MS) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }

  return dates;
}

function parseClock(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function toIsoAtMinutes(date: string, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return new Date(`${date}T${pad2(hours)}:${pad2(remainingMinutes)}:00.000Z`).toISOString();
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let result = Math.imul(state ^ (state >>> 15), 1 | state);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function dedupeById(items: FilteredExperience[]): FilteredExperience[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.experience.id)) {
      return false;
    }

    seen.add(item.experience.id);
    return true;
  });
}

function makeItemId(revision: number, dayNumber: number, experienceId: string): string {
  return `item-${revision}-${dayNumber}-${experienceId}`;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}
