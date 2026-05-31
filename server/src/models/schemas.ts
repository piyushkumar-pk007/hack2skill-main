import { Schema } from "mongoose";
import {
  ACCESSIBILITY_NEEDS,
  DIETARY_PREFERENCES,
  EXPERIENCE_CATEGORIES,
  MOBILITY_LEVELS,
  MOBILITY_LIMITS,
  PREFERRED_TRANSPORT,
  TRAVEL_STYLES,
  TRIP_PACES,
} from "../domain/constants.js";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

function stringArrayDefinition(enumValues?: readonly string[]) {
  return [
    {
      type: String,
      trim: true,
      lowercase: true,
      ...(enumValues ? { enum: enumValues } : {}),
    },
  ];
}

export const pointSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
      default: "Point",
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value: number[]) =>
          Array.isArray(value) &&
          value.length === 2 &&
          value[0] >= -180 &&
          value[0] <= 180 &&
          value[1] >= -90 &&
          value[1] <= 90,
        message: "Coordinates must be [lng, lat].",
      },
    },
  },
  { _id: false, strict: "throw" }
);

export const locationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
      default: "Point",
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value: number[]) =>
          Array.isArray(value) &&
          value.length === 2 &&
          value[0] >= -180 &&
          value[0] <= 180 &&
          value[1] >= -90 &&
          value[1] <= 90,
        message: "Coordinates must be [lng, lat].",
      },
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    country: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 3,
    },
  },
  { _id: false, strict: "throw" }
);

export const budgetCapSchema = new Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },
  },
  { _id: false, strict: "throw" }
);

export const openingHoursEntrySchema = new Schema(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    opensAt: {
      type: String,
      validate: {
        validator: (value: string | undefined) => value === undefined || timePattern.test(value),
        message: "opensAt must use HH:MM.",
      },
    },
    closesAt: {
      type: String,
      validate: {
        validator: (value: string | undefined) => value === undefined || timePattern.test(value),
        message: "closesAt must use HH:MM.",
      },
    },
    isClosed: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  { _id: false, strict: "throw" }
);

openingHoursEntrySchema.pre("validate", function validateOpeningHours(
  this: { isClosed: boolean; opensAt?: string; closesAt?: string },
  next: (error?: Error) => void
) {
  if (!this.isClosed && (!this.opensAt || !this.closesAt)) {
    next(new Error("Open days must define both opensAt and closesAt."));
    return;
  }

  if (this.isClosed && (this.opensAt || this.closesAt)) {
    next(new Error("Closed days cannot define opensAt or closesAt."));
    return;
  }

  if (!this.isClosed && this.opensAt && this.closesAt && this.opensAt >= this.closesAt) {
    next(new Error("opensAt must be earlier than closesAt."));
    return;
  }

  next();
});

export const accessibilityProfileSchema = new Schema(
  {
    wheelchairAccessible: {
      type: Boolean,
      required: true,
      default: false,
    },
    stepFree: {
      type: Boolean,
      required: true,
      default: false,
    },
    lowVisionSupport: {
      type: Boolean,
      required: true,
      default: false,
    },
    hearingSupport: {
      type: Boolean,
      required: true,
      default: false,
    },
    mobilityLevel: {
      type: String,
      required: true,
      enum: MOBILITY_LEVELS,
    },
  },
  { _id: false, strict: "throw" }
);

export const preferencesSchema = new Schema(
  {
    interests: {
      type: stringArrayDefinition(EXPERIENCE_CATEGORIES),
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0,
        message: "At least one interest is required.",
      },
    },
    pace: {
      type: String,
      required: true,
      enum: TRIP_PACES,
    },
    travelStyle: {
      type: String,
      required: true,
      enum: TRAVEL_STYLES,
    },
    dietary: {
      type: stringArrayDefinition(DIETARY_PREFERENCES),
      required: true,
      default: [],
    },
    accessibilityNeeds: {
      type: stringArrayDefinition(ACCESSIBILITY_NEEDS),
      required: true,
      default: [],
    },
    preferredTransport: {
      type: stringArrayDefinition(PREFERRED_TRANSPORT),
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0,
        message: "At least one preferred transport option is required.",
      },
    },
  },
  { _id: false, strict: "throw" }
);

export const constraintsSchema = new Schema(
  {
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    budgetCap: {
      type: budgetCapSchema,
      required: true,
    },
    partySize: {
      type: Number,
      required: true,
      min: 1,
      max: 30,
    },
    origin: {
      type: locationSchema,
      required: true,
    },
    destinations: {
      type: [locationSchema],
      required: true,
      validate: {
        validator: (value: unknown[]) => Array.isArray(value) && value.length > 0,
        message: "At least one destination is required.",
      },
    },
    maxDailyTravelMinutes: {
      type: Number,
      required: true,
      min: 0,
      max: 1440,
    },
    mustInclude: {
      type: stringArrayDefinition(),
      required: true,
      default: [],
    },
    mustAvoidTags: {
      type: stringArrayDefinition(),
      required: true,
      default: [],
    },
    mobilityLimit: {
      type: String,
      required: true,
      enum: MOBILITY_LIMITS,
    },
  },
  { _id: false, strict: "throw" }
);

constraintsSchema.path("endDate").validate(function validateRange(
  this: { get(path: string): Date | undefined },
  value: Date
) {
  const startDate = this.get("startDate") as Date;
  return !startDate || !value || startDate <= value;
}, "endDate must be on or after startDate.");
