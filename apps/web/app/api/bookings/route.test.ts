import { beforeEach, describe, expect, it, vi } from "vitest";

/* GET /api/bookings — party-safe list projection (P-4). BOAT callers see the crew
   profile's displayName as counterparty; CREW callers see the boat account's name,
   batch-resolved from prisma.user. Auth-gated (401 signed out). withElapsedWindow is
   already applied inside bookingsForUser (P-2). */

const seams = vi.hoisted(() => ({
  getSession: vi.fn(),
  bookingsForUser: vi.fn(),
  crewProfileById: vi.fn(),
  prisma: { user: { findMany: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../lib/auth", () => ({ auth: { api: { getSession: seams.getSession } } }));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../lib/bookings", () => ({
  bookingsForUser: seams.bookingsForUser,
  crewProfileById: seams.crewProfileById,
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { GET } from "./route";

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    state: "REQUESTED",
    boatUserId: "boat1",
    crewProfileId: "p1",
    dates: ["2026-09-20"],
    rateCents: 10000,
    feeCents: 1200,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.getSession.mockResolvedValue({ user: { id: "boat1", accountType: "BOAT" } });
  seams.bookingsForUser.mockResolvedValue([booking()]);
  seams.crewProfileById.mockReturnValue({ id: "p1", displayName: "Deckhand Dana" });
  seams.prisma.user.findMany.mockResolvedValue([{ id: "boat1", name: "Reel Deal Charters" }]);
});

describe("GET /api/bookings", () => {
  it("401 when signed out", async () => {
    seams.getSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("BOAT list: counterparty is the crew profile displayName; no boat-name lookup", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const { bookings } = await res.json();
    expect(bookings).toEqual([
      {
        id: "b1",
        state: "REQUESTED",
        role: "BOAT",
        counterpartyName: "Deckhand Dana",
        dates: ["2026-09-20"],
        totalCents: 11200,
      },
    ]);
    expect(seams.bookingsForUser).toHaveBeenCalledWith("boat1", "BOAT");
    expect(seams.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("CREW list: counterparty is the boat account name (batch-resolved)", async () => {
    seams.getSession.mockResolvedValue({ user: { id: "crew1", accountType: "CREW" } });
    seams.bookingsForUser.mockResolvedValue([booking({ boatUserId: "boat1" })]);
    const res = await GET();
    expect(res.status).toBe(200);
    const { bookings } = await res.json();
    expect(bookings[0].role).toBe("CREW");
    expect(bookings[0].counterpartyName).toBe("Reel Deal Charters");
    expect(seams.bookingsForUser).toHaveBeenCalledWith("crew1", "CREW");
    expect(seams.prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["boat1"] } },
      select: { id: true, name: true },
    });
  });

  it("empty list returns { bookings: [] } and skips the boat-name lookup", async () => {
    seams.getSession.mockResolvedValue({ user: { id: "crew1", accountType: "CREW" } });
    seams.bookingsForUser.mockResolvedValue([]);
    const res = await GET();
    expect(await res.json()).toEqual({ bookings: [] });
    expect(seams.prisma.user.findMany).not.toHaveBeenCalled();
  });
});
