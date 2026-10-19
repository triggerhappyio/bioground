import { describe, it, expect } from "vitest";
import {
  LOGIN_FAIL_LIMIT,
  LOGIN_IP_FAIL_LIMIT,
  LOGIN_RATE_LIMITED_CODE,
  clearLoginFailures,
  loginBlocked,
  normalizeEmail,
  recordLoginFailure
} from "@/lib/login-guard";

// No Upstash env in tests → the in-memory limiter is used (same semantics).
let n = 0;
const freshIp = () => `10.0.0.${++n}`;

describe("staff sign-in brute-force guard", () => {
  it("allows the first 5 failures and blocks the 6th attempt for that IP + email", async () => {
    const ip = freshIp();
    const email = "staff@bioground.com";
    for (let i = 0; i < LOGIN_FAIL_LIMIT; i++) {
      expect((await loginBlocked(ip, email)).blocked).toBe(false);
      await recordLoginFailure(ip, email);
    }
    const r = await loginBlocked(ip, email);
    expect(r.blocked).toBe(true);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.retryAfterMs).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it("does not block the same email from another IP, or another email from the same IP", async () => {
    const ip = freshIp();
    for (let i = 0; i < LOGIN_FAIL_LIMIT; i++) await recordLoginFailure(ip, "a@x.com");
    expect((await loginBlocked(ip, "a@x.com")).blocked).toBe(true);
    expect((await loginBlocked(freshIp(), "a@x.com")).blocked).toBe(false);
    expect((await loginBlocked(ip, "b@x.com")).blocked).toBe(false);
  });

  it("blocks an IP that sprays many different emails", async () => {
    const ip = freshIp();
    for (let i = 0; i < LOGIN_IP_FAIL_LIMIT; i++) await recordLoginFailure(ip, `user${i}@x.com`);
    expect((await loginBlocked(ip, "someone-new@x.com")).blocked).toBe(true);
  });

  it("clears the IP + email counter after a successful sign-in", async () => {
    const ip = freshIp();
    for (let i = 0; i < LOGIN_FAIL_LIMIT - 1; i++) await recordLoginFailure(ip, "c@x.com");
    await clearLoginFailures(ip, "c@x.com");
    for (let i = 0; i < LOGIN_FAIL_LIMIT - 1; i++) await recordLoginFailure(ip, "c@x.com");
    expect((await loginBlocked(ip, "c@x.com")).blocked).toBe(false);
  });

  it("normalizes emails so case and spaces don't create separate counters", () => {
    expect(normalizeEmail("  Staff@BioGround.com ")).toBe("staff@bioground.com");
    expect(normalizeEmail(undefined)).toBe("");
  });

  it("uses the error code the login page checks for", () => {
    expect(LOGIN_RATE_LIMITED_CODE).toBe("rate_limited");
  });
});
