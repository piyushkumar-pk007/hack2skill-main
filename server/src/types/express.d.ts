import type { TripRuntimeRecord } from "./runtime.js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        tokenType: "access" | "refresh";
      };
      tripDocument?: TripRuntimeRecord;
      tripLean?: Record<string, unknown>;
    }
  }
}

export {};
