import { describe, it, expect } from "vitest";
import {
  addMonthsToDate,
  addMonthsToMonth,
  makeBookingCode,
  parseBookingInput,
  parseStaffBooking,
  rescanDueList,
  resolveStoreCode,
  storeToday,
  toDashboardRecord,
  type RescanRow
} from "@/lib/bookings";

// 2026-10-16 09:00 in Los Angeles (PDT, UTC-7) = 16:00 UTC.
const NOW = new Date("2026-10-16T16:00:00Z");

const base = {
  id: "BKMGT3X2A1QZ",
  store: "ktown",
  date: "2026-10-20",
  time: "10:00",
  who: 0,
  name: "김영희",
  phone: "(213) 555-0101",
  lang: "ko",
  pageLang: "ko",
  contact: "kakao",
  consent: true,
  ctype: "new"
};

const selfcheck = {
  v: 1,
  overall: 2,
  domains: { st: 2, fn: 1, bl: 1, ld: 0 },
  answered: 11,
  flags: ["f_flat", "f_hv2", "not_a_flag"],
  pain: ["p_knee", "p_nope"],
  rf: true
};

describe("parseBookingInput — the landing page record", () => {
  it("accepts a valid new-customer booking and normalizes it", () => {
    const r = parseBookingInput(base, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.storeCode).toBe("KTOWN");
    expect(r.data.phoneDigits).toBe("2135550101");
    expect(r.data.partyType).toBe("self");
    expect(r.data.customerType).toBe("NEW");
    expect(r.data.contactMethod).toBe("kakao");
  });

  it("drops the self-check and medical flag when health consent is not given", () => {
    const r = parseBookingInput({ ...base, healthConsent: false, selfcheck }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.healthConsent).toBe(false);
    expect(r.data.selfCheck).toBeNull();
    expect(r.data.medicalReferralFlag).toBe(false);
  });

  it("keeps a sanitized self-check only with explicit consent", () => {
    const r = parseBookingInput({ ...base, healthConsent: true, selfcheck }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.selfCheck?.flags).toEqual(["f_flat", "f_hv2"]);
    expect(r.data.selfCheck?.pain).toEqual(["p_knee"]);
    expect(r.data.selfCheck?.domains).toEqual({ st: 2, fn: 1, bl: 1, ld: 0 });
    expect(r.data.medicalReferralFlag).toBe(true);
  });

  it("treats a truthy-but-not-true consent value as no consent", () => {
    const r = parseBookingInput({ ...base, healthConsent: "yes", selfcheck }, NOW);
    expect(r.ok && r.data.selfCheck).toBeNull();
  });

  it("computes the 5-month rescan for returning customers", () => {
    const r = parseBookingInput({ ...base, ctype: "returning", lastScan: "2026-07", purpose: 1, model: "M455A 250" }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.customerType).toBe("RETURNING");
    expect(r.data.nextRescanMonth).toBe("2026-12");
    expect(r.data.purpose).toBe("EARLY_CHECK");
    expect(r.data.wearingModel).toBe("M455A 250");
  });

  it("rejects a last-scan month in the future", () => {
    const r = parseBookingInput({ ...base, ctype: "returning", lastScan: "2027-01" }, NOW);
    expect(r).toMatchObject({ ok: false, field: "lastScan" });
  });

  it("requires contact consent", () => {
    expect(parseBookingInput({ ...base, consent: false }, NOW)).toMatchObject({ ok: false, field: "consent" });
  });

  it("rejects past dates, far-future dates, and passed times today (store-local)", () => {
    expect(parseBookingInput({ ...base, date: "2026-10-15" }, NOW)).toMatchObject({ ok: false, field: "date" });
    expect(parseBookingInput({ ...base, date: "2027-01-30" }, NOW)).toMatchObject({ ok: false, field: "date" });
    expect(parseBookingInput({ ...base, date: "2026-10-16", time: "09:00" }, NOW)).toMatchObject({ ok: false, field: "time" });
    expect(parseBookingInput({ ...base, date: "2026-10-16", time: "10:00" }, NOW).ok).toBe(true);
  });

  it("rejects unknown stores, off-list times, bad ids, short phones, impossible dates", () => {
    expect(parseBookingInput({ ...base, store: "nyc" }, NOW)).toMatchObject({ ok: false, field: "store" });
    expect(parseBookingInput({ ...base, time: "10:30" }, NOW)).toMatchObject({ ok: false, field: "time" });
    expect(parseBookingInput({ ...base, id: "x" }, NOW)).toMatchObject({ ok: false, field: "id" });
    expect(parseBookingInput({ ...base, phone: "555" }, NOW)).toMatchObject({ ok: false, field: "phone" });
    expect(parseBookingInput({ ...base, date: "2026-02-30" }, NOW)).toMatchObject({ ok: false, field: "date" });
  });

  it("rejects the honeypot and non-object bodies", () => {
    expect(parseBookingInput({ ...base, website: "http://spam" }, NOW).ok).toBe(false);
    expect(parseBookingInput(null, NOW).ok).toBe(false);
    expect(parseBookingInput([base], NOW).ok).toBe(false);
  });

  it("strips control characters and clamps lengths", () => {
    const r = parseBookingInput({ ...base, name: "  Ana\u0000  Lopez\n" + "x".repeat(100) }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.name.startsWith("Ana Lopez")).toBe(true);
    expect(r.data.name.length).toBeLessThanOrEqual(60);
  });
});

