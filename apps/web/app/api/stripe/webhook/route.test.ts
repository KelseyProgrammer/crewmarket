import { beforeEach, describe, expect, it, vi } from "vitest";

/* Spec: webhook is the source of truth for ACCEPTED -> ESCROW_FUNDED. Guards:
   bad signature -> 400; amount mismatch -> 200 + no transition; replay -> no-op.
   canTransition/transition run for real (pure @crewmarket/types). */

const seams = vi.hoisted(() => ({
  verifyStripeEvent: vi.fn(),
  prisma: { booking: { findUnique: vi.fn(), updateMany: vi.fn() } },
}));

vi.mock("@crewmarket/payments", () => ({ verifyStripeEvent: seams.verifyStripeEvent }));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));

import { POST } from "./route";

const BOOKING = { id: "b1", state: "ACCEPTED", rateCents: 10000, feeCents: 1200 };

function session(over: Record<string, unknown> = {}) {
  return {
    id: "cs_1",
    amount_total: 11200,
    payment_status: "paid",
    payment_intent: "pi_1",
    metadata: { bookingId: "b1" },
    ...over,
  };
}

function completedEvent(over: Record<string, unknown> = {}) {
  return { type: "checkout.session.completed", data: { object: session(over) } };
}

function post(body = "{}", sig = "t=1,v1=sig") {
  return POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body,
      headers: { "stripe-signature": sig },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.prisma.booking.findUnique.mockResolvedValue({ ...BOOKING });
  seams.prisma.booking.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/stripe/webhook", () => {
  it("returns 400 on bad signature and never touches the db", async () => {
    seams.verifyStripeEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await post();
    expect(res.status).toBe(400);
    expect(seams.prisma.booking.findUnique).not.toHaveBeenCalled();
  });

  it("returns 200 for unhandled event types without db access", async () => {
    seams.verifyStripeEvent.mockReturnValue({ type: "payment_intent.created", data: { object: {} } });
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.findUnique).not.toHaveBeenCalled();
  });

  it("drives ACCEPTED -> ESCROW_FUNDED, stores the PaymentIntent id, stamps fundsHeldAt", async () => {
    seams.verifyStripeEvent.mockReturnValue(completedEvent());
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", state: "ACCEPTED" },
      data: expect.objectContaining({
        state: "ESCROW_FUNDED",
        stripePaymentIntentId: "pi_1",
        fundsHeldAt: expect.any(Date),
      }),
    });
  });

  it("replay is a no-op: already ESCROW_FUNDED means no update, still 200", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue({ ...BOOKING, state: "ESCROW_FUNDED" });
    seams.verifyStripeEvent.mockReturnValue(completedEvent());
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("amount mismatch: 200, no transition (operator investigates)", async () => {
    seams.verifyStripeEvent.mockReturnValue(completedEvent({ amount_total: 999 }));
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("unknown booking id: 200, no update", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue(null);
    seams.verifyStripeEvent.mockReturnValue(completedEvent());
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("session without bookingId metadata: 200, no db access", async () => {
    seams.verifyStripeEvent.mockReturnValue(completedEvent({ metadata: {} }));
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.findUnique).not.toHaveBeenCalled();
  });

  it("unpaid session (async payment method): 200, no update", async () => {
    seams.verifyStripeEvent.mockReturnValue(completedEvent({ payment_status: "unpaid" }));
    const res = await post();
    expect(res.status).toBe(200);
    expect(seams.prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it("state moved between read and write (CAS count 0): 200, treated as no-op", async () => {
    seams.prisma.booking.updateMany.mockResolvedValue({ count: 0 });
    seams.verifyStripeEvent.mockReturnValue(completedEvent());
    const res = await post();
    expect(res.status).toBe(200);
  });
});
