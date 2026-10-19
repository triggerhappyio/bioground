// Small presentational pieces shared by the bookings list and detail pages.
import { setBookingStatus } from "@/lib/actions/bookings";
import { SELF_CHECK_LEVELS } from "@/lib/bookings";

export const STATUS_LABEL: Record<string, string> = {
  BOOKED: "Booked",
  ARRIVED: "Arrived",
  CHECKING: "In check",
  DONE: "Done",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled"
};
export const PURPOSE_LABEL: Record<string, string> = {
  REGULAR_RESCAN: "5-month rescan",
  EARLY_CHECK: "Early check",
  WEAR_CONSULT: "Wearing consult"
};
export const LANG_LABEL: Record<string, string> = { ko: "Korean", en: "English", es: "Spanish", vi: "Vietnamese", zh: "Chinese" };
export const CONTACT_LABEL: Record<string, string> = {
  sms: "Text",
  call: "Call",
  kakao: "KakaoTalk",
  whatsapp: "WhatsApp",
  zalo: "Zalo",
  wechat: "WeChat"
};
const OVERALL = ["Good", "Watch", "Check now"];

export function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "dark" | "alert" | "warn" }) {
  const styles: Record<string, React.CSSProperties> = {
    plain: { border: "1px solid var(--bone-dim)", color: "var(--ink)" },
    dark: { background: "var(--ink)", color: "var(--white)", border: "1px solid var(--ink)" },
    alert: { background: "#b3261e", color: "#fff", border: "1px solid #b3261e" },
    warn: { border: "1px solid #a15c00", color: "#a15c00" }
  };
  return (
    <span style={{ display: "inline-block", fontSize: 12, padding: "1px 8px", borderRadius: 999, marginRight: 4, marginBottom: 2, ...styles[tone] }}>
      {children}
    </span>
  );
}

type SelfCheckLike = { overall?: number | null; flags?: string[] } | null;

export function BookingBadges({
  b
}: {
  b: {
    customerType: string;
    purpose: string | null;
    lang: string;
    source: string;
    medicalReferralFlag: boolean;
    healthConsent: boolean;
    selfCheck: unknown;
  };
}) {
  const sc = (b.healthConsent ? (b.selfCheck as SelfCheckLike) : null) || null;
  return (
    <>
      {b.customerType === "RETURNING" ? <Badge tone="dark">Returning · wearing</Badge> : <Badge>New</Badge>}
      {b.purpose && <Badge>{PURPOSE_LABEL[b.purpose]}</Badge>}
      {b.source !== "WEB" && <Badge>{b.source === "PHONE" ? "Phone" : "Walk-in"}</Badge>}
      {b.lang !== "ko" && <Badge>{LANG_LABEL[b.lang] ?? b.lang}</Badge>}
      {sc && typeof sc.overall === "number" && (
        <Badge tone={sc.overall === 2 ? "warn" : "plain"}>
          Self-check: {OVERALL[sc.overall]} · {(sc.flags || []).length} signals
        </Badge>
      )}
      {b.medicalReferralFlag && <Badge tone="alert">Medical check advised</Badge>}
    </>
  );
}

export function levelLabel(v: unknown): string {
  return v === 0 || v === 1 || v === 2 ? SELF_CHECK_LEVELS[v] : "Not answered";
}

const NEXT_ACTIONS: Record<string, [string, string][]> = {
  BOOKED: [["ARRIVED", "Arrived"], ["NO_SHOW", "No-show"], ["CANCELLED", "Cancel"]],
  ARRIVED: [["CHECKING", "Start check"], ["DONE", "Done"]],
  CHECKING: [["DONE", "Done"]],
  DONE: [],
  NO_SHOW: [["BOOKED", "Back to booked"]],
  CANCELLED: [["BOOKED", "Back to booked"]]
};

export function StatusActions({ id, status }: { id: string; status: string }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {(NEXT_ACTIONS[status] || []).map(([to, label]) => (
        <form key={to} action={setBookingStatus.bind(null, id)}>
          <input type="hidden" name="status" value={to} />
          <button
            className={to === "ARRIVED" || to === "DONE" || to === "CHECKING" ? "btn btn-brass" : "btn btn-ghost"}
            type="submit"
            style={{ padding: "4px 10px", fontSize: 13 }}
          >
            {label}
          </button>
        </form>
      ))}
    </div>
  );
}
