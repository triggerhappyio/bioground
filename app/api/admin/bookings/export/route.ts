// Staff-only JSON export of bookings in the landing page's record shape —
// paste it into the claude.ai store dashboard's "웹 예약 가져오기" while
// that dashboard is still in use alongside /admin/bookings. Contains
// health data for consented bookings, so it is gated exactly like /admin.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth, STAFF_ROLES } from "@/lib/auth";
import { BOOKING_STORES, storeToday, toDashboardRecord } from "@/lib/bookings";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !STAFF_ROLES.includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const from = DATE_RE.test(sp.get("from") || "") ? sp.get("from")! : storeToday();
  const to = DATE_RE.test(sp.get("to") || "") ? sp.get("to")! : from;
  const store = sp.get("store") || "";
  const rows = await prisma.booking.findMany({
    where: {
      date: { gte: from, lte: to },
      status: { notIn: ["CANCELLED"] },
      ...(store && BOOKING_STORES[store] ? { storeCode: store } : {})
    },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: 2000
  });
  return new NextResponse(JSON.stringify(rows.map(toDashboardRecord), null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${from}-to-${to}.json"`,
      "Cache-Control": "no-store"
    }
  });
}
