import { describe, expect, it } from "vitest";
import { availabilityWindow } from "./availability";

const av = [
  { date: "2026-08-29", status: "OPEN" },
  { date: "2026-08-30", status: "BOOKED" },
  { date: "2026-09-02", status: "OPEN" },
];

describe("availabilityWindow", () => {
  it("maps a 14-day window with OPEN days marked", () => {
    const w = availabilityWindow(av, "2026-08-29");
    expect(w).toHaveLength(14);
    expect(w[0]).toEqual({ date: "2026-08-29", open: true });
    expect(w[1]).toEqual({ date: "2026-08-30", open: false }); // BOOKED ≠ open
    expect(w[4]).toEqual({ date: "2026-09-02", open: true });
  });

  it("treats absent dates as closed, never open (M-2: absence is not availability)", () => {
    const w = availabilityWindow([], "2026-08-29");
    expect(w.every((c) => !c.open)).toBe(true);
  });

  it("crosses month boundaries without drift", () => {
    const w = availabilityWindow(av, "2026-08-29");
    expect(w[3].date).toBe("2026-09-01");
    expect(w[13].date).toBe("2026-09-11");
  });

  it("supports a custom window length", () => {
    expect(availabilityWindow(av, "2026-08-29", 7)).toHaveLength(7);
  });
});
