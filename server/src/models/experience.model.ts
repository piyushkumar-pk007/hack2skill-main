import { model, Schema, type InferSchemaType } from "mongoose";
import {
  DIETARY_PREFERENCES,
  EXPERIENCE_CATEGORIES,
  PREFERRED_TRANSPORT,
} from "../domain/constants.js";
import {
  accessibilityProfileSchema,
  budgetCapSchema,
  locationSchema,
  openingHoursEntrySchema,
} from "./schemas.js";

/**
 * Problem statement alignment:
 * - "candidate experiences" for dynamic planning -> this collection
 * - "tags, coordinates, price, duration, openingHours, and accessibility flags" ->
 *   `tags`, `location.coordinates`, `price`, `durationMinutes`, `openingHours`, `accessibility`
 *   Later endpoint: `GET /api/experiences?destination=...`
 */
const experienceSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    category: {
      type: String,
      required: true,
      enum: EXPERIENCE_CATEGORIES,
    },
    destinationKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
      maxlength: 80,
    },
    location: {
      type: locationSchema,
      required: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    price: {
      type: budgetCapSchema,
      required: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 15,
      max: 1440,
    },
    tags: {
      type: [
        {
          type: String,
          required: true,
          trim: true,
          lowercase: true,
          minlength: 2,
          maxlength: 40,
        },
      ],
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0,
        message: "At least one tag is required.",
      },
    },
    openingHours: {
      type: [openingHoursEntrySchema],
      required: true,
      validate: {
        validator: (value: unknown[]) => Array.isArray(value) && value.length === 7,
        message: "Opening hours must include seven day entries.",
      },
    },
    accessibility: {
      type: accessibilityProfileSchema,
      required: true,
    },
    supportedDietary: {
      type: [
        {
          type: String,
          trim: true,
          lowercase: true,
          enum: DIETARY_PREFERENCES,
        },
      ],
      required: true,
      default: [],
    },
    preferredTransportModes: {
      type: [
        {
          type: String,
          trim: true,
          lowercase: true,
          enum: PREFERRED_TRANSPORT,
        },
      ],
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0,
        message: "At least one transport mode is required.",
      },
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    strict: "throw",
    versionKey: false,
  }
);

experienceSchema.index({ location: "2dsphere" });
experienceSchema.index({ destinationKey: 1, category: 1 });

export type ExperienceDocument = InferSchemaType<typeof experienceSchema>;
export const ExperienceModel = model("Experience", experienceSchema);
