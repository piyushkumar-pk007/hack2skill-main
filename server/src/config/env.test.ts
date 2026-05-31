import { afterEach, describe, expect, it } from "vitest";
import { isAllowedClientOrigin } from "./env.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalClientOrigin = process.env.CLIENT_ORIGIN;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;

  if (originalClientOrigin === undefined) {
    delete process.env.CLIENT_ORIGIN;
    return;
  }

  process.env.CLIENT_ORIGIN = originalClientOrigin;
});

describe("isAllowedClientOrigin", () => {
  it("allows exact configured origins", () => {
    process.env.CLIENT_ORIGIN = "http://localhost:5173,https://client.example.com";

    expect(isAllowedClientOrigin("https://client.example.com")).toBe(true);
  });

  it("allows wildcard Vercel origins", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CLIENT_ORIGIN;

    expect(isAllowedClientOrigin("https://hack2skill-main.vercel.app")).toBe(true);
    expect(isAllowedClientOrigin("https://example.com")).toBe(false);
  });
});
