import { model, Schema, Types, type InferSchemaType } from "mongoose";
import { UPDATE_EVENT_TYPES, UPDATE_SEVERITIES } from "../domain/constants.js";

/**
 * Problem statement alignment:
 * - "real time updates" -> this collection
 * - `type` -> weather | priceChange | closure | availability | delay
 * - `affectedItemId`, `payload`, `severity`, `createdAt`
 * - itinerary revision tracking -> `itineraryRevision`
 *   Later endpoint: `GET /api/trips/:tripId/updates`
 */
const updateEventSchema = new Schema(
  {
    tripId: {
      type: Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true,
    },
    itineraryRevision: {
      type: Number,
      required: true,
      min: 1,
    },
    type: {
      type: String,
      required: true,
      enum: UPDATE_EVENT_TYPES,
    },
    affectedItemId: {
      type: String,
      trim: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    severity: {
      type: String,
      required: true,
      enum: UPDATE_SEVERITIES,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    strict: "throw",
    versionKey: false,
  }
);

updateEventSchema.index({ tripId: 1, createdAt: -1 });

export type UpdateEventDocument = InferSchemaType<typeof updateEventSchema>;
export const UpdateEventModel = model("UpdateEvent", updateEventSchema);
