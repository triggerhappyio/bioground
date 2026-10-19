"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth, STAFF_ROLES } from "@/lib/auth";
import { BookingStatus } from "@prisma/client";
import { makeBookingCode, parseStaffBooking } from "@/lib/bookings";

// Same rule as lib/actions/orders.ts: every action re-checks role itself,
// on top of the admin layout + proxy checks.
async function requireStaff() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !STAFF_ROLES.includes(role)) {
    throw new Error("Unauthorized");
  }
  return session;
}

const VALID_STATUS: string[] = Object.values(BookingStatus);

export async function setBookingStatus(bookingId: string, formData: FormData) {
  await requireStaff();
  const status = String(formData.get("status") || "");
  if (!VALID_STATUS.includes(status)) throw new Error("Invalid booking status");
  const now = new Date();
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: status as BookingStatus,
      ...(status === "ARRIVED" ? { arrivedAt: now } : {}),
      ...(status === "DONE" ? { completedAt: now } : {}),
      ...(status === "CANCELLED" ? { cancelledAt: now } : {}),
      // "Back to booked" clears the timestamps it is undoing.
      ...(status === "BOOKED" ? { arrivedAt: null, completedAt: null, cancelledAt: null } : {})
    }
  });
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");
}

export async function saveBookingNotes(bookingId: string, formData: FormData) {
  await requireStaff();
  const notes = String(formData.get("staffNotes") || "").slice(0, 2000);
  await prisma.booking.update({ where: { id: bookingId }, data: { staffNotes: notes || null } });
  revalidatePath(`/admin/bookings/${bookingId}`);
}

export async function createStaffBooking(formData: FormData) {
  await requireStaff();
  const f: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (typeof v === "string") f[k] = v;
  });
  const parsed = parseStaffBooking(f);
  if (!parsed.ok) {
    redirect(`/admin/bookings?store=${encodeURIComponent(f.store || "")}&date=${encodeURIComponent(f.date || "")}&error=${encodeURIComponent(parsed.error)}`);
  }
  const d = parsed.data;
  let id = "";
  for (let attempt = 0; attempt < 3 && !id; attempt++) {
    try {
      const row = await prisma.booking.create({
        data: {
          code: makeBookingCode(),
          storeCode: d.storeCode,
          date: d.date,
          time: d.time,
          source: d.source,
          status: d.source === "WALKIN" ? "ARRIVED" : "BOOKED",
          arrivedAt: d.source === "WALKIN" ? new Date() : null,
          name: d.name,
          phone: d.phone,
          phoneDigits: d.phoneDigits,
          partyType: d.partyType,
          lang: d.lang,
          contactMethod: d.contactMethod,
          contactConsent: d.contactConsent,
          customerType: d.customerType,
          lastScanMonth: d.lastScanMonth,
          nextRescanMonth: d.nextRescanMonth,
          purpose: d.purpose,
          wearingModel: d.wearingModel
        },
        select: { id: true }
      });
      id = row.id;
    } catch (e: any) {
      if (e?.code !== "P2002") throw e; // booking-code collision -> retry
    }
  }
  if (!id) throw new Error("Could not create booking");
  revalidatePath("/admin/bookings");
  redirect(`/admin/bookings?store=${d.storeCode}&date=${d.date}`);
}
