import { env } from "../config/env.js";
import { hashOpaqueToken, hashPassword, setRefreshTokenCookie, signAccessToken, signRefreshToken, verifyPassword, getRefreshExpiryDate, clearRefreshTokenCookie } from "../lib/auth.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import { serializeForApi } from "../lib/serialize.js";
import { UserModel } from "../models/index.js";
import type { SessionUserRecord } from "../types/runtime.js";

const defaultHomeBase = {
  type: "Point" as const,
  coordinates: [-0.1278, 51.5074] as [number, number],
  label: "Default Home Base",
  city: "London",
  country: "United Kingdom",
  countryCode: "GB",
};

function buildDefaultPreferences() {
  return {
    interests: ["culture"],
    pace: "balanced",
    travelStyle: "comfort",
    dietary: [],
    accessibilityNeeds: [],
    preferredTransport: ["walk", "metro"],
  };
}

function buildDefaultConstraints(homeBase = defaultHomeBase) {
  const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);

  return {
    startDate,
    endDate,
    budgetCap: {
      amount: 1200,
      currency: "USD",
    },
    partySize: 1,
    origin: homeBase,
    destinations: [homeBase],
    maxDailyTravelMinutes: 120,
    mustInclude: [],
    mustAvoidTags: [],
    mobilityLimit: "unrestricted",
  };
}

export function toSafeUserPayload(user: unknown) {
  const serialized = serializeForApi(user) as Record<string, unknown>;
  delete serialized.passwordHash;
  delete serialized.refreshTokenHash;
  delete serialized.refreshTokenExpiresAt;
  return serialized;
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  timezone: string;
  homeBase?: typeof defaultHomeBase;
  preferences?: ReturnType<typeof buildDefaultPreferences>;
}) {
  const existing = await UserModel.exists({ email: input.email.toLowerCase() });
  if (existing) {
    throw badRequest("Unable to complete registration with the provided details.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await UserModel.create({
    email: input.email.toLowerCase(),
    passwordHash,
    displayName: input.displayName,
    timezone: input.timezone,
    homeBase: input.homeBase,
    preferences: input.preferences ?? buildDefaultPreferences(),
    constraints: buildDefaultConstraints(input.homeBase),
  });

  return user;
}

export async function authenticateUser(email: string, password: string) {
  const user = await UserModel.findOne({ email: email.toLowerCase() }).select("+passwordHash +refreshTokenHash +refreshTokenExpiresAt");

  if (!user?.passwordHash) {
    throw unauthorized("Invalid credentials.");
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    throw unauthorized("Invalid credentials.");
  }

  return user;
}

export async function issueSession(user: SessionUserRecord, res: Parameters<typeof setRefreshTokenCookie>[0]) {
  const userId = user.id ?? String(user._id);
  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId);

  user.refreshTokenHash = hashOpaqueToken(refreshToken);
  user.refreshTokenExpiresAt = getRefreshExpiryDate();
  await user.save();

  setRefreshTokenCookie(res, refreshToken);

  return {
    accessToken,
    user: toSafeUserPayload(user),
    expiresInMinutes: env.accessTokenTtlMinutes,
  };
}

export async function refreshSession(userId: string, refreshToken: string, res: Parameters<typeof setRefreshTokenCookie>[0]) {
  const user = await UserModel.findById(userId).select("+refreshTokenHash +refreshTokenExpiresAt");

  if (!user?.refreshTokenHash || !user.refreshTokenExpiresAt) {
    throw unauthorized("Refresh session is invalid.");
  }

  if (user.refreshTokenHash !== hashOpaqueToken(refreshToken) || user.refreshTokenExpiresAt.getTime() < Date.now()) {
    throw unauthorized("Refresh session is invalid.");
  }

  return issueSession(user, res);
}

export async function revokeRefreshSession(userId: string, res: Parameters<typeof clearRefreshTokenCookie>[0]) {
  await UserModel.findByIdAndUpdate(userId, {
    $unset: {
      refreshTokenHash: 1,
      refreshTokenExpiresAt: 1,
    },
  });

  clearRefreshTokenCookie(res);
}
