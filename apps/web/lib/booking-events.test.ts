import { beforeEach, describe, expect, it, vi } from "vitest";

/* Money-critical booking-event core (moved here from app/bookings/actions.test.ts
   when applyBookingEvent was extracted). Spec: from a funded state, compute
   refundCents from REFUND_TIERS, refund FIRST, transition second — a failed refund
   throws and leaves state unchanged (retryable). Also covers the party/EVENT_SIDES
   gate, the CAS race, and availableEventsFor. */

const seams = vi.hoisted(() => ({
  partyRoleFor: vi.fn(),
  prisma: { booking: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() } },
  refundBookingPayment: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("./bookings", () => ({ partyRoleFor: seams.partyRoleFor }));
// Keep isCancelState / refundCentsFor real (importOriginal); only stub the Stripe call.
vi.mock("@crewmarket/payments", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  refundBookingPayment: seams.refundBookingPayment,
}));

import { applyBookingEvent, availableEventsFor } from "./booking-events";

const FUNDED = {
  id: "b1",
  state: "ESCROW_FUNDED",
  boatUserId: "boat1",
  crewProfileId: "p1",
  rateCents: 10000,
  feeCents: 1200,
  stripePaymentIntentId: "pi_1",
  stripeRefundId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  seams.partyRoleFor.mockResolvedValue("BOAT");
  seams.prisma.booking.update.mockResolvedValue({});
  seams.prisma.booking.updateMany.mockResolvedValue({ count: 1 });
  seams.refundBookingPayment.mockResolvedValue("re_1");
});

describe("applyBookingEvent cancellation refunds", () => {
  it("weather cancel from funded: 100% refund first, then transition with refund id stored", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    const r = await applyBookingEvent("boat1", "b1", "CANCEL_WEATHER");
    expect(seams.refundBookingPayment).toHaveBeenCalledWith("pi_1", 11200, "cancel-refund-b1");
    expect(seams.prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", state: "ESCROW_FUNDED" },
      data: expect.objectContaining({ state: "CANCELLED_WEATHER", stripeRefundId: "re_1" }),
    });
    expect(r).toEqual({ ok: true, state: "CANCELLED_WEATHER" });
  });

  it("failed refund: applyBookingEvent rejects and the state never changes", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    seams.refundBookingPayment.mockRejectedValue(new Error("stripe down"));
    await expect(applyBookingEvent("boat1", "b1", "CANCEL_WEATHER")).rejects.toThrow("stripe down");
    expect(seams.prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("cancel from ACCEPTED (nothing captured yet): no refund call", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({
      ...FUNDED,
      state: "ACCEPTED",
      stripePaymentIntentId: null,
    });
    const r = await applyBookingEvent("boat1", "b1", "CANCEL_BOAT");
    expect(seams.refundBookingPayment).not.toHaveBeenCalled();
    expect(seams.prisma.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b1", state: "ACCEPTED" } })
    );
    expect(r).toEqual({ ok: true, state: "CANCELLED_BOAT" });
  });

  it("already-refunded booking never double-refunds", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED, stripeRefundId: "re_0" });
    await applyBookingEvent("boat1", "b1", "CANCEL_WEATHER");
    expect(seams.refundBookingPayment).not.toHaveBeenCalled();
    expect(seams.prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", state: "ESCROW_FUNDED" },
      data: expect.not.objectContaining({ stripeRefundId: expect.anything() }),
    });
  });

  it("refund landed but the transition lost the CAS: salvages the refund id field-only, returns 409", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    seams.prisma.booking.updateMany.mockResolvedValue({ count: 0 });
    const r = await applyBookingEvent("boat1", "b1", "CANCEL_WEATHER");
    expect(seams.refundBookingPayment).toHaveBeenCalledOnce();
    expect(seams.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { stripeRefundId: "re_1" },
    });
    expect(r).toEqual({ ok: false, status: 409, error: expect.any(String) });
  });

  it("non-refund event losing the CAS is a plain stale no-op returning 409", async () => {
    seams.partyRoleFor.mockResolvedValue("CREW");
    seams.prisma.booking.findUnique.mockResolvedValue({
      ...FUNDED,
      state: "REQUESTED",
      stripePaymentIntentId: null,
    });
    seams.prisma.booking.updateMany.mockResolvedValue({ count: 0 });
    const r = await applyBookingEvent("crew1", "b1", "CREW_ACCEPT");
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, status: 409, error: expect.any(String) });
  });
});

describe("applyBookingEvent gate", () => {
  it("missing booking returns 404", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue(null);
    const r = await applyBookingEvent("boat1", "b1", "CANCEL_WEATHER");
    expect(r).toEqual({ ok: false, status: 404, error: expect.any(String) });
    expect(seams.prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("non-party returns 403", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    seams.partyRoleFor.mockResolvedValue(null);
    const r = await applyBookingEvent("stranger", "b1", "CANCEL_WEATHER");
    expect(r).toEqual({ ok: false, status: 403, error: expect.any(String) });
    expect(seams.prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("event the role may not fire returns 403", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    seams.partyRoleFor.mockResolvedValue("BOAT");
    // CANCEL_CREW is CREW-only.
    const r = await applyBookingEvent("boat1", "b1", "CANCEL_CREW");
    expect(r).toEqual({ ok: false, status: 403, error: expect.any(String) });
    expect(seams.prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("invalid event for the current state returns 409", async () => {
    // TRIP_COMPLETE isn't available from ESCROW_FUNDED.
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    const r = await applyBookingEvent("boat1", "b1", "TRIP_COMPLETE");
    expect(r).toEqual({ ok: false, status: 409, error: expect.any(String) });
    expect(seams.prisma.booking.updateMany).not.toHaveBeenCalled();
  });
});

describe("availableEventsFor", () => {
  it("REQUESTED + CREW → accept/decline", () => {
    expect(availableEventsFor("REQUESTED", "CREW")).toEqual(["CREW_ACCEPT", "CREW_DECLINE"]);
  });

  it("REQUESTED + BOAT → withdraw only", () => {
    expect(availableEventsFor("REQUESTED", "BOAT")).toEqual(["CANCEL_BOAT"]);
  });

  it("ESCROW_FUNDED + BOAT → cancel/weather/start (EVENT_SIDES ∩ canTransition, in order)", () => {
    expect(availableEventsFor("ESCROW_FUNDED", "BOAT")).toEqual([
      "CANCEL_BOAT",
      "CANCEL_WEATHER",
      "TRIP_START",
    ]);
  });

  it("terminal state → nothing", () => {
    expect(availableEventsFor("PAID_OUT", "BOAT")).toEqual([]);
    expect(availableEventsFor("CANCELLED_WEATHER", "CREW")).toEqual([]);
  });
});
