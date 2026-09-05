import { describe, expect, it } from "vitest";
import {
  HELD_FEE_STATES,
  bookingStateCounts,
  splitFees,
  verifiedProfileCount,
} from "./admin-metrics-rules";

describe("bookingStateCounts", () => {
  it("buckets rows into an exhaustive per-state record with zeros for absent states", () => {
    const counts = bookingStateCounts([
      { state: "PAID_OUT" },
      { state: "PAID_OUT" },
      { state: "CANCELLED_WEATHER" },
    ]);
    expect(counts.PAID_OUT).toBe(2);
    expect(counts.CANCELLED_WEATHER).toBe(1);
    expect(counts.REQUESTED).toBe(0);
    expect(Object.keys(counts)).toHaveLength(10); // every machine state present
  });
  it("ignores unknown state strings rather than throwing (defensive against drift)", () => {
    expect(bookingStateCounts([{ state: "NOT_A_STATE" }]).REQUESTED).toBe(0);
  });
});

describe("splitFees", () => {
  it("sums feeCents into realized (PAID_OUT) vs held (funds-held lifecycle) buckets", () => {
    const rows = [
      { state: "PAID_OUT", feeCents: 5000 },
      { state: "PAID_OUT", feeCents: 7000 },
      { state: "ESCROW_FUNDED", feeCents: 1100 },
      { state: "IN_PROGRESS", feeCents: 1200 },
      { state: "COMPLETED", feeCents: 1300 },
      { state: "DISPUTE_WINDOW", feeCents: 1400 },
      { state: "REQUESTED", feeCents: 9999 },        // not yet funded — counts nowhere
      { state: "CANCELLED_WEATHER", feeCents: 9999 }, // cancelled — counts nowhere
    ];
    expect(splitFees(rows)).toEqual({ realizedFeeCents: 12000, heldFeeCents: 5000 });
  });
  it("empty input yields zeros", () => {
    expect(splitFees([])).toEqual({ realizedFeeCents: 0, heldFeeCents: 0 });
  });
});

describe("HELD_FEE_STATES", () => {
  it("is exactly the funds-held lifecycle", () => {
    expect([...HELD_FEE_STATES].sort()).toEqual(
      ["COMPLETED", "DISPUTE_WINDOW", "ESCROW_FUNDED", "IN_PROGRESS"].sort()
    );
  });
});

describe("verifiedProfileCount", () => {
  it("counts distinct profiles, not docs", () => {
    expect(
      verifiedProfileCount([{ profileId: "a" }, { profileId: "a" }, { profileId: "b" }])
    ).toBe(2);
  });
  it("empty input yields zero", () => {
    expect(verifiedProfileCount([])).toBe(0);
  });
});
