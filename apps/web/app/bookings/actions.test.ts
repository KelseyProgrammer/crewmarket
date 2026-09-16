import { beforeEach, describe, expect, it, vi } from "vitest";

/* bookingEventAction is now a thin web wrapper over applyBookingEvent (the
   money-critical core lives in lib/booking-events.ts, tested directly in
   lib/booking-events.test.ts). These cases cover only the wrapper's job:
   re-check the session, delegate, then revalidate. Core refund/CAS/gate
   assertions were relocated to lib/booking-events.test.ts. */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  applyBookingEvent: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("../../lib/bookings", () => ({ sessionUser: seams.sessionUser }));
vi.mock("../../lib/booking-events", () => ({ applyBookingEvent: seams.applyBookingEvent }));
vi.mock("next/cache", () => ({ revalidatePath: seams.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: seams.redirect }));

import { bookingEventAction } from "./actions";

const BOAT = { id: "boat1", email: "boat@example.test", accountType: "BOAT" };

beforeEach(() => {
  vi.clearAllMocks();
  seams.sessionUser.mockResolvedValue(BOAT);
  seams.applyBookingEvent.mockResolvedValue({ ok: true, state: "CANCELLED_WEATHER" });
});

describe("bookingEventAction (web wrapper)", () => {
  it("delegates to applyBookingEvent with the session user id and revalidates both paths", async () => {
    await bookingEventAction("b1", "CANCEL_WEATHER");
    expect(seams.applyBookingEvent).toHaveBeenCalledWith("boat1", "b1", "CANCEL_WEATHER");
    expect(seams.revalidatePath).toHaveBeenCalledWith("/bookings/b1");
    expect(seams.revalidatePath).toHaveBeenCalledWith("/bookings");
  });

  it("signed out: redirects to sign-in and never touches the core", async () => {
    seams.sessionUser.mockResolvedValue(null);
    await expect(bookingEventAction("b1", "CANCEL_WEATHER")).rejects.toThrow(
      "REDIRECT:/sign-in?from=/bookings/b1"
    );
    expect(seams.applyBookingEvent).not.toHaveBeenCalled();
  });

  it("a core error is a stale-tab no-op on web: still revalidates, never throws", async () => {
    seams.applyBookingEvent.mockResolvedValue({ ok: false, status: 409, error: "changed" });
    await expect(bookingEventAction("b1", "CANCEL_WEATHER")).resolves.toBeUndefined();
    expect(seams.revalidatePath).toHaveBeenCalledWith("/bookings/b1");
    expect(seams.revalidatePath).toHaveBeenCalledWith("/bookings");
  });
});
