const DEFAULT_PORT = 3000;
const DEFAULT_CLIENT_ORIGIN = "http://localhost:5173";
const DEFAULT_PRODUCTION_CLIENT_ORIGIN = "https://*.vercel.app";
const DEFAULT_LOCAL_CLIENT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const DEFAULT_ACCESS_TOKEN_TTL_MINUTES = 15;
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 7;
const DEFAULT_REFRESH_COOKIE_NAME = "wayfinder_refresh_token";
const DEFAULT_REPLAN_DEBOUNCE_MS = 15_000;

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      return `test-${name.toLowerCase()}`;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

function getDefaultClientOrigins(): string[] {
  const origins = [...DEFAULT_LOCAL_CLIENT_ORIGINS];

  if ((process.env.NODE_ENV ?? "development") === "production") {
    origins.push(DEFAULT_PRODUCTION_CLIENT_ORIGIN);
  }

  return origins;
}

function parseOrigins(value: string | undefined): string[] {
  const rawOrigins = value ? value.split(",") : [];

  return rawOrigins
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function matchesWildcardOrigin(pattern: string, candidate: string): boolean {
  if (!pattern.includes("*")) {
    return false;
  }

  try {
    const patternUrl = new URL(pattern);
    const candidateUrl = new URL(candidate);

    if (patternUrl.protocol !== candidateUrl.protocol) {
      return false;
    }

    if (patternUrl.port && patternUrl.port !== candidateUrl.port) {
      return false;
    }

    if (!patternUrl.hostname.startsWith("*.")) {
      return false;
    }

    const suffix = patternUrl.hostname.slice(1);
    return candidateUrl.hostname.endsWith(suffix) && candidateUrl.hostname.length > suffix.length;
  } catch {
    return false;
  }
}

function isEquivalentLocalOrigin(pattern: URL, candidate: URL): boolean {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (!localHosts.has(pattern.hostname) || !localHosts.has(candidate.hostname)) {
    return false;
  }

  return pattern.protocol === candidate.protocol && pattern.port === candidate.port;
}

export function isAllowedClientOrigin(origin: string): boolean {
  const normalizedOrigin = origin.trim().replace(/\/$/, "");
  const candidateUrl = new URL(normalizedOrigin);

  return [...parseOrigins(process.env.CLIENT_ORIGIN), ...getDefaultClientOrigins()].some((allowedOrigin) => {
    if (allowedOrigin === normalizedOrigin) {
      return true;
    }

    try {
      const patternUrl = new URL(allowedOrigin);

      if (isEquivalentLocalOrigin(patternUrl, candidateUrl)) {
        return true;
      }

      return matchesWildcardOrigin(allowedOrigin, normalizedOrigin);
    } catch {
      return false;
    }
  });
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: (process.env.NODE_ENV ?? "development") === "production",
  port: getNumberEnv("PORT", DEFAULT_PORT),
  clientOrigin: (process.env.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN).trim().replace(/\/$/, ""),
  clientOrigins: [...parseOrigins(process.env.CLIENT_ORIGIN), ...getDefaultClientOrigins()],
  jwtAccessSecret: getRequiredEnv("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: getRequiredEnv("JWT_REFRESH_SECRET"),
  accessTokenTtlMinutes: getNumberEnv("ACCESS_TOKEN_TTL_MINUTES", DEFAULT_ACCESS_TOKEN_TTL_MINUTES),
  refreshTokenTtlDays: getNumberEnv("REFRESH_TOKEN_TTL_DAYS", DEFAULT_REFRESH_TOKEN_TTL_DAYS),
  refreshCookieName: process.env.REFRESH_COOKIE_NAME ?? DEFAULT_REFRESH_COOKIE_NAME,
  adminApiKey: process.env.ADMIN_API_KEY ?? "",
  replanDebounceMs: getNumberEnv("REPLAN_DEBOUNCE_MS", DEFAULT_REPLAN_DEBOUNCE_MS),
};

export function getMongoUri(): string {
  return getRequiredEnv("MONGODB_URI");
}
