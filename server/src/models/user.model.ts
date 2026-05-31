import { model, Schema, type InferSchemaType } from "mongoose";
import { constraintsSchema, locationSchema, preferencesSchema } from "./schemas.js";

/**
 * Problem statement alignment:
 * - "with preferences" -> `preferences`
 *   Later endpoint: `PUT /api/users/:userId/preferences`
 * - "constraints" -> `constraints`
 *   Later endpoint: `PUT /api/users/:userId/constraints`
 */
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    avatarUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    refreshTokenHash: {
      type: String,
      select: false,
    },
    refreshTokenExpiresAt: {
      type: Date,
      select: false,
    },
    homeBase: {
      type: locationSchema,
    },
    preferences: {
      type: preferencesSchema,
      required: true,
    },
    constraints: {
      type: constraintsSchema,
      required: true,
    },
  },
  {
    timestamps: true,
    strict: "throw",
    versionKey: false,
  }
);

export type UserDocument = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
