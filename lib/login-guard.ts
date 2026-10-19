// Brute-force protection for staff sign-in (/admin/login).
//
// Only FAILED attempts count. Two limits, both over a 15-minute sliding
// window, backed by the same Upstash limiter as the booking API:
//   - 5 failures per IP + email  — stops guessing one account's password
//   - 30 failures per IP         — stops spraying many emails from one IP
// A successful sign-in clears the IP + email counter.
//
// Enforced in two places: the /api/auth route wrapper answers a blocked
// request with a real 429 before Auth.js runs, and authorize() re-checks
// and records failures (so the limit holds even if the wrapper is bypassed).
import { checkRateLimit, peekRateLimit, resetRateLimit } from "@/lib/rate-limit";

export const LOGIN_FAIL_LIMIT = 5;
export const LOGIN_IP_FAIL_LIMIT = 30;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMITED_CODE = "rate_limited";

const PAIR_SCOPE = "login-fail";
const IP_SCOPE = "login-fail-ip";

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function pairKey(ip: string, email: string) {
  return `${ip}|${email}`;
}

/** Blocked if either limit is reached. retryAfterMs is the longer wait. */
export async function loginBlocked(ip: string, email: string): Promise<{ blocked: boolean; retryAfterMs: number }> {
  const open: { allowed: boolean; retryAfterMs?: number } = { allowed: true };
  const [pair, byIp] = await Promise.all([
    email ? peekRateLimit(pairKey(ip, email), LOGIN_FAIL_LIMIT, LOGIN_WINDOW_MS, PAIR_SCOPE) : Promise.resolve(open),
    peekRateLimit(ip, LOGIN_IP_FAIL_LIMIT, LOGIN_WINDOW_MS, IP_SCOPE)
  ]);
  const blocked = !pair.allowed || !byIp.allowed;
  const retryAfterMs = Math.max(pair.retryAfterMs ?? 0, byIp.retryAfterMs ?? 0);
  return { blocked, retryAfterMs: blocked ? retryAfterMs || LOGIN_WINDOW_MS : 0 };
}

export async function recordLoginFailure(ip: string, email: string): Promise<void> {
  await Promise.all([
    email ? checkRateLimit(pairKey(ip, email), LOGIN_FAIL_LIMIT, LOGIN_WINDOW_MS, PAIR_SCOPE) : Promise.resolve(),
    checkRateLimit(ip, LOGIN_IP_FAIL_LIMIT, LOGIN_WINDOW_MS, IP_SCOPE)
  ]);
}

export async function clearLoginFailures(ip: string, email: string): Promise<void> {
  if (email) await resetRateLimit(pairKey(ip, email), LOGIN_FAIL_LIMIT, LOGIN_WINDOW_MS, PAIR_SCOPE);
}
