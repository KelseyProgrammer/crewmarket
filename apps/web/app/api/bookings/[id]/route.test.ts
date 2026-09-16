import { beforeEach, describe, expect, it, vi } from "vitest";

/* GET /api/bookings/[id] — party-safe detail projection (P-4). Non-parties get 404,
   never 403: the ledger simply does not exist for them (don't reveal existence).
   withElapsedWindow runs on read (P-2); availableEvents is the real state-machine ∩
   EVENT_SIDES result so the client renders only server-legal actions (M-2/M-3). */

const seams = vi.hoisted(() => ({
  getSession: vi.fn(),
  partyRoleFor: vi.fn(),
  withElapsedWindow: vi.fn(),
  crewProfileById: vi.fn(),
  prisma: { booking: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/auth", () => ({ auth: { api: { getSession: seams.getSession } } }));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../../lib/bookings", () => ({
  partyRoleFor: seams.partyRoleFor,
  withElapsedWindow: seams.withElapsedWindow,
  crewProfileById: seams.crewProfileById,
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { GET } from "./route";

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    state: "ESCROW_FUNDED",
    boatUserId: "boat1",
    crewProfileId: "p1",
    dates: ["2026-09-20"],
    rateCents: 10000,
    feeCents: 1200,
    tripType: "HALF_DAY",
    requestedAt: new Date("2026-09-14T12:00:00.000Z"),
    completedAt: null,
    stripeRefundId: null,
    stripeTransferId: null,
    ...over,
  };
}

function call(id = "b1") {
  return GET(new Request(`http://localhost/api/bookings/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.getSession.mockResolvedValue({ user: { id: "boat1", accountType: "BOAT" } });
  seams.prisma.booking.findUnique.mockResolvedValue(booking());
  seams.partyRoleFor.mockResolvedValue("BOAT");
  seams.withElapsedWindow.mockImplementation(async (b: unknown) => b);
  seams.crewProfileById.mockReturnValue({ id: "p1", displayName: "Deckhand Dana" });
  seams.prisma.user.findUnique.mockResolvedValue({ name: "Reel Deal Charters" });
});

describe("GET /api/bookings/[id]", () => {
  it("401 when signed out", async () => {
    seams.getSession.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("404 when the booking is missing", async () => {
    seams.prisma.booking.findUnique.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(seams.partyRoleFor).not.toHaveBeenCalled();
  });

  it("404 (not 403) when the caller is not a party — existence stays hidden", async () => {
    seams.partyRoleFor.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("BOAT detail: crew displayName counterparty + real availableEvents", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const { booking: b } = await res.json();
    expect(b).toMatchObject({
      id: "b1",
      state: "ESCROW_FUNDED",
      role: "BOAT",
      counterpartyName: "Deckhand Dana",
      totalCents: 11200,
      rateCents: 10000,
      feeCents: 1200,
      tripType: "HALF_DAY",
      requestedAt: "2026-09-14T12:00:00.000Z",
      completedAt: null,
      hasRefund: false,
      hasPayout: false,
    });
    // ESCROW_FUNDED + BOAT → CANCEL_BOAT, CANCEL_WEATHER, TRIP_START (EVENT_SIDES ∩ canTransition)
    expect(b.availableEvents).toEqual(["CANCEL_BOAT", "CANCEL_WEATHER", "TRIP_START"]);
    expect(seams.withElapsedWindow).toHaveBeenCalledOnce();
    expect(seams.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("CREW detail: boat account name counterparty (resolved via prisma.user)", async () => {
    seams.getSession.mockResolvedValue({ user: { id: "crew1", accountType: "CREW" } });
    seams.partyRoleFor.mockResolvedValue("CREW");
    const res = await call();
    expect(res.status).toBe(200);
    const { booking: b } = await res.json();
    expect(b.role).toBe("CREW");
    expect(b.counterpartyName).toBe("Reel Deal Charters");
    expect(seams.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "boat1" },
      select: { name: true },
    });
  });
});
