import { describe, expect, it } from "vitest";
import { eventLabel, STATE_LABELS, holdFundsLabel } from "./booking-labels";

describe("eventLabel", () => {
  it("CREW_ACCEPT -> Accept booking", () => {
    expect(eventLabel("CREW_ACCEPT")).toBe("Accept booking");
  });
  it("CREW_DECLINE -> penalty-free Decline framing", () => {
    expect(eventLabel("CREW_DECLINE")).toBe("Decline");
  });
  it("CANCEL_BOAT -> Cancel booking", () => {
    expect(eventLabel("CANCEL_BOAT")).toBe("Cancel booking");
  });
  it("CANCEL_CREW -> Cancel booking", () => {
    expect(eventLabel("CANCEL_CREW")).toBe("Cancel booking");
  });
  it("CANCEL_WEATHER -> Cancel — weather", () => {
    expect(eventLabel("CANCEL_WEATHER")).toBe("Cancel — weather");
  });
  it("TRIP_START -> Start trip", () => {
    expect(eventLabel("TRIP_START")).toBe("Start trip");
  });
  it("TRIP_COMPLETE -> Trip complete", () => {
    expect(eventLabel("TRIP_COMPLETE")).toBe("Trip complete");
  });
  it("unknown event falls back to the raw key", () => {
    expect(eventLabel("SOMETHING_ELSE")).toBe("SOMETHING_ELSE");
  });
});

describe("STATE_LABELS (mirrors packages/ui/src/components.tsx exactly)", () => {
  it("ESCROW_FUNDED -> Funds held (never the word 'escrow')", () => {
    expect(STATE_LABELS.ESCROW_FUNDED).toBe("Funds held");
  });
  it("IN_PROGRESS -> Underway", () => {
    expect(STATE_LABELS.IN_PROGRESS).toBe("Underway");
  });
  it("REQUESTED -> Requested", () => {
    expect(STATE_LABELS.REQUESTED).toBe("Requested");
  });
  it("no label anywhere contains the banned word 'escrow'", () => {
    for (const v of Object.values(STATE_LABELS)) {
      expect(v.toLowerCase()).not.toContain("escrow");
    }
  });
});

describe("holdFundsLabel (uses canonical fmtUsd from @crewmarket/types)", () => {
  it("whole-dollar total renders as fmtUsd does", () => {
    expect(holdFundsLabel(11200)).toBe("Hold funds — $112");
  });
  it("fractional total keeps cents", () => {
    expect(holdFundsLabel(11250)).toBe("Hold funds — $112.50");
  });
});
