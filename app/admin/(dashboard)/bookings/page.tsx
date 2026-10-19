import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createStaffBooking } from "@/lib/actions/bookings";
import {
  BOOKING_SLOTS,
  BOOKING_STORES,
  addMonthsToDate,
  daysBetween,
  rescanDueList,
  storeToday,
  RESCAN_MONTHS
} from "@/lib/bookings";
import { Badge, BookingBadges, STATUS_LABEL, StatusActions } from "./ui";

export const revalidate = 0;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export default async function AdminBookingsPage({
  searchParams: searchParamsPromise
}: {
  searchParams: Promise<{ store?: string; date?: string; error?: string }>;
}) {
  const sp = await searchParamsPromise;
  const today = storeToday();
  const date = sp.date && DATE_RE.test(sp.date) ? sp.date : today;
  const store = sp.store && BOOKING_STORES[sp.store] ? sp.store : "";
  const storeWhere = store ? { storeCode: store } : {};

  const [dayRows, upcoming, rescanRows] = await Promise.all([
    prisma.booking.findMany({
      where: { ...storeWhere, date },
      orderBy: [{ time: "asc" }, { createdAt: "asc" }]
    }),
    prisma.booking.groupBy({
      by: ["date"],
      where: { ...storeWhere, date: { gte: today, lte: shiftDate(today, 6) }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
      _count: { _all: true }
    }),
    // Completed checks old enough to be near their 5-month rescan, plus any
    // later bookings for the same people (to exclude those already rebooked).
    prisma.booking.findMany({
      where: { ...storeWhere, date: { gte: addMonthsToDate(today, -(RESCAN_MONTHS + 7)) } },
      select: { id: true, phoneDigits: true, name: true, phone: true, storeCode: true, date: true, status: true },
      take: 5000
    })
  ]);

  const due = rescanDueList(rescanRows, today);
  const counts = dayRows.reduce<Record<string, number>>((m, b) => ((m[b.status] = (m[b.status] || 0) + 1), m), {});
  const active = dayRows.filter((b) => b.status !== "CANCELLED");
  const upcomingMap = new Map(upcoming.map((u) => [u.date, u._count._all]));
  const qs = (d: string) => `/admin/bookings?${new URLSearchParams({ ...(store ? { store } : {}), date: d })}`;
  const exportHref = `/api/admin/bookings/export?${new URLSearchParams({ ...(store ? { store } : {}), from: date, to: shiftDate(date, 30) })}`;

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Foot-check bookings</h1>
      <p style={{ color: "var(--steel)", fontSize: 14, marginBottom: 20 }}>
        Free 15-minute checks booked on the BioGround page, by phone, or as walk-ins. Store-local time (Los Angeles).
      </p>

      {sp.error && (
        <p style={{ background: "#fdecea", color: "#b3261e", padding: "10px 12px", borderRadius: 4, marginBottom: 16 }}>{sp.error}</p>
      )}

      <form style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", fontSize: 13, gap: 4 }}>
          Store
          <select name="store" defaultValue={store} style={{ padding: 8 }}>
            <option value="">All stores</option>
            {Object.entries(BOOKING_STORES).map(([code, s]) => (
              <option key={code} value={code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", fontSize: 13, gap: 4 }}>
          Date
          <input type="date" name="date" defaultValue={date} style={{ padding: 7 }} />
        </label>
        <button className="btn btn-ghost" type="submit">Show</button>
        <Link href={qs(shiftDate(date, -1))} className="btn btn-ghost">← Prev day</Link>
        <Link href={qs(today)} className="btn btn-ghost">Today</Link>
        <Link href={qs(shiftDate(date, 1))} className="btn btn-ghost">Next day →</Link>
        <a href={exportHref} className="btn btn-ghost" title="JSON for the claude.ai store dashboard's web booking import">
          Export 30 days (JSON)
        </a>
      </form>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {Array.from({ length: 7 }, (_, i) => shiftDate(today, i)).map((d) => (
          <Link
            key={d}
            href={qs(d)}
            className="card"
            style={{ padding: "8px 12px", fontSize: 13, outline: d === date ? "2px solid var(--ink)" : undefined }}
          >
            {d.slice(5)} · <b>{upcomingMap.get(d) || 0}</b>
          </Link>
        ))}
      </div>

      <p style={{ fontSize: 14, marginBottom: 12 }}>
        {date}: <b>{active.length}</b> booked · arrived {counts.ARRIVED || 0} · in check {counts.CHECKING || 0} · done{" "}
        {counts.DONE || 0} · no-show {counts.NO_SHOW || 0}
      </p>

      <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", marginBottom: 28 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--steel)", borderBottom: "1px solid var(--bone-dim)" }}>
            <th style={{ padding: "8px 0", width: 60 }}>Time</th>
            {!store && <th>Store</th>}
            <th>Customer</th>
            <th>Details</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {dayRows.map((b) => (
            <tr key={b.id} style={{ borderBottom: "1px solid var(--bone-dim)", opacity: b.status === "CANCELLED" ? 0.5 : 1 }}>
              <td style={{ padding: "10px 0" }}>{b.time}</td>
              {!store && <td>{BOOKING_STORES[b.storeCode]?.name ?? b.storeCode}</td>}
              <td>
                <Link href={`/admin/bookings/${b.id}`}>{b.name}</Link>
                <div style={{ color: "var(--steel)", fontSize: 12 }}>
                  {b.phone} · {b.code}
                </div>
              </td>
              <td>
                <BookingBadges b={b} />
              </td>
              <td>{STATUS_LABEL[b.status]}</td>
              <td>
                <StatusActions id={b.id} status={b.status} />
              </td>
            </tr>
          ))}
          {dayRows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: "16px 0", color: "var(--steel)" }}>
                No bookings on {date}.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <details className="card" style={{ padding: 16, marginBottom: 28 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Add a phone booking or walk-in</summary>
        <form action={createStaffBooking} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginTop: 14 }}>
          <label style={{ fontSize: 13 }}>
            Store
            <select name="store" defaultValue={store || "KTOWN"} style={{ display: "block", width: "100%", padding: 7 }}>
              {Object.entries(BOOKING_STORES).map(([code, s]) => (
                <option key={code} value={code}>{s.name}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Type
            <select name="source" defaultValue="PHONE" style={{ display: "block", width: "100%", padding: 7 }}>
              <option value="PHONE">Phone booking</option>
              <option value="WALKIN">Walk-in (arrived now)</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Date
            <input type="date" name="date" defaultValue={date} required style={{ display: "block", width: "100%", padding: 6 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Time
            <select name="time" style={{ display: "block", width: "100%", padding: 7 }}>
              {BOOKING_SLOTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Name
            <input name="name" required maxLength={60} style={{ display: "block", width: "100%", padding: 6 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Phone
            <input name="phone" type="tel" required maxLength={24} style={{ display: "block", width: "100%", padding: 6 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Language
            <select name="lang" defaultValue="ko" style={{ display: "block", width: "100%", padding: 7 }}>
              <option value="ko">Korean</option><option value="en">English</option><option value="es">Spanish</option>
              <option value="vi">Vietnamese</option><option value="zh">Chinese</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Customer
            <select name="customerType" defaultValue="NEW" style={{ display: "block", width: "100%", padding: 7 }}>
              <option value="NEW">First visit</option>
              <option value="RETURNING">Returning (already wearing)</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Last scan month (returning)
            <input type="month" name="lastScan" style={{ display: "block", width: "100%", padding: 6 }} />
          </label>
          <label style={{ fontSize: 13 }}>
            Purpose (returning)
            <select name="purpose" defaultValue="REGULAR_RESCAN" style={{ display: "block", width: "100%", padding: 7 }}>
              <option value="REGULAR_RESCAN">5-month rescan</option>
              <option value="EARLY_CHECK">Early check</option>
              <option value="WEAR_CONSULT">Wearing consult</option>
            </select>
          </label>
          <label style={{ fontSize: 13 }}>
            Model / size (returning)
            <input name="model" maxLength={60} style={{ display: "block", width: "100%", padding: 6 }} />
          </label>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name="contactConsent" defaultChecked /> Customer agreed to be contacted
          </label>
          <div>
            <button className="btn btn-brass" type="submit">Save booking</button>
          </div>
        </form>
      </details>

      <h2 style={{ fontSize: 20, marginBottom: 6 }}>5-month rescan due</h2>
      <p style={{ color: "var(--steel)", fontSize: 13, marginBottom: 10 }}>
        Customers whose last completed check is {RESCAN_MONTHS} months old (or will be within 2 weeks) and who have no later booking.
        Invite them to compare their new footprint with the first one.
      </p>
      <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--steel)", borderBottom: "1px solid var(--bone-dim)" }}>
            <th style={{ padding: "8px 0" }}>Due</th>
            <th>Customer</th>
            <th>Store</th>
            <th>Last check</th>
          </tr>
        </thead>
        <tbody>
          {due.map((r) => (
            <tr key={r.latest.id} style={{ borderBottom: "1px solid var(--bone-dim)" }}>
              <td style={{ padding: "10px 0" }}>
                {r.dueDate} {r.overdue ? <Badge tone="warn">overdue {-daysBetween(r.dueDate, today)}d</Badge> : null}
              </td>
              <td>
                <Link href={`/admin/bookings/${r.latest.id}`}>{r.latest.name}</Link>{" "}
                <a href={`tel:${r.latest.phoneDigits}`} style={{ color: "var(--steel)", fontSize: 12 }}>{r.latest.phone}</a>
              </td>
              <td>{BOOKING_STORES[r.latest.storeCode]?.name ?? r.latest.storeCode}</td>
              <td>{r.latest.date}</td>
            </tr>
          ))}
          {due.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: "16px 0", color: "var(--steel)" }}>
                Nobody is due for a rescan in the next two weeks.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