describe("store and date helpers", () => {
  it("resolves landing/dashboard aliases to store codes", () => {
    expect(resolveStoreCode("ktown")).toBe("KTOWN");
    expect(resolveStoreCode("bp")).toBe("BP");
    expect(resolveStoreCode("buena-park")).toBe("BP");
    expect(resolveStoreCode("KTOWN")).toBe("KTOWN");
    expect(resolveStoreCode("")).toBeNull();
  });

  it("uses the store's date, not UTC's", () => {
    // 2026-10-17 05:00 UTC is still the 16th in Los Angeles.
    expect(storeToday(new Date("2026-10-17T05:00:00Z"))).toBe("2026-10-16");
  });

  it("adds months across year ends and clamps short months", () => {
    expect(addMonthsToMonth("2026-09", 5)).toBe("2027-02");
    expect(addMonthsToMonth("2026-12", 5)).toBe("2027-05");
    expect(addMonthsToDate("2026-09-30", 5)).toBe("2027-02-28");
    expect(addMonthsToDate("2026-05-20", 5)).toBe("2026-10-20");
  });

  it("makes BK- codes without ambiguous characters", () => {
    for (let i = 0; i < 200; i++) expect(makeBookingCode()).toMatch(/^BK-[A-HJ-NP-Z2-9]{6}$/);
  });
});

describe("parseStaffBooking — phone and walk-in", () => {
  it("allows a slot that already started today (walk-in)", () => {
    const r = parseStaffBooking({ store: "KTOWN", date: "2026-10-16", time: "10:00", name: "Walk In", phone: "714-555-0199", source: "WALKIN" }, new Date("2026-10-16T17:30:00Z"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.source).toBe("WALKIN");
  });

  it("never carries health data", () => {
    const r = parseStaffBooking({ store: "BP", date: "2026-10-20", time: "11:00", name: "A", phone: "7145550199", customerType: "RETURNING", lastScan: "2026-05" }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.healthConsent).toBe(false);
    expect(r.data.selfCheck).toBeNull();
    expect(r.data.nextRescanMonth).toBe("2026-10");
  });
});

describe("rescanDueList — 5-month rescan follow-up", () => {
  const row = (o: Partial<RescanRow>): RescanRow => ({
    id: Math.random().toString(36).slice(2),
    phoneDigits: "2135550101",
    name: "Kim",
    phone: "213-555-0101",
    storeCode: "KTOWN",
    date: "2026-05-20",
    status: "DONE",
    ...o
  });

  it("lists a customer whose last completed check is 5 months old", () => {
    const due = rescanDueList([row({})], "2026-10-16");
    expect(due).toHaveLength(1);
    expect(due[0].dueDate).toBe("2026-10-20");
    expect(due[0].overdue).toBe(false);
  });

  it("uses the latest completed check and ignores no-shows", () => {
    const due = rescanDueList([row({ date: "2026-01-10" }), row({ date: "2026-05-20" }), row({ date: "2026-06-01", status: "NO_SHOW" })], "2026-10-16");
    expect(due).toHaveLength(1);
    expect(due[0].latest.date).toBe("2026-05-20");
  });

  it("skips customers who already have a later booking", () => {
    expect(rescanDueList([row({}), row({ date: "2026-10-25", status: "BOOKED" })], "2026-10-16")).toHaveLength(0);
  });

  it("does not list anyone more than two weeks early", () => {
    expect(rescanDueList([row({ date: "2026-06-15" })], "2026-10-16")).toHaveLength(0);
  });

  it("flags overdue rescans", () => {
    const due = rescanDueList([row({ date: "2026-03-01" })], "2026-10-16");
    expect(due[0].overdue).toBe(true);
  });
});

describe("toDashboardRecord — export for the claude.ai store dashboard", () => {
  const rowBase = {
    code: "BK-7F3K9Q",
    clientBookingId: "BKMGT3X2A1QZ",
    storeCode: "BP",
    date: "2026-10-20",
    time: "10:00",
    name: "Ana",
    phone: "714-555-0101",
    partyType: "family",
    lang: "es",
    pageLang: "es",
    contactMethod: "whatsapp",
    contactConsent: true,
    customerType: "RETURNING" as const,
    lastScanMonth: "2026-07",
    nextRescanMonth: "2026-12",
    purpose: "EARLY_CHECK",
    wearingModel: "M455A 8",
    healthConsent: false,
    selfCheck: { overall: 2 },
    createdAt: new Date("2026-10-16T16:00:00Z")
  };

  it("matches the landing page's record shape and the dashboard's store ids", () => {
    const r = toDashboardRecord(rowBase);
    expect(r).toMatchObject({ id: "BKMGT3X2A1QZ", store: "bp", who: 2, ctype: "returning", lastScan: "2026-07", purpose: 1, contact: "whatsapp" });
  });

  it("never exports a self-check without consent", () => {
    expect(toDashboardRecord(rowBase).selfcheck).toBeUndefined();
    expect(toDashboardRecord({ ...rowBase, healthConsent: true }).selfcheck).toEqual({ overall: 2 });
  });

  it("round-trips through the public parser", () => {
    const rec = toDashboardRecord({ ...rowBase, healthConsent: true, selfCheck: { v: 1, overall: 1, domains: {}, answered: 3, flags: ["f_flat"], pain: [], rf: false } });
    const back = parseBookingInput({ ...rec, consent: true }, NOW);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.data.storeCode).toBe("BP");
      expect(back.data.purpose).toBe("EARLY_CHECK");
      expect(back.data.selfCheck?.flags).toEqual(["f_flat"]);
    }
  });
});
