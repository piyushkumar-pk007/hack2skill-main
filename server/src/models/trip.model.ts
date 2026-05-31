import { model, Schema, Types, type InferSchemaType } from "mongoose";
import { PREFERRED_TRANSPORT, TRIP_STATUSES } from "../domain/constants.js";
import { constraintsSchema, locationSchema, preferencesSchema } from "./schemas.js";

const itineraryItemSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    dayNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    type: {
      type: String,
      required: true,
      enum: ["travel", "stay", "experience", "meal", "buffer"],
    },
    status: {
      type: String,
      required: true,
      enum: ["suggested", "confirmed", "booked", "completed", "skipped"],
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    location: {
      type: locationSchema,
      required: true,
    },
    experienceId: {
      type: Types.ObjectId,
      ref: "Experience",
    },
    estimatedCost: {
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
    score: {
      type: Number,
      required: true,
      min: 0,
    },
    tags: {
      type: [
        {
          type: String,
          required: true,
          trim: true,
          lowercase: true,
        },
      ],
      required: true,
      default: [],
    },
    transportMode: {
      type: String,
      enum: PREFERRED_TRANSPORT,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 240,
    },
  },
  { _id: false, strict: "throw" }
);

const itineraryDaySchema = new Schema(
  {
    dayNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    date: {
      type: Date,
      required: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    items: {
      type: [itineraryItemSchema],
      required: true,
      default: [],
    },
    dailyScore: {
      type: Number,
      required: true,
      min: 0,
    },
    dailyCost: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false, strict: "throw" }
);

const hardFilterSummarySchema = new Schema(
  {
    inputCount: { type: Number, required: true, min: 0 },
    eligibleCount: { type: Number, required: true, min: 0 },
    rejectedByBudget: { type: Number, required: true, min: 0 },
    rejectedByDate: { type: Number, required: true, min: 0 },
    rejectedByAccessibility: { type: Number, required: true, min: 0 },
    rejectedByTags: { type: Number, required: true, min: 0 },
    rejectedByMobility: { type: Number, required: true, min: 0 },
    missingMustInclude: {
      type: [
        {
          type: String,
          required: true,
          trim: true,
          lowercase: true,
        },
      ],
      required: true,
      default: [],
    },
  },
  { _id: false, strict: "throw" }
);

const itinerarySchema = new Schema(
  {
    revision: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },
    seed: {
      type: Number,
      required: true,
    },
    generatedAt: {
      type: Date,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    days: {
      type: [itineraryDaySchema],
      required: true,
      default: [],
    },
    totalEstimatedCost: {
      type: Number,
      required: true,
      min: 0,
    },
    totalTransitMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    warnings: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 240,
        },
      ],
      required: true,
      default: [],
    },
    hardFilterSummary: {
      type: hardFilterSummarySchema,
      required: true,
    },
  },
  { _id: false, strict: "throw" }
);

const planningMetadataSchema = new Schema(
  {
    isDerived: {
      type: Boolean,
      required: true,
      default: true,
    },
    isRecomputable: {
      type: Boolean,
      required: true,
      default: true,
    },
    engineVersion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    generationSeed: {
      type: Number,
      required: true,
    },
    lastGeneratedAt: {
      type: Date,
    },
    candidateExperienceIds: {
      type: [
        {
          type: Types.ObjectId,
          ref: "Experience",
          required: true,
        },
      ],
      required: true,
      default: [],
    },
    totalScore: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false, strict: "throw" }
);

/**
 * Problem statement alignment:
 * - "Plans trips dynamically" -> `planning.isDerived`, `planning.isRecomputable`,
 *   `planning.generationSeed`, `planning.engineVersion`, `planning.lastGeneratedAt`
 * - "Itinerary is derived, re-computable, and versioned" -> `itinerary`, `itinerary.revision`
 * - "with preferences" -> `preferences`
 * - "constraints" -> `constraints`
 *   Later endpoint: `POST /api/trips/:tripId/plan`
 */
const tripSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    status: {
      type: String,
      required: true,
      enum: TRIP_STATUSES,
      index: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    preferences: {
      type: preferencesSchema,
      required: true,
    },
    constraints: {
      type: constraintsSchema,
      required: true,
    },
    itinerary: {
      type: itinerarySchema,
      required: true,
    },
    planning: {
      type: planningMetadataSchema,
      required: true,
    },
  },
  {
    timestamps: true,
    strict: "throw",
    versionKey: false,
  }
);

tripSchema.index({ userId: 1, createdAt: -1 });
export type TripDocument = InferSchemaType<typeof tripSchema>;
export const TripModel = model("Trip", tripSchema);
