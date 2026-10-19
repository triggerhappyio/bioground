import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { assertRateLimiterConfigured, clientIpFrom } from "@/lib/rate-limit";
import { LOGIN_RATE_LIMITED_CODE, loginBlocked, normalizeEmail } from "@/lib/login-guard";

export const runtime = "nodejs";

export const GET = handlers.GET;

// Staff sign-in posts to /api/auth/callback/credentials. When this IP + email
// (or this IP) is over the failed-attempt limit, answer 429 before Auth.js
// runs. The body keeps Auth.js's { url } shape so next-auth/react's signIn()
// resolves normally and the login page can read `code=rate_limited`.
export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith("/callback/credentials")) {
    assertRateLimiterConfigured();
    let email = "";
    try {
      email = normalizeEmail((await req.clone().formData()).get("email"));
    } catch {
      // Not form data — let Auth.js reject it.
    }
    const { blocked, retryAfterMs } = await loginBlocked(clientIpFrom(req), email);
    if (blocked) {
      const url = new URL("/admin/login", req.nextUrl.origin);
      url.searchParams.set("error", "CredentialsSignin");
      url.searchParams.set("code", LOGIN_RATE_LIMITED_CODE);
      return NextResponse.json(
        { url: url.toString() },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)), "Cache-Control": "no-store" } }
      );
    }
  }
  return handlers.POST(req);
}
