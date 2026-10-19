import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { saveBookingNotes } from "@/lib/actions/bookings";
import {
  BOOKING_STORES,
  SELF_CHECK_DOMAINS,
  SELF_CHECK_FLAGS,
  SELF_CHECK_PAIN,
  storeToday
} from "@/lib/bookings";
import { BookingBadges, CONTACT_LABEL, LANG_LABEL, PURPOSE_LABEL, STATUS_LABEL, StatusActions, levelLabel } from "../ui";

export const revalidate = 0;

type SelfCheckView = {
  overall?: number | null;
  answered?: number;
  domains?: Record<string, number | null>;
  flags?: string[];
  pain?: string[];
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--bone-dim)" }}>
      <th style={{ textAlign: "left", padding: "8px 12px 8px 0", color: "var(--steel)", fontWeight: 400, width: 200 }}>{k}</th>
      <td style={{ padding: "8px 0" }}>{v}</td>
    </tr>
  );
}

export default async function AdminBookingDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const { id } = await paramsPromise;
  const b = await prisma.booking.findUnique({ where: { id } });
  if (!b) notFound();

  const history = await prisma.booking.findMany({
    where: { phoneDigits: b.phoneDigits, id: { not: b.id } },
    orderBy: { date: "desc" },
    take: 20
  });
  const sc = b.healthConsent ? (b.selfCheck as SelfCheckView | null) : null;
  const thisMonth = storeToday().slice(0, 7);

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <p style={{ marginBottom: 8 }}>
        <Link href={`/admin/bookings?store=${b.storeCode}&date=${b.date}`}>← Bookings on {b.date}</Link>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>
        {b.name} <span style={{ fontSize: 15, color: "var(--steel)" }}>{b.code}</span>
      </h1>
      <div style={{ marginBottom: 14 }}>
        <BookingBadges b={b} />
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
        <span>
          Status: <b>{STATUS_LABEL[b.status]}</b>
        </span>
        <StatusActions id={b.id} status={b.status} />
      </div>

      {b.medicalReferralFlag && (
        <div style={{ background: "#fdecea", border: "1px solid #b3261e", padding: 14, borderRadius: 4, marginBottom: 20 }}>
          <b>The customer selected a “see a clinician first” item when booking.</b> Confirm it at the start of the visit. If it
          applies, recommend a podiatrist or their physician before any in-store check or product talk.
        </div>
      )}

      <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", marginBottom: 24 }}>
        <tbody>
          <Row k="Visit" v={`${BOOKING_STORES[b.storeCode]?.name ?? b.storeCode}, ${b.date} at ${b.time}`} />
          <Row k="Phone" v={<a href={`tel:${b.phoneDigits}`}>{b.phone}</a>} />
          <Row k="Confirm by" v={`${CONTACT_LABEL[b.contactMethod] ?? b.contactMethod}${b.contactConsent ? "" : " (no contact consent recorded)"}`} />
          <Row k="Consultation language" v={LANG_LABEL[b.lang] ?? b.lang} />
          <Row k="Coming" v={b.partyType === "parent" ? "With a parent" : b.partyType === "family" ? "With family" : "Alone"} />
          <Row k="Booked via" v={`${b.source === "WEB" ? "Website" : b.source === "PHONE" ? "Phone" : "Walk-in"} · ${b.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`} />
          {b.customerType === "RETURNING" && (
            <>
              <Row k="Customer" v="Returning — already wearing JGP Arch Built-in" />
              <Row k="Purpose" v={b.purpose ? PURPOSE_LABEL[b.purpose] : "—"} />
              <Row k="Last scan" v={b.lastScanMonth || "Not given"} />
              <Row
                k="Regular rescan"
                v={b.nextRescanMonth ? `${b.nextRescanMonth}${b.nextRescanMonth > thisMonth ? " (this visit is an early check)" : " (due)"}` : "—"}
              />
              <Row k="Model / size" v={b.wearingModel || "—"} />
            </>
          )}
          <Row k="Health-info consent" v={b.healthConsent ? `Yes (${b.healthConsentAt?.toISOString().slice(0, 10)})` : "No — self-check not received"} />
        </tbody>
      </table>

      {sc && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>At-home self-check ({sc.answered ?? 0}/11 answered)</h2>
          <p style={{ color: "var(--steel)", fontSize: 13, marginBottom: 12 }}>
            The customer&apos;s own answers to screening questions — not a diagnosis. Use the pressure plate and balance test to
            confirm, and explain results in wellness terms.
          </p>
          <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", marginBottom: 12 }}>
            <tbody>
              {Object.entries(SELF_CHECK_DOMAINS).map(([k, label]) => (
                <Row key={k} k={label} v={levelLabel(sc.domains?.[k])} />
              ))}
            </tbody>
          </table>
          {!!sc.flags?.length && (
            <p style={{ fontSize: 14 }}>
              <b>Signals:</b> {sc.flags.map((f) => SELF_CHECK_FLAGS[f] ?? f).join(", ")}
            </p>
          )}
          {!!sc.pain?.length && (
            <p style={{ fontSize: 14 }}>
              <b>Discomfort after standing/walking:</b> {sc.pain.map((p) => SELF_CHECK_PAIN[p] ?? p).join(", ")}
            </p>
          )}
        </div>
      )}

      <form action={saveBookingNotes.bind(null, b.id)} style={{ marginBottom: 28 }}>
        <label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>Staff notes</label>
        <textarea name="staffNotes" defaultValue={b.staffNotes ?? ""} rows={4} maxLength={2000} style={{ width: "100%", padding: 8 }} />
        <button className="btn btn-ghost" type="submit" style={{ marginTop: 8 }}>
          Save notes
        </button>
      </form>

      <h2 style={{ fontSize: 18, marginBottom: 8 }}>Other visits with this phone number</h2>
      {history.length ? (
        <ul style={{ fontSize: 14, paddingLeft: 18 }}>
          {history.map((h) => (
            <li key={h.id}>
              <Link href={`/admin/bookings/${h.id}`}>
                {h.date} {h.time}
              </Link>{" "}
              — {BOOKING_STORES[h.storeCode]?.name ?? h.storeCode}, {STATUS_LABEL[h.status]}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: "var(--steel)", fontSize: 14 }}>None yet.</p>
      )}
    </div>
  );
}
