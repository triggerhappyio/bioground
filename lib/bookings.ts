// Foot-check bookings — validation and normalization, kept free of Prisma
// and Next.js imports so it can be unit-tested directly (tests/unit/
// bookings.test.ts). The API route (app/api/bookings/route.ts) and the
// admin Server Actions (lib/actions/bookings.ts) both go through here, so
// there is exactly one definition of what a valid booking is.
//
// The wire format is the record the BioGround landing page builds in
// submit() (public/bioground/index.html), the same shape the claude.ai
// store dashboard's "웹 예약 가져오기" import reads.

export const BOOKING_TIMEZONE = "America/Los_Angeles";

// Stores that take foot-check bookings. Keys are the codes stored on
// Booking.storeCode (matching InventoryLocation.code where one exists);
// `aliases` are the ids the landing page and the claude.ai dashboard use.
// Adding a franchise store = one entry here (+ the landing page's STORES).
export const BOOKING_STORES: Record<string, { name: string; aliases: string[] }> = {
  KTOWN: { name: "Koreatown (Los Angeles)", aliases: ["ktown", "los-angeles"] },
  BP: { name: "Buena Park", aliases: ["bp", "buena-park"] }
};

// One-hour slots, matching the landing page's SLOTS list.
export const BOOKING_SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
export const BOOKING_MAX_DAYS_AHEAD = 60;
export const RESCAN_MONTHS = 5;

export const LANGS = ["ko", "en", "es", "vi", "zh"] as const;
export const CONTACT_METHODS = ["sms", "call", "kakao", "whatsapp", "zalo", "wechat"] as const;
export const PARTY_TYPES = ["self", "parent", "family"] as const;
export const PURPOSES = ["REGULAR_RESCAN", "EARLY_CHECK", "WEAR_CONSULT"] as const;

// Self-check vocabulary (the landing page's quiz). Anything else in an
// incoming payload is dropped, never stored.
export const SELF_CHECK_FLAGS: Record<string, string> = {
  f_flat: "Lower-arch tendency",
  f_high: "High-arch tendency",
  f_hv1: "Big toe leans slightly",
  f_hv2: "Big toe leans",
  f_hv3: "Big toe leans a lot",
  f_pron: "Heel bends inward",
  f_sup: "Heel tilts outward",
  f_rise: "Hard to do single-leg heel raises",
  f_valgus: "Knees angle inward",
  f_varus: "Knees bow apart",
  f_bal1: "One-leg stance under 10 s",
  f_bal3: "Tandem stance under 10 s (CDC higher fall-risk group)",
  f_wear_in: "Inner sole wear",
  f_wear_out: "Outer sole wear",
  f_wear_lr: "Left–right wear differs",
  f_c_hal: "Big-toe callus",
  f_c_met: "Ball-of-foot callus",
  f_c_lat: "Little-toe callus",
  f_c_heel: "Heel callus",
  f_am: "Morning first-step heel pain"
};
export const SELF_CHECK_PAIN: Record<string, string> = {
  p_foot: "Soles / heel",
  p_ankle: "Ankle",
  p_knee: "Knee",
  p_hip: "Hip",
  p_back: "Lower back"
};
export const SELF_CHECK_DOMAINS: Record<string, string> = {
  st: "Foot structure",
  fn: "Foot strength & leg alignment",
  bl: "Balance",
  ld: "Signs of uneven load"
};
export const SELF_CHECK_LEVELS = ["Good", "Watch", "Check needed"];

export type SelfCheckLevel = 0 | 1 | 2 | null;
export type SelfCheck = {
  v: 1;
  overall: SelfCheckLevel;
  domains: Record<string, SelfCheckLevel>;
  answered: number;
  flags: string[];
  pain: string[];
  rf: boolean;
};

export type BookingInput = {
  clientBookingId: string;
  storeCode: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  phoneDigits: string;
  partyType: (typeof PARTY_TYPES)[number];
  lang: (typeof LANGS)[number];
  pageLang: string | null;
  contactMethod: (typeof CONTACT_METHODS)[number];
  contactConsent: true;
  customerType: "NEW" | "RETURNING";
  lastScanMonth: string | null;
  nextRescanMonth: string | null;
  purpose: (typeof PURPOSES)[number] | null;
  wearingModel: string | null;
  healthConsent: boolean;
  selfCheck: SelfCheck | null;
  medicalReferralFlag: boolean;
};

export type ParseResult = { ok: true; data: BookingInput } | { ok: false; error: string; field?: string };

const fail = (error: string, field?: string): ParseResult => ({ ok: false, error, field });

