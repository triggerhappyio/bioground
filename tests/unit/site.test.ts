import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderLanding, siteUrl, SITE_URL_PLACEHOLDER } from "@/lib/site";
import { emailAlertStatus } from "@/lib/notify-health";

const KEYS = ["NEXT_PUBLIC_APP_URL", "VERCEL_PROJECT_PRODUCTION_URL"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }));
afterEach(() => KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }));

describe("siteUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL, without a trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bioground.com/";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "bioground.vercel.app";
    expect(siteUrl("http://localhost:3000")).toBe("https://bioground.com");
  });
  it("falls back to the Vercel production domain, then the request origin", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "bioground-lebal-os-s-projects.vercel.app";
    expect(siteUrl("http://x")).toBe("https://bioground-lebal-os-s-projects.vercel.app");
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(siteUrl("http://localhost:4000/")).toBe("http://localhost:4000");
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});

describe("renderLanding", () => {
  it("fills every placeholder", () => {
    const t = `<link rel="canonical" href="${SITE_URL_PLACEHOLDER}/"><meta property="og:image" content="${SITE_URL_PLACEHOLDER}/og/a.png">`;
    expect(renderLanding(t, "https://bioground.com")).toBe(
      '<link rel="canonical" href="https://bioground.com/"><meta property="og:image" content="https://bioground.com/og/a.png">'
    );
  });
});

describe("emailAlertStatus", () => {
  it("is active only when all three settings are present", () => {
    expect(emailAlertStatus({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.com", BOOKING_NOTIFY_EMAIL: "c@d.com" })).toEqual({ active: true, missing: [] });
    expect(emailAlertStatus({ RESEND_API_KEY: "re_x", EMAIL_FROM: " " })).toEqual({
      active: false,
      missing: ["EMAIL_FROM", "BOOKING_NOTIFY_EMAIL"]
    });
  });
});
