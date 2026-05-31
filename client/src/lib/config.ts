export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api").replace(/\/$/, "");

export const STORAGE_KEYS = {
  session: "wayfinder-session",
  lastTripId: "wayfinder-last-trip-id",
  plannerDraft: "wayfinder-planner-draft",
} as const;
