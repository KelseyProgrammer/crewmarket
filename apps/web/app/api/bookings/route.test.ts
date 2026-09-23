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
  createBookingRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../lib/auth", () => ({ auth: { api: { getSession: seams.getSession } } }));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("../../../lib/bookings", () => ({
  bookingsForUser: seams.bookingsForUser,
  crewProfileById: seams.crewProfileById,
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("../../../lib/booking-create", () => ({ createBookingRequest: seams.createBookingRequest }));

import { GET, POST } from "./route";

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

function postReq(body: unknown) {
  return new Request("http://test/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bookings", () => {
  it("401 when signed out", async () => {
    seams.getSession.mockResolvedValue(null);
    expect((await POST(postReq({}))).status).toBe(401);
    expect(seams.createBookingRequest).not.toHaveBeenCalled();
  });

  it("400 on a malformed JSON body without touching the core", async () => {
    const res = await POST(
      new Request("http://test/api/bookings", { method: "POST", body: "not json" })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Malformed request." });
    expect(seams.createBookingRequest).not.toHaveBeenCalled();
  });

  it("maps a core error to its status with { error } JSON", async () => {
    seams.createBookingRequest.mockResolvedValue({
      error: "Only boat accounts send booking requests.",
      status: 403,
    });
    const res = await POST(postReq({ crewProfileId: "p1" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only boat accounts send booking requests." });
  });

  it("201 + { id } on success; input is shape-coerced (smuggled money fields dropped)", async () => {
    seams.createBookingRequest.mockResolvedValue({ booking: { id: "b9" } });
    const res = await POST(
      postReq({
        crewProfileId: "p1",
        tripType: "FULL_DAY",
        startDate: "2026-10-01",
        days: 1,
        piAttested: true,
        rateCents: 1, // must never reach the core (R4/P-4)
      })
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "b9" });
    expect(seams.createBookingRequest).toHaveBeenCalledWith(
      { id: "boat1", accountType: "BOAT" },
      { crewProfileId: "p1", tripType: "FULL_DAY", startDate: "2026-10-01", days: 1, piAttested: true }
    );
  });

  it("numeric-string days coerces like the web action; garbage days becomes NaN for the core to reject; piAttested only on literal true", async () => {
    seams.createBookingRequest.mockResolvedValue({ error: "x", status: 400 });
    await POST(postReq({ crewProfileId: "p1", tripType: "FULL_DAY", startDate: "2026-10-01", days: "3", piAttested: "yes" }));
    expect(seams.createBookingRequest).toHaveBeenCalledWith(expect.anything(), {
      crewProfileId: "p1",
      tripType: "FULL_DAY",
      startDate: "2026-10-01",
      days: 3,
      piAttested: false,
    });

    seams.createBookingRequest.mockClear();
    await POST(postReq({ crewProfileId: "p1", tripType: "MULTI_DAY", startDate: "2026-10-01", days: "abc", piAttested: true }));
    expect(seams.createBookingRequest).toHaveBeenCalledWith(expect.anything(), {
      crewProfileId: "p1",
      tripType: "MULTI_DAY",
      startDate: "2026-10-01",
      days: NaN,
      piAttested: true,
    });

    seams.createBookingRequest.mockClear();
    await POST(postReq({ crewProfileId: "p1", tripType: "FULL_DAY", startDate: "2026-10-01", piAttested: true }));
    expect(seams.createBookingRequest).toHaveBeenCalledWith(expect.anything(), {
      crewProfileId: "p1",
      tripType: "FULL_DAY",
      startDate: "2026-10-01",
      days: 1,
      piAttested: true,
    });
  });

  it("non-object JSON body (null) coerces to empty defaults, reaches the core, core decides", async () => {
    seams.createBookingRequest.mockResolvedValue({ error: "x", status: 400 });
    const res = await POST(postReq(null));
    expect(res.status).toBe(400);
    expect(seams.createBookingRequest).toHaveBeenCalledWith(expect.anything(), {
      crewProfileId: "",
      tripType: "",
      startDate: "",
      days: 1,
      piAttested: false,
    });
  });
});
