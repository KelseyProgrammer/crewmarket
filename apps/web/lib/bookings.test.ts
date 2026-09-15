import { beforeEach, describe, expect, it, vi } from "vitest";

/* Spec: at release time, transfer exactly rateCents; PAID_OUT only on transfer
   success; missing onboarding or Stripe failure leaves DISPUTE_WINDOW and retries
   on next read; a refunded booking NEVER pays out. Exactly-once = idempotency key
   + null-check on stripeTransferId. */

const seams = vi.hoisted(() => ({
  prisma: {
    booking: { update: vi.fn(), updateMany: vi.fn() },
    crewProfileClaim: { findUnique: vi.fn() },
  },
  releaseCrewPayout: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("@crewmarket/payments", () => ({ releaseCrewPayout: seams.releaseCrewPayout }));
vi.mock("./auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { withElapsedWindow } from "./bookings";

const HOURS = 3600_000;
const base = {
  id: "b1",
  state: "DISPUTE_WINDOW",
  crewProfileId: "p1",
  rateCents: 10000,
  feeCents: 1200,
  completedAt: new Date(Date.now() - 49 * HOURS),
  stripePaymentIntentId: "pi_1",
  stripeRefundId: null,
  stripeTransferId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  seams.prisma.booking.update.mockImplementation(async ({ data }) => ({ ...base, ...data }));
  seams.prisma.crewProfileClaim.findUnique.mockResolvedValue({
    profileId: "p1",
    userId: "u1",
    stripeAccountId: "acct_1",
  });
  seams.releaseCrewPayout.mockResolvedValue("tr_1");
});

describe("withElapsedWindow payout release", () => {
  it("window not elapsed: untouched, no transfer", async () => {
    const b = { ...base, completedAt: new Date(Date.now() - 1 * HOURS) };
    expect(await withElapsedWindow(b as never)).toBe(b);
    expect(seams.releaseCrewPayout).not.toHaveBeenCalled();
  });

  it("elapsed + onboarded: transfers exactly rateCents, stores id, goes PAID_OUT", async () => {
    await withElapsedWindow({ ...base } as never);
    expect(seams.releaseCrewPayout).toHaveBeenCalledWith("b1", "acct_1", 10000);
    expect(seams.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({ state: "PAID_OUT", stripeTransferId: "tr_1" }),
    });
  });

  it("crew not onboarded: stays DISPUTE_WINDOW, no transfer, no update", async () => {
    seams.prisma.crewProfileClaim.findUnique.mockResolvedValue({ stripeAccountId: null });
    const b = { ...base };
    expect(await withElapsedWindow(b as never)).toBe(b);
    expect(seams.releaseCrewPayout).not.toHaveBeenCalled();
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
  });

  it("transfer failure: stays DISPUTE_WINDOW, retried on next read", async () => {
    seams.releaseCrewPayout.mockRejectedValue(new Error("stripe down"));
    const b = { ...base };
    expect(await withElapsedWindow(b as never)).toBe(b);
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
  });

  it("refunded booking never pays out: no transfer, stays put for the operator", async () => {
    const b = { ...base, stripeRefundId: "re_1" };
    expect(await withElapsedWindow(b as never)).toBe(b);
    expect(seams.releaseCrewPayout).not.toHaveBeenCalled();
    expect(seams.prisma.booking.update).not.toHaveBeenCalled();
  });

  it("transfer id already set: no second transfer call, closes normally", async () => {
    await withElapsedWindow({ ...base, stripeTransferId: "tr_0" } as never);
    expect(seams.releaseCrewPayout).not.toHaveBeenCalled();
    expect(seams.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({ state: "PAID_OUT" }),
    });
  });

  it("pre-Stripe booking (no PaymentIntent): legacy close without transfer", async () => {
    await withElapsedWindow({ ...base, stripePaymentIntentId: null } as never);
    expect(seams.releaseCrewPayout).not.toHaveBeenCalled();
    expect(seams.prisma.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({ state: "PAID_OUT" }),
    });
  });
});
