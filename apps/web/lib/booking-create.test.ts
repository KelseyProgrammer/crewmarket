import { beforeEach, describe, expect, it, vi } from "vitest";

/* createBookingRequest — the one home for the booking-creation guards (slice-5).
   Guard order and error copy are frozen: the web action and POST /api/bookings
   both surface these strings verbatim. R4: quote recomputed from crew-listed
   rates — client money math never trusted. D-4: no booking without the P&I
   attestation. M-2: only crew-listed trip types are bookable. */

const seams = vi.hoisted(() => ({
  crewProfileById: vi.fn(),
  prisma: { booking: { create: vi.fn() } },
}));

vi.mock("server-only", () => ({}));
vi.mock("@crewmarket/db", () => ({ prisma: seams.prisma }));
vi.mock("./bookings", () => ({ crewProfileById: seams.crewProfileById }));

import { createBookingRequest } from "./booking-create";

const boat = { id: "boat1", accountType: "BOAT" };
// dayRateUsd only: offers FULL_DAY + MULTI_DAY, NOT HALF_DAY / TOURNAMENT (M-2).
const crew = { id: "p1", displayName: "Del Pinder", dayRateUsd: 100 };

function input(over: Record<string, unknown> = {}) {
  return {
    crewProfileId: "p1",
    tripType: "FULL_DAY",
    startDate: "2026-10-01",
    days: 1,
    piAttested: true,
    ...over,
  } as Parameters<typeof createBookingRequest>[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.crewProfileById.mockReturnValue(crew);
  seams.prisma.booking.create.mockImplementation(async ({ data }: { data: object }) => ({
    id: "b1",
    ...data,
  }));
});

describe("createBookingRequest — guards", () => {
  it("403 for a CREW account", async () => {
    const r = await createBookingRequest({ id: "crew1", accountType: "CREW" }, input());
    expect(r).toEqual({ error: "Only boat accounts send booking requests.", status: 403 });
  });

  it("403 when accountType is missing entirely", async () => {
    const r = await createBookingRequest({ id: "u1" }, input());
    expect(r).toEqual({ error: "Only boat accounts send booking requests.", status: 403 });
  });

  it("400 unknown crew profile", async () => {
    seams.crewProfileById.mockReturnValue(null);
    const r = await createBookingRequest(boat, input());
    expect(r).toEqual({ error: "Unknown crew profile.", status: 400 });
  });

  it("400 trip type the crew does not list a rate for (M-2)", async () => {
    const r = await createBookingRequest(boat, input({ tripType: "HALF_DAY" }));
    expect(r).toEqual({
      error: "Choose a trip type this crew member lists a rate for.",
      status: 400,
    });
  });

  it("400 garbage trip type string", async () => {
    const r = await createBookingRequest(boat, input({ tripType: "YACHT_WEEK" }));
    expect(r).toEqual({
      error: "Choose a trip type this crew member lists a rate for.",
      status: 400,
    });
  });

  it("400 malformed start date", async () => {
    const r = await createBookingRequest(boat, input({ startDate: "10/01/2026" }));
    expect(r).toEqual({ error: "Pick a start date.", status: 400 });
  });

  it("400 days out of range for MULTI_DAY (max 10)", async () => {
    const r = await createBookingRequest(boat, input({ tripType: "MULTI_DAY", days: 11 }));
    expect(r).toEqual({ error: "Days must be between 1 and 10.", status: 400 });
  });

  it("400 non-integer days", async () => {
    const r = await createBookingRequest(boat, input({ tripType: "MULTI_DAY", days: 2.5 }));
    expect(r).toEqual({ error: "Days must be between 1 and 10.", status: 400 });
  });

  it("400 without the P&I attestation (D-4)", async () => {
    const r = await createBookingRequest(boat, input({ piAttested: false }));
    expect(r).toEqual({
      error: "Confirm the vessel carries P&I coverage for this trip.",
      status: 400,
    });
    expect(seams.prisma.booking.create).not.toHaveBeenCalled();
  });
});

describe("createBookingRequest — creation (R4: server recompute)", () => {
  it("single-day trip: smuggled days are coerced to 1, money recomputed", async () => {
    const r = await createBookingRequest(boat, input({ days: 5 }));
    expect("error" in r).toBe(false);
    expect(seams.prisma.booking.create).toHaveBeenCalledWith({
      data: {
        crewProfileId: "p1",
        boatUserId: "boat1",
        tripType: "FULL_DAY",
        dates: ["2026-10-01"],
        rateCents: 10000,
        feeCents: 1200,
        piAttestedAt: expect.any(Date),
      },
    });
  });

  it("multi-day happy path: consecutive dates, rate × days, itemized fee (P-3)", async () => {
    const r = await createBookingRequest(boat, input({ tripType: "MULTI_DAY", days: 3 }));
    if ("error" in r) throw new Error(`unexpected error: ${r.error}`);
    expect(r.booking.id).toBe("b1");
    expect(seams.prisma.booking.create).toHaveBeenCalledWith({
      data: {
        crewProfileId: "p1",
        boatUserId: "boat1",
        tripType: "MULTI_DAY",
        dates: ["2026-10-01", "2026-10-02", "2026-10-03"],
        rateCents: 30000,
        feeCents: 3600,
        piAttestedAt: expect.any(Date),
      },
    });
  });
});
