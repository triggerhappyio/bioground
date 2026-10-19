// Booking API against a real Postgres (CI service). Same rule as the other
// integration tests: no DATABASE_URL / unreachable DB = SKIPPED, never a
// fake PASS. Exercises the real route handler, including the advisory-lock
// capacity guard, which only means something on real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getTestPrisma } from "./helpers";
import { storeToday } from "@/lib/bookings";

let prisma: PrismaClient | null = null;
const RUN = `${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
let ipCounter = 0;

// A future slot well away from "now" so the store-local same-day time check never interferes.
function futureDate(days: number): string {
  const [y, m, d] = storeToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const DATE = futureDate(20);

function body(over: Record<string, unknown> = {}) {
  return {
    id: `BK${RUN}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    store: "ktown",
    date: DATE,
    time: "15:00",
    who: 0,
    name: "TEST Booking",
    phone: "213-555-0199",
    lang: "ko",
    contact: "sms",
    consent: true,
    ctype: "new",
    ...over
  };
}

function req(payload: unknown, headers: Record<string, string> = {}) {
  ipCounter += 1;
  return new Request("http://localhost/api/bookings", {
    method: "POST",
    // Distinct test IPs so the per-IP rate limit (10/hour) never trips mid-suite.
    headers: { "content-type": "text/plain;charset=utf-8", "x-forwarded-for": `10.9.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`, ...headers },
    body: JSON.stringify(payload)
  });
}

beforeAll(async () => {
  prisma = await getTestPrisma();
});

afterAll(async () => {
  if (!prisma) return;
  await prisma.booking.deleteMany({ where: { date: DATE, name: "TEST Booking" } }).catch(() => {});
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DATABASE_URL)("POST /api/bookings", () => {
  it("creates a booking and returns a BK- code", async () => {
    if (!prisma) return;
    const { POST } = await import("@/app/api/bookings/route");
    const b = body({ time: "11:00" });
    const res = await POST(req(b) as any);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.code).toMatch(/^BK-[A-Z0-9]{6}$/);
    const row = await prisma.booking.findUnique({ where: { clientBookingId: b.id } });
    expect(row?.storeCode).toBe("KTOWN");
    expect(row?.phoneDigits).toBe("2135550199");
  });

  it("is idempotent: the same client id twice -> one row, same code", async () => {
    if (!prisma) return;
    const { POST } = await import("@/app/api/bookings/route");
    const b = body({ time: "12:00" });
    const [r1, r2] = await Promise.all([POST(req(b) as any), POST(req(b) as any)]);
    const codes = [(await r1.json()).code, (await r2.json()).code];
    expect(codes[0]).toBe(codes[1]);
    expect(await prisma.booking.count({ where: { clientBookingId: b.id } })).toBe(1);
  });

  it("never overbooks a slot under concurrent requests (capacity 2 by default)", async () => {
    if (!prisma) return;
    const { POST } = await import("@/app/api/bookings/route");
    const results = await Promise.all(Array.from({ length: 6 }, () => POST(req(body({ time: "16:00" })) as any)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(2);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    expect(await prisma.booking.count({ where: { storeCode: "KTOWN", date: DATE, time: "16:00" } })).toBe(2);
  });

  it("stores the self-check only with health consent", async () => {
    if (!prisma) return;
    const { POST } = await import("@/app/api/bookings/route");
    const selfcheck = { v: 1, overall: 2, domains: { st: 2 }, answered: 11, flags: ["f_flat"], pain: ["p_knee"], rf: true };
    const noConsent = body({ time: "13:00", healthConsent: false, selfcheck });
    const withConsent = body({ time: "14:00", healthConsent: true, selfcheck });
    expect((await POST(req(noConsent) as any)).status).toBe(201);
    expect((await POST(req(withConsent) as any)).status).toBe(201);
    const a = await prisma.booking.findUnique({ where: { clientBookingId: noConsent.id } });
    const b = await prisma.booking.findUnique({ where: { clientBookingId: withConsent.id } });
    expect(a?.selfCheck).toBeNull();
    expect(a?.medicalReferralFlag).toBe(false);
    expect((b?.selfCheck as any)?.flags).toEqual(["f_flat"]);
    expect(b?.medicalReferralFlag).toBe(true);
    expect(b?.healthConsentAt).toBeTruthy();
  });

  it("rejects disallowed browser origins and invalid bodies", async () => {
    if (!prisma) return;
    const { POST } = await import("@/app/api/bookings/route");
    expect((await POST(req(body(), { origin: "https://evil.example" }) as any)).status).toBe(403);
    expect((await POST(req({ ...body(), phone: "1" }) as any)).status).toBe(400);
    const bad = new Request("http://localhost/api/bookings", { method: "POST", headers: { "x-forwarded-for": "10.99.0.1" }, body: "not json" });
    expect((await POST(bad as any)).status).toBe(400);
  });
});
