import { afterEach, describe, expect, it } from "vitest";
import { isAllowedClientOrigin } from "./env.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalClientOrigin = process.env.CLIENT_ORIGIN;
const originalVercelUrl = process.env.VERCEL_URL;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;

  if (originalClientOrigin === undefined) {
    delete process.env.CLIENT_ORIGIN;
  } else {
    process.env.CLIENT_ORIGIN = originalClientOrigin;
  }

  if (originalVercelUrl === undefined) {
    delete process.env.VERCEL_URL;
    return;
  }

  process.env.VERCEL_URL = originalVercelUrl;
});

describe("isAllowedClientOrigin", () => {
  it("allows exact configured origins", () => {
    process.env.CLIENT_ORIGIN = "http://localhost:5173,https://client.example.com";

    expect(isAllowedClientOrigin("https://client.example.com")).toBe(true);
  });

  it("treats localhost and 127.0.0.1 as local equivalents", () => {
    process.env.CLIENT_ORIGIN = "http://localhost:5173";

    expect(isAllowedClientOrigin("http://127.0.0.1:5173")).toBe(true);
  });

  it("allows the deployed Vercel origin exactly", () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_URL = "hack2skill-main.vercel.app";

    expect(isAllowedClientOrigin("https://hack2skill-main.vercel.app")).toBe(true);
    expect(isAllowedClientOrigin("https://example.com")).toBe(false);
  });

  it("does not treat unrelated Vercel subdomains as allowed", () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_URL = "hack2skill-main.vercel.app";

    expect(isAllowedClientOrigin("https://another-project.vercel.app")).toBe(false);
  });
});
