import { beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/bookings/[id]/checkout — boat's pay action as JSON (returns the Stripe
   Checkout url, NOT a redirect, so the native in-app browser can open it). Mirrors
   beginBookingCheckout: only the BOAT party (403 otherwise) may pay, only at ACCEPTED
   (409 otherwise), separate charges & transfers via createBookingCheckout. State does
   not change here — the webhook is the source of truth for funds-held. */

const seams = vi.hoisted(() => ({
  getSession: vi.fn(),
  partyRoleFor: vi.fn(),
  createBookingCheckout: vi.fn(),
  prisma: { booking: { findUnique: vi.fn() } },
}));

vi.mock("../../../../../lib/auth", () => ({ auth: { api: { getSession: seams.getSession } } }));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../../../lib/bookings", () => ({ partyRoleFor: seams.partyRoleFor }));
vi.mock("@crewmarket/payments", () => ({ createBookingCheckout: seams.createBookingCheckout }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { POST } from "./route";

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    state: "ACCEPTED",
    boatUserId: "boat1",
    crewProfileId: "p1",
    tripType: "HALF_DAY",
    rateCents: 10000,
    feeCents: 1200,
    ...over,
  };
}

function call(id = "b1") {
  return POST(new Request(`http://localhost/api/bookings/${id}/checkout`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BETTER_AUTH_URL;
  seams.getSession.mockResolvedValue({ user: { id: "boat1", accountType: "BOAT" } });
  seams.prisma.booking.findUnique.mockResolvedValue(booking());
  seams.partyRoleFor.mockResolvedValue("BOAT");
  seams.createBookingCheckout.mockResolvedValue("https://checkout.stripe.com/c/pay/cs_test_123");
});

describe("POST /api/bookings/[id]/checkout", () => {
  it("401 when signed out", async () => {
    seams.getSession.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(seams.createBookingCheckout).not.toHaveBeenCalled();
  });

  it("404 when the booking is missing", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(seams.createBookingCheckout).not.toHaveBeenCalled();
  });

  it("403 when the caller is not the boat — createBookingCheckout is never called", async () => {
    seams.partyRoleFor.mockResolvedValue("CREW");
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only the boat can pay for this booking." });
    expect(seams.createBookingCheckout).not.toHaveBeenCalled();
  });

  it("409 when the booking isn't ACCEPTED", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue(booking({ state: "REQUESTED" }));
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This booking isn't ready for payment." });
    expect(seams.createBookingCheckout).not.toHaveBeenCalled();
  });

  it("success → { url } and calls createBookingCheckout with the mirrored args", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_123" });
    expect(seams.createBookingCheckout).toHaveBeenCalledWith(
      {
        bookingId: "b1",
        tripLabel: "Half day — crew booking",
        rateCents: 10000,
        feeCents: 1200,
      },
      {
        successUrl: "http://localhost:3000/bookings/b1?paid=pending",
        cancelUrl: "http://localhost:3000/bookings/b1",
      }
    );
  });

  it("uses BETTER_AUTH_URL as the return base when set", async () => {
    process.env.BETTER_AUTH_URL = "https://crewmarket-web.vercel.app";
    await call();
    expect(seams.createBookingCheckout).toHaveBeenCalledWith(
      expect.anything(),
      {
        successUrl: "https://crewmarket-web.vercel.app/bookings/b1?paid=pending",
        cancelUrl: "https://crewmarket-web.vercel.app/bookings/b1",
      }
    );
  });
});
