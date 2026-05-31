import type { Experience, Preferences, Trip, UpdateEvent, User } from "@shared/types";

export interface AuthSessionResponse {
  accessToken: string;
  expiresInMinutes: number;
  user: User;
}

export interface PreferencesResponse {
  userId: string;
  preferences: Preferences;
  updatedAt: string;
  tripSnapshotsUpdated?: boolean;
}

export interface TripResponse {
  trip: Trip;
  replannedAt?: string;
  debounceWindowMs?: number;
}

export interface ExperiencesResponse {
  page: number;
  pageSize: number;
  total: number;
  items: Array<Experience & { updatedAt?: string }>;
}

export interface InjectEventResponse {
  event: UpdateEvent;
  replanned: boolean;
  itineraryRevision: number;
  tripId: string;
}

export interface ReplanTripInput {
  seed?: number;
  targetDayNumber?: number;
}

export interface ExperienceQuery {
  destinationKey?: string;
  category?: Experience["category"];
  page?: number;
  pageSize?: number;
  accessibleOnly?: boolean;
}

export interface PlannerLocationDraft {
  id: string;
  label: string;
  city: string;
  country: string;
  countryCode: string;
  lng: string;
  lat: string;
}

export interface PlannerDraft {
  title: string;
  summary: string;
  preferences: Preferences;
  constraints: {
    startDate: string;
    endDate: string;
    budgetAmount: string;
    currency: string;
    partySize: string;
    origin: PlannerLocationDraft;
    destinations: PlannerLocationDraft[];
    maxDailyTravelMinutes: string;
    mustInclude: string;
    mustAvoidTags: string;
    mobilityLimit: Trip["constraints"]["mobilityLimit"];
  };
}

export interface SimulatedEventDraft {
  type: UpdateEvent["type"];
  severity: UpdateEvent["severity"];
  affectedItemId: string;
  payloadJson: string;
  adminKey: string;
}

export interface ToastAction {
  label: string;
  onAction: () => void | Promise<void>;
}

export interface ToastItem {
  id: string;
  title: string;
  description: string;
  severity: UpdateEvent["severity"] | "success";
  action?: ToastAction;
}