export function digitsOnly(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

function cleanText(v: unknown, max: number): string {
  // Collapse whitespace and drop control characters; this text is shown
  // back to staff, never interpreted.
  return String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function resolveStoreCode(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (BOOKING_STORES[upper]) return upper;
  const lower = s.toLowerCase();
  for (const [code, store] of Object.entries(BOOKING_STORES)) {
    if (store.aliases.includes(lower)) return code;
  }
  return null;
}

/** Today's date at the store (YYYY-MM-DD), independent of server timezone. */
export function storeToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/** Current store-local wall-clock time as HH:MM. */
export function storeNowHM(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOOKING_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h === "24" ? "00" : h}:${m}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

function isRealDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Whole days from a to b (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const pa = DATE_RE.exec(a)!;
  const pb = DATE_RE.exec(b)!;
  return Math.round((Date.UTC(+pb[1], +pb[2] - 1, +pb[3]) - Date.UTC(+pa[1], +pa[2] - 1, +pa[3])) / 86400000);
}

/** "2026-07" + 5 -> "2026-12". */
export function addMonthsToMonth(ym: string, n: number): string | null {
  const m = MONTH_RE.exec(ym);
  if (!m) return null;
  const total = +m[1] * 12 + (+m[2] - 1) + n;
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/** "2026-05-20" + 5 months -> "2026-10-20" (day clamped to the target month's length). */
export function addMonthsToDate(ymd: string, n: number): string {
  const m = DATE_RE.exec(ymd)!;
  const ym = addMonthsToMonth(`${m[1]}-${m[2]}`, n)!;
  const [y, mo] = ym.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${ym}-${String(Math.min(+m[3], lastDay)).padStart(2, "0")}`;
}

function level(v: unknown): SelfCheckLevel {
  return v === 0 || v === 1 || v === 2 ? v : null;
}

export function parseSelfCheck(raw: unknown): SelfCheck | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const domains: Record<string, SelfCheckLevel> = {};
  const rd = r.domains && typeof r.domains === "object" ? (r.domains as Record<string, unknown>) : {};
  for (const k of Object.keys(SELF_CHECK_DOMAINS)) domains[k] = level(rd[k]);
  const pick = (v: unknown, allowed: Record<string, string>) =>
    Array.from(new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x in allowed)));
  const answered = Number.isInteger(r.answered) ? Math.max(0, Math.min(11, r.answered as number)) : 0;
  return {
    v: 1,
    overall: level(r.overall),
    domains,
    answered,
    flags: pick(r.flags, SELF_CHECK_FLAGS),
    pain: pick(r.pain, SELF_CHECK_PAIN),
    rf: r.rf === true
  };
}

/**
 * Validate and normalize one booking request body (the landing page's
 * record). `now` is injectable for tests.
 *
 * Health-data rule: unless `healthConsent === true`, the self-check and the
 * medical-referral flag are discarded here, before anything is stored.
 */
export function parseBookingInput(raw: unknown, now: Date = new Date()): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Invalid request body.");
  const b = raw as Record<string, unknown>;

  // Honeypot: the landing page never sends this field; simple form bots fill every input.
  if (typeof b.website === "string" && b.website.trim() !== "") return fail("Invalid request.");

  const clientBookingId = String(b.id ?? "").trim();
  if (!/^BK[A-Z0-9]{4,24}$/.test(clientBookingId)) return fail("Invalid booking id.", "id");

  const storeCode = resolveStoreCode(b.store);
  if (!storeCode) return fail("Unknown store.", "store");

  const date = String(b.date ?? "");
  if (!isRealDate(date)) return fail("Choose a valid date.", "date");
  const today = storeToday(now);
  const ahead = daysBetween(today, date);
  if (ahead < 0) return fail("That date has already passed.", "date");
  if (ahead > BOOKING_MAX_DAYS_AHEAD) return fail(`Bookings open up to ${BOOKING_MAX_DAYS_AHEAD} days ahead.`, "date");

  const time = String(b.time ?? "");
  if (!BOOKING_SLOTS.includes(time)) return fail("Choose one of the listed times.", "time");
  if (ahead === 0 && time <= storeNowHM(now)) return fail("That time has already passed today.", "time");

  const name = cleanText(b.name, 60);
  if (!name) return fail("Enter your name.", "name");

  const phone = cleanText(b.phone, 24);
  const phoneDigits = digitsOnly(phone);
  if (phoneDigits.length < 7 || phoneDigits.length > 15) return fail("Enter a phone number we can reach.", "phone");

  if (b.consent !== true) return fail("Contact consent is required to book.", "consent");

  const whoIdx = Number(b.who);
  const partyType = PARTY_TYPES[Number.isInteger(whoIdx) && whoIdx >= 0 && whoIdx < PARTY_TYPES.length ? whoIdx : 0];
  const lang = (LANGS as readonly string[]).includes(String(b.lang)) ? (b.lang as BookingInput["lang"]) : "ko";
  const pageLang = (LANGS as readonly string[]).includes(String(b.pageLang)) ? String(b.pageLang) : null;
  const contactMethod = (CONTACT_METHODS as readonly string[]).includes(String(b.contact))
    ? (b.contact as BookingInput["contactMethod"])
    : "sms";

  let customerType: BookingInput["customerType"] = "NEW";
  let lastScanMonth: string | null = null;
  let nextRescanMonth: string | null = null;
  let purpose: BookingInput["purpose"] = null;
  let wearingModel: string | null = null;
  if (b.ctype === "returning") {
    customerType = "RETURNING";
    const ls = String(b.lastScan ?? "");
    if (ls) {
      const m = MONTH_RE.exec(ls);
      if (!m || +m[2] < 1 || +m[2] > 12) return fail("Choose a valid month for your last scan.", "lastScan");
      if (ls > today.slice(0, 7)) return fail("Your last scan can't be in the future.", "lastScan");
      lastScanMonth = ls;
      nextRescanMonth = addMonthsToMonth(ls, RESCAN_MONTHS);
    }
    const pi = Number(b.purpose);
    purpose = PURPOSES[Number.isInteger(pi) && pi >= 0 && pi < PURPOSES.length ? pi : 0];
    wearingModel = cleanText(b.model, 60) || null;
  }

  const healthConsent = b.healthConsent === true;
  const selfCheck = healthConsent ? parseSelfCheck(b.selfcheck) : null;

  return {
    ok: true,
    data: {
      clientBookingId,
      storeCode,
      date,
      time,
      name,
      phone,
      phoneDigits,
      partyType,
      lang,
      pageLang,
      contactMethod,
      contactConsent: true,
      customerType,
      lastScanMonth,
      nextRescanMonth,
      purpose,
      wearingModel,
      healthConsent,
      selfCheck,
      medicalReferralFlag: !!selfCheck?.rf
    }
  };
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

export function makeBookingCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return `BK-${s}`;
}

/** Max bookings per store per time slot (one 1:1 check per staff station). */
export function slotCapacity(): number {
  const n = Number(process.env.BOOKING_SLOT_CAPACITY);
  return Number.isInteger(n) && n > 0 ? n : 2;
}

/** Origins allowed to POST /api/bookings from a browser. */
export function allowedOrigins(): string[] {
  const list = (process.env.BOOKING_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const app = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (app) list.push(app);
  // On Vercel, the production domain (custom domain if set, else *.vercel.app)
  // is allowed without extra configuration.
  const vercelProd = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim().replace(/\/$/, "");
  if (vercelProd) list.push(`https://${vercelProd}`);
  return Array.from(new Set(list));
}

/**
 * Export shape for the claude.ai store dashboard's "웹 예약 가져오기" —
 * the same record the landing page builds, so the dashboard's importer
 * needs no second format.
 */
export function toDashboardRecord(b: {
  code: string;
  clientBookingId: string | null;
  storeCode: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  partyType: string;
  lang: string;
  pageLang: string | null;
  contactMethod: string;
  contactConsent: boolean;
  customerType: "NEW" | "RETURNING";
  lastScanMonth: string | null;
  nextRescanMonth: string | null;
  purpose: string | null;
  wearingModel: string | null;
  healthConsent: boolean;
  selfCheck: unknown;
  createdAt: Date;
}) {
  const storeAlias = BOOKING_STORES[b.storeCode]?.aliases[0] ?? b.storeCode.toLowerCase();
  const rec: Record<string, unknown> = {
    id: b.clientBookingId || b.code.replace("-", ""),
    code: b.code,
    store: storeAlias,
    date: b.date,
    time: b.time,
    who: Math.max(0, PARTY_TYPES.indexOf(b.partyType as (typeof PARTY_TYPES)[number])),
    name: b.name,
    phone: b.phone,
    lang: b.lang,
    pageLang: b.pageLang,
    contact: b.contactMethod,
    consent: b.contactConsent,
    created: b.createdAt.toISOString(),
    ctype: b.customerType === "RETURNING" ? "returning" : "new",
    healthConsent: b.healthConsent
  };
  if (b.customerType === "RETURNING") {
    rec.lastScan = b.lastScanMonth || "";
    rec.nextRegular = b.nextRescanMonth || "";
    rec.purpose = Math.max(0, PURPOSES.indexOf((b.purpose || "REGULAR_RESCAN") as (typeof PURPOSES)[number]));
    rec.model = b.wearingModel || "";
  }
  if (b.healthConsent && b.selfCheck) rec.selfcheck = b.selfCheck;
  return rec;
}

// ── Staff-entered bookings (phone / walk-in) ─────────────────────────────
// Looser than the public parser on purpose: staff may book a slot that has
// already started today (a walk-in at 14:20 goes in the 14:00 slot), and
// they collect contact consent verbally. No self-check data is ever
// accepted here — that only comes from the customer's own consented submit.
export type StaffBookingInput = Omit<BookingInput, "clientBookingId" | "contactConsent"> & {
  source: "PHONE" | "WALKIN";
  contactConsent: boolean;
};

export function parseStaffBooking(f: Record<string, string | undefined>, now: Date = new Date()): { ok: true; data: StaffBookingInput } | { ok: false; error: string } {
  const storeCode = resolveStoreCode(f.store);
  if (!storeCode) return { ok: false, error: "Choose a store." };
  const date = String(f.date ?? "");
  if (!isRealDate(date)) return { ok: false, error: "Choose a valid date." };
  const ahead = daysBetween(storeToday(now), date);
  if (ahead < 0) return { ok: false, error: "That date has already passed." };
  if (ahead > BOOKING_MAX_DAYS_AHEAD) return { ok: false, error: `Up to ${BOOKING_MAX_DAYS_AHEAD} days ahead.` };
  const time = String(f.time ?? "");
  if (!BOOKING_SLOTS.includes(time)) return { ok: false, error: "Choose a listed time slot." };
  const name = cleanText(f.name, 60);
  if (!name) return { ok: false, error: "Enter the customer's name." };
  const phone = cleanText(f.phone, 24);
  const phoneDigits = digitsOnly(phone);
  if (phoneDigits.length < 7 || phoneDigits.length > 15) return { ok: false, error: "Enter a valid phone number." };
  const source = f.source === "WALKIN" ? "WALKIN" : "PHONE";
  const lang = (LANGS as readonly string[]).includes(String(f.lang)) ? (f.lang as BookingInput["lang"]) : "ko";
  const contactMethod = (CONTACT_METHODS as readonly string[]).includes(String(f.contact)) ? (f.contact as BookingInput["contactMethod"]) : "call";
  const partyType = (PARTY_TYPES as readonly string[]).includes(String(f.party)) ? (f.party as BookingInput["partyType"]) : "self";
  let customerType: "NEW" | "RETURNING" = "NEW";
  let lastScanMonth: string | null = null;
  let nextRescanMonth: string | null = null;
  let purpose: BookingInput["purpose"] = null;
  let wearingModel: string | null = null;
  if (f.customerType === "RETURNING") {
    customerType = "RETURNING";
    const ls = String(f.lastScan ?? "");
    if (ls) {
      if (!MONTH_RE.test(ls) || ls > storeToday(now).slice(0, 7)) return { ok: false, error: "Last scan month is invalid." };
      lastScanMonth = ls;
      nextRescanMonth = addMonthsToMonth(ls, RESCAN_MONTHS);
    }
    purpose = (PURPOSES as readonly string[]).includes(String(f.purpose)) ? (f.purpose as BookingInput["purpose"]) : "REGULAR_RESCAN";
    wearingModel = cleanText(f.model, 60) || null;
  }
  return {
    ok: true,
    data: {
      storeCode, date, time, name, phone, phoneDigits, partyType, lang, pageLang: null, contactMethod,
      contactConsent: f.contactConsent === "on", customerType, lastScanMonth, nextRescanMonth, purpose, wearingModel,
      healthConsent: false, selfCheck: null, medicalReferralFlag: false, source
    }
  };
}

// ── 5-month rescan follow-up ─────────────────────────────────────────────
export type RescanRow = { id: string; phoneDigits: string; name: string; phone: string; storeCode: string; date: string; status: string };
export type RescanDue = { latest: RescanRow; dueDate: string; overdue: boolean };

/**
 * Customers whose most recent completed check is (or within `windowDays`
 * will be) RESCAN_MONTHS old, and who don't already have a later booking.
 * Grouped by phone number, since web bookings carry no account/email.
 */
export function rescanDueList(rows: RescanRow[], today: string, windowDays = 14): RescanDue[] {
  const byPhone = new Map<string, RescanRow[]>();
  for (const r of rows) {
    if (!r.phoneDigits) continue;
    const list = byPhone.get(r.phoneDigits) ?? [];
    list.push(r);
    byPhone.set(r.phoneDigits, list);
  }
  const out: RescanDue[] = [];
  for (const list of byPhone.values()) {
    const done = list.filter((r) => r.status === "DONE").sort((a, b) => b.date.localeCompare(a.date));
    if (!done.length) continue;
    const latest = done[0];
    const hasLater = list.some(
      (r) => r.date > latest.date && ["BOOKED", "ARRIVED", "CHECKING", "DONE"].includes(r.status)
    );
    if (hasLater) continue;
    const dueDate = addMonthsToDate(latest.date, RESCAN_MONTHS);
    if (daysBetween(today, dueDate) <= windowDays) out.push({ latest, dueDate, overdue: dueDate < today });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
