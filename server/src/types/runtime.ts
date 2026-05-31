export interface SessionUserRecord {
  id?: string;
  _id?: unknown;
  refreshTokenHash?: string | null;
  refreshTokenExpiresAt?: Date | null;
  save(): Promise<unknown>;
}

export interface TripItineraryItemRuntime {
  id: string;
  estimatedCost: number;
}

export interface TripItineraryDayRuntime {
  dayNumber: number;
  items: TripItineraryItemRuntime[];
}

export interface TripRuntimeRecord {
  id?: string;
  _id?: unknown;
  preferences: unknown;
  constraints: {
    maxDailyTravelMinutes: number;
    budgetCap: {
      amount: number;
    };
    [key: string]: unknown;
  };
  status: string;
  itinerary: {
    revision: number;
    warnings: string[];
    totalEstimatedCost: number;
    days: TripItineraryDayRuntime[];
    toObject(): Record<string, unknown>;
  };
  planning: {
    lastGeneratedAt?: string | Date;
    generationSeed: number;
    toObject(): Record<string, unknown>;
  };
  save(): Promise<unknown>;
}
