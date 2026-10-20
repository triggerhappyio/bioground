import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimiterConfigured } from "@/lib/rate-limit";
import { emailAlertStatus } from "@/lib/notify-health";

// GET /api/health — is online booking able to work on this deployment?
// Booleans and the deployed commit only; no secrets, no customer data.
export const runtime = "nodejs";

export async function GET() {
  let db: "ok" | "error" = "ok";
  let bookingTable: "ok" | "missing" | "unknown" = "unknown";
  try {
    const rows = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('public."Booking"') IS NOT NULL AS ok`;
    bookingTable = rows[0]?.ok ? "ok" : "missing";
  } catch (err) {
    db = "error";
    console.error("[health] database check failed", err);
  }
  const limiter = rateLimiterConfigured();
  const production = process.env.NODE_ENV === "production";
  const bookingsAccepted = db === "ok" && bookingTable === "ok" && (limiter || !production);
  const body = {
    ok: bookingsAccepted,
    bookingsAccepted,
    database: db,
    bookingTable,
    rateLimiter: limiter ? "configured" : "missing",
    emailAlerts: emailAlertStatus().active ? "on" : "off",
    authSecret: process.env.AUTH_SECRET ? "set" : "missing",
    deployment: {
      env: process.env.VERCEL_ENV ?? "local",
      commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null
    }
  };
  return NextResponse.json(body, { status: bookingsAccepted ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
