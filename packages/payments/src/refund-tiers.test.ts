import { describe, expect, it } from "vitest";
import { REFUND_TIERS, isCancelState, refundCentsFor } from "./refund-tiers";

describe("refund tiers (G-1: placeholder config, not policy)", () => {
  it("v1 placeholder is 100% for every cancel state", () => {
    expect(REFUND_TIERS.CANCELLED_WEATHER).toBe(1.0);
    expect(REFUND_TIERS.CANCELLED_BOAT).toBe(1.0);
    expect(REFUND_TIERS.CANCELLED_CREW).toBe(1.0);
  });

  it("refundCentsFor applies the tier and rounds to whole cents", () => {
    expect(refundCentsFor("CANCELLED_WEATHER", 11200)).toBe(11200);
  });

  it("clamps into [0, totalCents] even if a future tier is out of range", () => {
    expect(refundCentsFor("CANCELLED_BOAT", 0)).toBe(0);
  });

  it("isCancelState narrows only the three cancel states", () => {
    expect(isCancelState("CANCELLED_WEATHER")).toBe(true);
    expect(isCancelState("PAID_OUT")).toBe(false);
    expect(isCancelState("ESCROW_FUNDED")).toBe(false);
  });
});
