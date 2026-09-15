import { beforeEach, describe, expect, it, vi } from "vitest";

/* Spec: from a funded state, compute refundCents from REFUND_TIERS, refund FIRST,
   transition second — a failed refund throws and leaves state unchanged (retryable). */

const seams = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  partyRoleFor: vi.fn(),
  claimedProfileId: vi.fn(),
  crewProfileById: vi.fn(),
  prisma: { booking: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() } },
  refundBookingPayment: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
}));

vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../lib/bookings", () => ({
  sessionUser: seams.sessionUser,
  partyRoleFor: seams.partyRoleFor,
  claimedProfileId: seams.claimedProfileId,
  crewProfileById: seams.crewProfileById,
}));
vi.mock("@crewmarket/payments", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createBookingCheckout: vi.fn(),
  refundBookingPayment: seams.refundBookingPayment,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: seams.redirect }));

import { bookingEventAction } from "./actions";

const BOAT = { id: "boat1", email: "boat@example.test", accountType: "BOAT" };
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
  seams.sessionUser.mockResolvedValue(BOAT);
  seams.partyRoleFor.mockResolvedValue("BOAT");
  seams.prisma.booking.update.mockResolvedValue({});
  seams.prisma.booking.updateMany.mockResolvedValue({ count: 1 });
  seams.refundBookingPayment.mockResolvedValue("re_1");
});

describe("bookingEventAction cancellation refunds", () => {
  it("weather cancel from funded: 100% refund first, then transition with refund id stored", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    await bookingEventAction("b1", "CANCEL_WEATHER");
    expect(seams.refundBookingPayment).toHaveBeenCalledWith("pi_1", 11200, "cancel-refund-b1");
    expect(seams.prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", state: "ESCROW_FUNDED" },
      data: expect.objectContaining({ state: "CANCELLED_WEATHER", stripeRefundId: "re_1" }),
    });
  });

  it("failed refund: action rejects and the state never changes", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    seams.refundBookingPayment.mockRejectedValue(new Error("stripe down"));
    await expect(bookingEventAction("b1", "CANCEL_WEATHER")).rejects.toThrow("stripe down");
    expect(seams.prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("cancel from ACCEPTED (nothing captured yet): no refund call", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({
      ...FUNDED,
      state: "ACCEPTED",
      stripePaymentIntentId: null,
    });
    await bookingEventAction("b1", "CANCEL_BOAT");
    expect(seams.refundBookingPayment).not.toHaveBeenCalled();
    expect(seams.prisma.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b1", state: "ACCEPTED" } })
    );
  });

  it("already-refunded booking never double-refunds", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED, stripeRefundId: "re_0" });
    await bookingEventAction("b1", "CANCEL_WEATHER");
    expect(seams.refundBookingPayment).not.toHaveBeenCalled();
    expect(seams.prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", state: "ESCROW_FUNDED" },
      data: expect.not.objectContaining({ stripeRefundId: expect.anything() }),
    });
  });

  it("refund landed but the transition lost the CAS: salvages the refund id field-only", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED });
    seams.prisma.booking.updateMany.mockResolvedValue({ count: 0 });
    await bookingEventAction("b1", "CANCEL_WEATHER");
    expect(seams.refundBookingPayment).toHaveBeenCalledOnce();
    expect(seams.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { stripeRefundId: "re_1" },
    });
  });

  it("non-refund event losing the CAS is a plain stale no-op", async () => {
    seams.partyRoleFor.mockResolvedValue("CREW");
    seams.prisma.booking.findUnique.mockResolvedValue({ ...FUNDED, state: "REQUESTED", stripePaymentIntentId: null });
    seams.prisma.booking.updateMany.mockResolvedValue({ count: 0 });
    await bookingEventAction("b1", "CREW_ACCEPT");
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
  });
});
