// Public endpoint for BioGround foot-check bookings (the landing page at
// /bioground, or the same page hosted on another allowed origin).
//
// Guarantees, in order of importance:
//  1. Health data is only stored with explicit consent — enforced in
//     parseBookingInput(), not here, so no caller can skip it.
//  2. A retried or double-submitted booking never creates a second row:
//     clientBookingId is UNIQUE, and a repeat returns the original booking.
//  3. A time slot is never overbooked under concurrent requests: the count
//     and the insert run inside one transaction holding a Postgres advisory
//     lock keyed on (store, date, time), so two requests for the last seat
//     serialize instead of both seeing "1 left".
//  4. Abuse limits: per-IP rate limit (fails closed in production without
//     Redis, like registration/checkout), body size cap, honeypot field,
//     and an Origin allowlist for browser requests.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientKeyFrom, assertRateLimiterConfigured } from "@/lib/rate-limit";
import { sendEmail, bookingStaffNotificationEmail } from "@/lib/email";
import {
  BOOKING_STORES,
  allowedOrigins,
  makeBookingCode,
  parseBookingInput,
  slotCapacity
} from "@/lib/bookings";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 20_000;

function originAllowed(req: NextRequest): { ok: boolean; origin: string | null } {
  const origin = req.headers.get("origin");
  // No Origin header = not a browser cross-site request (curl, server-to-
  // server). Still rate-limited and validated like everything else.
  if (!origin) return { ok: true, origin: null };
  const self = new URL(req.url).origin;
  if (origin === self) return { ok: true, origin };
  return { ok: allowedOrigins().includes(origin), origin };
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

export async function OPTIONS(req: NextRequest) {
  const { ok, origin } = originAllowed(req);
  if (!ok) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

class SlotFullError extends Error {}

export async function POST(req: NextRequest) {
  const { ok: originOk, origin } = originAllowed(req);
  if (!originOk) return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });

  assertRateLimiterConfigured();
  const rateLimit = await checkRateLimit(clientKeyFrom(req, "booking"), 10, 60 * 60 * 1000, "booking"); // 10/hour/IP
  if (!rateLimit.allowed) return json({ error: "Too many booking attempts. Please call the store." }, 429, origin);

  // The landing page sends text/plain (a CORS "simple request", so no
  // preflight); application/json works too. Parse the raw text either way.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413, origin);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request body." }, 400, origin);
  }

  const parsed = parseBookingInput(body);
  if (!parsed.ok) return json({ error: parsed.error, field: parsed.field }, 400, origin);
  const input = parsed.data;

  // Idempotent retry: same client id -> the booking that already exists.
  const existing = await prisma.booking.findUnique({ where: { clientBookingId: input.clientBookingId } });
  if (existing) return json({ ok: true, code: existing.code, duplicate: true }, 200, origin);

  const capacity = slotCapacity();
  let created: { id: string; code: string } | null = null;

  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    try {
      created = await prisma.$transaction(async (tx) => {
        const lockKey = `booking:${input.storeCode}:${input.date}:${input.time}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const taken = await tx.booking.count({
          where: {
            storeCode: input.storeCode,
            date: input.date,
            time: input.time,
            status: { notIn: ["CANCELLED", "NO_SHOW"] }
          }
        });
        if (taken >= capacity) throw new SlotFullError();
        return tx.booking.create({
          data: {
            code: makeBookingCode(),
            clientBookingId: input.clientBookingId,
            storeCode: input.storeCode,
            date: input.date,
            time: input.time,
            source: "WEB",
            name: input.name,
            phone: input.phone,
            phoneDigits: input.phoneDigits,
            partyType: input.partyType,
            lang: input.lang,
            pageLang: input.pageLang,
            contactMethod: input.contactMethod,
            contactConsent: input.contactConsent,
            customerType: input.customerType,
            lastScanMonth: input.lastScanMonth,
            nextRescanMonth: input.nextRescanMonth,
            purpose: input.purpose,
            wearingModel: input.wearingModel,
            healthConsent: input.healthConsent,
            healthConsentAt: input.healthConsent ? new Date() : null,
            selfCheck: input.selfCheck ?? Prisma.DbNull,
            medicalReferralFlag: input.medicalReferralFlag
          },
          select: { id: true, code: true }
        });
      });
    } catch (err) {
      if (err instanceof SlotFullError) {
        return json({ error: "slot_full", message: "That time is fully booked. Please choose another time." }, 409, origin);
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const target = String((err.meta as { target?: unknown } | undefined)?.target ?? "");
        if (target.includes("clientBookingId")) {
          // Lost a race against an identical concurrent submit — return the winner.
          const winner = await prisma.booking.findUnique({ where: { clientBookingId: input.clientBookingId } });
          if (winner) return json({ ok: true, code: winner.code, duplicate: true }, 200, origin);
        }
        continue; // booking-code collision: retry with a fresh code
      }
      console.error("[bookings] create failed", err);
      return json({ error: "Could not save your booking. Please try again or call the store." }, 500, origin);
    }
  }
  if (!created) return json({ error: "Could not save your booking. Please try again." }, 500, origin);

  // Best-effort staff alert, after the row is committed. A mail failure must
  // never turn a saved booking into an error for the customer.
  const notifyTo = process.env.BOOKING_NOTIFY_EMAIL;
  if (notifyTo) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const result = await sendEmail(
      bookingStaffNotificationEmail({
        to: notifyTo,
        code: created.code,
        storeName: BOOKING_STORES[input.storeCode]?.name ?? input.storeCode,
        date: input.date,
        time: input.time,
        name: input.name,
        phone: input.phone,
        returning: input.customerType === "RETURNING",
        adminUrl: `${appUrl}/admin/bookings/${created.id}`
      })
    ).catch((e) => ({ sent: false, error: String(e) }));
    if (!result.sent) console.warn(`[bookings] staff notification for ${created.code} not sent`, result.error ?? "");
  }

  return json({ ok: true, code: created.code }, 201, origin);
}
