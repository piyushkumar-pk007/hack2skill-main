export type ISODateString = string;
export type CurrencyCode = string;

export type ExperienceCategory =
  | "culture"
  | "food"
  | "nature"
  | "nightlife"
  | "wellness"
  | "adventure"
  | "family"
  | "shopping"
  | "history";

export type TripPace = "relaxed" | "balanced" | "packed";
export type TravelStyle = "budget" | "comfort" | "luxury";
export type DietaryPreference =
  | "vegetarian"
  | "vegan"
  | "halal"
  | "kosher"
  | "gluten-free"
  | "dairy-free"
  | "nut-free"
  | "pescatarian";
export type AccessibilityNeed =
  | "wheelchair"
  | "step-free"
  | "low-vision"
  | "hearing-support"
  | "sensory-friendly";
export type PreferredTransport =
  | "walk"
  | "tram"
  | "metro"
  | "bus"
  | "train"
  | "taxi"
  | "ferry"
  | "rideshare"
  | "bike";
export type MobilityLimit = "unrestricted" | "limited-walking" | "wheelchair-dependent";
export type TripStatus =
  | "draft"
  | "planning"
  | "ready"
  | "in_progress"
  | "completed"
  | "archived";
export type ItineraryItemType = "travel" | "stay" | "experience" | "meal" | "buffer";
export type ItineraryItemStatus = "suggested" | "confirmed" | "booked" | "completed" | "skipped";
export type UpdateEventType = "weather" | "priceChange" | "closure" | "availability" | "delay";
export type UpdateSeverity = "info" | "warning" | "critical";
export type MobilityLevel = "easy" | "moderate" | "demanding";

export interface GeoPoint {
  type: "Point";
  coordinates: [number, number];
  label: string;
  city: string;
  country: string;
  countryCode?: string;
}

export interface BudgetCap {
  amount: number;
  currency: CurrencyCode;
}

export interface OpeningHoursEntry {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  opensAt?: string;
  closesAt?: string;
  isClosed: boolean;
}

export interface AccessibilityProfile {
  wheelchairAccessible: boolean;
  stepFree: boolean;
  lowVisionSupport: boolean;
  hearingSupport: boolean;
  mobilityLevel: MobilityLevel;
}

export interface Preferences {
  interests: ExperienceCategory[];
  pace: TripPace;
  travelStyle: TravelStyle;
  dietary: DietaryPreference[];
  accessibilityNeeds: AccessibilityNeed[];
  preferredTransport: PreferredTransport[];
}

export interface Constraints {
  startDate: ISODateString;
  endDate: ISODateString;
  budgetCap: BudgetCap;
  partySize: number;
  origin: GeoPoint;
  destinations: GeoPoint[];
  maxDailyTravelMinutes: number;
  mustInclude: string[];
  mustAvoidTags: string[];
  mobilityLimit: MobilityLimit;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  timezone: string;
  homeBase?: GeoPoint;
  preferences: Preferences;
  constraints: Constraints;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Experience {
  id: string;
  slug: string;
  title: string;
  category: ExperienceCategory;
  destinationKey: string;
  location: GeoPoint;
  summary: string;
  price: BudgetCap;
  durationMinutes: number;
  tags: string[];
  openingHours: OpeningHoursEntry[];
  accessibility: AccessibilityProfile;
  supportedDietary: DietaryPreference[];
  preferredTransportModes: PreferredTransport[];
  isActive: boolean;
}

export interface ItineraryItem {
  id: string;
  dayNumber: number;
  title: string;
  type: ItineraryItemType;
  status: ItineraryItemStatus;
  startTime: ISODateString;
  endTime: ISODateString;
  location: GeoPoint;
  experienceId?: string;
  estimatedCost: number;
  currency: CurrencyCode;
  score: number;
  tags: string[];
  transportMode?: PreferredTransport;
  notes?: string;
}

export interface ItineraryDay {
  dayNumber: number;
  date: ISODateString;
  city: string;
  items: ItineraryItem[];
  dailyScore: number;
  dailyCost: number;
}

export interface HardFilterSummary {
  inputCount: number;
  eligibleCount: number;
  rejectedByBudget: number;
  rejectedByDate: number;
  rejectedByAccessibility: number;
  rejectedByTags: number;
  rejectedByMobility: number;
  missingMustInclude: string[];
}

export interface Itinerary {
  revision: number;
  seed: number;
  generatedAt: ISODateString;
  startDate: ISODateString;
  endDate: ISODateString;
  days: ItineraryDay[];
  totalEstimatedCost: number;
  totalTransitMinutes: number;
  warnings: string[];
  hardFilterSummary: HardFilterSummary;
}

export interface PlanningMetadata {
  isDerived: boolean;
  isRecomputable: boolean;
  engineVersion: string;
  generationSeed: number;
  lastGeneratedAt?: ISODateString;
  candidateExperienceIds: string[];
  totalScore: number;
}

export interface Trip {
  id: string;
  userId: string;
  title: string;
  status: TripStatus;
  summary: string;
  preferences: Preferences;
  constraints: Constraints;
  itinerary: Itinerary;
  planning: PlanningMetadata;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface UpdateEvent {
  id: string;
  tripId: string;
  itineraryRevision: number;
  type: UpdateEventType;
  affectedItemId?: string;
  payload: Record<string, unknown>;
  severity: UpdateSeverity;
  createdAt: ISODateString;
}
