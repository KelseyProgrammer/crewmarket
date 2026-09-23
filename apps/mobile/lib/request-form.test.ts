import { describe, expect, it } from "vitest";
import {
  canSubmit,
  clampDays,
  draftPayload,
  draftQuote,
  effectiveDays,
  localIsoDate,
  type RequestDraft,
} from "./request-form";

/* Pure request-form logic (slice 5). Money math itself comes straight from
   @crewmarket/types (the same computeQuote the web form and the server use) —
   these tests pin the FORM's behavior around it: day coercion, submit gating,
   and the exact payload shape POST /api/bookings expects. Preview-only (R4). */

const rates = { dayRateUsd: 100 }; // offers FULL_DAY + MULTI_DAY only (M-2)

function draft(over: Partial<RequestDraft> = {}): RequestDraft {
  return { tripType: "FULL_DAY", days: 1, startDate: "2026-10-01", piAttested: true, ...over };
}

describe("clampDays", () => {
  it("clamps into 1..maxDaysFor and rounds", () => {
    expect(clampDays("MULTI_DAY", 0)).toBe(1);
    expect(clampDays("MULTI_DAY", 11)).toBe(10);
    expect(clampDays("MULTI_DAY", 2.6)).toBe(3);
    expect(clampDays("FULL_DAY", 7)).toBe(1);
  });
});

describe("effectiveDays", () => {
  it("forces 1 for single-day trip types, passes days through otherwise", () => {
    expect(effectiveDays("FULL_DAY", 5)).toBe(1);
    expect(effectiveDays("HALF_DAY", 5)).toBe(1);
    expect(effectiveDays("MULTI_DAY", 5)).toBe(5);
  });
});

describe("draftQuote", () => {
  it("quotes with effective days (single-day stays a 1-day quote)", () => {
    expect(draftQuote(rates, draft({ days: 5 }))).toEqual({
      rateCents: 10000,
      feeCents: 1200,
      totalCents: 11200,
    });
  });

  it("null for a trip type the crew does not list (M-2)", () => {
    expect(draftQuote(rates, draft({ tripType: "HALF_DAY" }))).toBeNull();
  });

  it("null for out-of-range multi-day", () => {
    expect(draftQuote(rates, draft({ tripType: "MULTI_DAY", days: 11 }))).toBeNull();
  });
});

describe("canSubmit", () => {
  it("true only with a quote, a picked date, and the P&I attestation (D-4)", () => {
    expect(canSubmit(rates, draft())).toBe(true);
    expect(canSubmit(rates, draft({ piAttested: false }))).toBe(false);
    expect(canSubmit(rates, draft({ startDate: "" }))).toBe(false);
    expect(canSubmit(rates, draft({ startDate: "10/01/2026" }))).toBe(false);
    expect(canSubmit(rates, draft({ tripType: "HALF_DAY" }))).toBe(false);
  });
});

describe("draftPayload", () => {
  it("matches POST /api/bookings shape, with effective days applied", () => {
    expect(draftPayload("p1", draft({ days: 5 }))).toEqual({
      crewProfileId: "p1",
      tripType: "FULL_DAY",
      startDate: "2026-10-01",
      days: 1,
      piAttested: true,
    });
  });
});

describe("localIsoDate", () => {
  it("formats in LOCAL time — toISOString would shift the day west of UTC", () => {
    // Date(2026, 9, 1) is local midnight Oct 1 — must stay Oct 1 in any zone.
    expect(localIsoDate(new Date(2026, 9, 1))).toBe("2026-10-01");
    expect(localIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
