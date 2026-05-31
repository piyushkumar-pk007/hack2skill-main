import type {
  AccessibilityNeed,
  DietaryPreference,
  ExperienceCategory,
  MobilityLevel,
  MobilityLimit,
  PreferredTransport,
  TravelStyle,
  TripPace,
  TripStatus,
  UpdateEventType,
  UpdateSeverity,
} from "../../../shared/src/types.js";

export const EXPERIENCE_CATEGORIES = [
  "culture",
  "food",
  "nature",
  "nightlife",
  "wellness",
  "adventure",
  "family",
  "shopping",
  "history",
] satisfies ExperienceCategory[];

export const TRIP_PACES = ["relaxed", "balanced", "packed"] satisfies TripPace[];
export const TRAVEL_STYLES = ["budget", "comfort", "luxury"] satisfies TravelStyle[];
export const DIETARY_PREFERENCES = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "pescatarian",
] satisfies DietaryPreference[];
export const ACCESSIBILITY_NEEDS = [
  "wheelchair",
  "step-free",
  "low-vision",
  "hearing-support",
  "sensory-friendly",
] satisfies AccessibilityNeed[];
export const PREFERRED_TRANSPORT = [
  "walk",
  "tram",
  "metro",
  "bus",
  "train",
  "taxi",
  "ferry",
  "rideshare",
  "bike",
] satisfies PreferredTransport[];
export const MOBILITY_LIMITS = [
  "unrestricted",
  "limited-walking",
  "wheelchair-dependent",
] satisfies MobilityLimit[];
export const MOBILITY_LEVELS = ["easy", "moderate", "demanding"] satisfies MobilityLevel[];
export const TRIP_STATUSES = [
  "draft",
  "planning",
  "ready",
  "in_progress",
  "completed",
  "archived",
] satisfies TripStatus[];
export const UPDATE_EVENT_TYPES = [
  "weather",
  "priceChange",
  "closure",
  "availability",
  "delay",
] satisfies UpdateEventType[];
export const UPDATE_SEVERITIES = ["info", "warning", "critical"] satisfies UpdateSeverity[];
