const DEFAULT_PORT = 3000;
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

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value.trim().replace(/\/$/, "")).origin;
  } catch {
    return null;
  }
}

function parseOrigins(value: string | undefined): string[] {
  return (value ? value.split(",") : [])
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
}

function getDefaultClientOrigins(): string[] {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    const deployedOrigin = process.env.VERCEL_URL ? normalizeOrigin(`https://${process.env.VERCEL_URL}`) : null;
    return deployedOrigin ? [deployedOrigin] : [];
  }

  return [...DEFAULT_LOCAL_CLIENT_ORIGINS];
}

function isEquivalentLocalOrigin(pattern: URL, candidate: URL): boolean {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (!localHosts.has(pattern.hostname) || !localHosts.has(candidate.hostname)) {
    return false;
  }

  return pattern.protocol === candidate.protocol && pattern.port === candidate.port;
}

export function isAllowedClientOrigin(origin: string): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

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
    } catch {
      return false;
    }

    return false;
  });
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: (process.env.NODE_ENV ?? "development") === "production",
  port: getNumberEnv("PORT", DEFAULT_PORT),
  clientOrigin: parseOrigins(process.env.CLIENT_ORIGIN)[0] ?? getDefaultClientOrigins()[0] ?? "http://localhost:5173",
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
