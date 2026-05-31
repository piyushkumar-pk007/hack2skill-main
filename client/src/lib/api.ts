import type { Preferences, Trip, UpdateEvent } from "@shared/types";
import { API_BASE_URL } from "./config";
import type {
  AuthSessionResponse,
  ExperienceQuery,
  ExperiencesResponse,
  InjectEventResponse,
  PreferencesResponse,
  ReplanTripInput,
  TripResponse,
} from "../types/api";

interface ApiClientOptions {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
}

interface RequestOptions {
  auth?: boolean;
  body?: unknown;
  method?: "GET" | "POST" | "PUT";
  headers?: HeadersInit;
  retryOnUnauthorized?: boolean;
}

interface ApiErrorPayload {
  message?: string;
  code?: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message ?? "Request failed.");
    this.name = "ApiClientError";
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

export class ApiClient {
  private options: ApiClientOptions;

  constructor(options: ApiClientOptions) {
    this.options = options;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const accessToken = options.auth ? this.options.getAccessToken() : null;
    const headers = new Headers(options.headers);

    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "include",
    });

    if (response.status === 401 && options.auth && options.retryOnUnauthorized !== false) {
      const refreshedToken = await this.options.refreshAccessToken();
      if (refreshedToken) {
        return this.request<T>(path, {
          ...options,
          retryOnUnauthorized: false,
        });
      }
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "Request failed." }))) as ApiErrorPayload;
      throw new ApiClientError(response.status, payload);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  register(input: {
    email: string;
    password: string;
    displayName: string;
    timezone: string;
  }) {
    return this.request<AuthSessionResponse>("/auth/register", {
      method: "POST",
      body: input,
    });
  }

  login(input: { email: string; password: string }) {
    return this.request<AuthSessionResponse>("/auth/login", {
      method: "POST",
      body: input,
    });
  }

  refresh() {
    return this.request<AuthSessionResponse>("/auth/refresh", {
      method: "POST",
      retryOnUnauthorized: false,
    });
  }

  logout() {
    return this.request<void>("/auth/logout", {
      method: "POST",
      auth: true,
      retryOnUnauthorized: false,
    });
  }

  getPreferences() {
    return this.request<PreferencesResponse>("/preferences", {
      auth: true,
    });
  }

  updatePreferences(input: { preferences: Preferences }) {
    return this.request<PreferencesResponse>("/preferences", {
      method: "PUT",
      auth: true,
      body: input,
    });
  }

  createTrip(input: {
    title: string;
    summary?: string;
    constraints: Trip["constraints"];
  }) {
    return this.request<TripResponse>("/trips", {
      method: "POST",
      auth: true,
      body: input,
    });
  }

  getTrip(tripId: string) {
    return this.request<TripResponse>(`/trips/${tripId}`, {
      auth: true,
    });
  }

  replanTrip(tripId: string, input: ReplanTripInput = {}) {
    return this.request<TripResponse>(`/trips/${tripId}/replan`, {
      method: "POST",
      auth: true,
      body: input,
    });
  }

  listExperiences(query: ExperienceQuery) {
    return this.request<ExperiencesResponse>(
      `/experiences${buildQuery({
        destinationKey: query.destinationKey,
        category: query.category,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 50,
        accessibleOnly: query.accessibleOnly,
      })}`
    );
  }

  injectTripEvent(
    tripId: string,
    input: {
      type: UpdateEvent["type"];
      severity: UpdateEvent["severity"];
      affectedItemId?: string;
      payload: Record<string, unknown>;
      adminKey?: string;
    }
  ) {
    return this.request<InjectEventResponse>(`/trips/${tripId}/events`, {
      method: "POST",
      auth: true,
      headers: input.adminKey ? { "x-admin-key": input.adminKey } : undefined,
      body: {
        type: input.type,
        severity: input.severity,
        affectedItemId: input.affectedItemId || undefined,
        payload: input.payload,
      },
    });
  }

  getTripEventsUrl(tripId: string, accessToken: string, since?: string) {
    return `${API_BASE_URL}/trips/${tripId}/events${buildQuery({
      accessToken,
      since,
    })}`;
  }
}
