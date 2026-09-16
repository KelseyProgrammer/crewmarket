import { beforeEach, describe, expect, it, vi } from "vitest";

/* POST /api/bookings/[id]/event — auth-gated JSON wrapper over applyBookingEvent
   (the money-critical core). The route only validates the event name against
   EVENT_SIDES keys (400 for unknown) and maps the ApplyResult through: ok →
   { ok, state }, else { error } at r.status. The party/EVENT_SIDES gate itself
   (M-2/M-3) lives in applyBookingEvent, exercised in lib/booking-events.test.ts. */

const seams = vi.hoisted(() => ({
  getSession: vi.fn(),
  applyBookingEvent: vi.fn(),
}));

vi.mock("../../../../../lib/auth", () => ({ auth: { api: { getSession: seams.getSession } } }));
vi.mock("../../../../../lib/booking-events", () => ({
  applyBookingEvent: seams.applyBookingEvent,
  EVENT_SIDES: {
    CREW_ACCEPT: ["CREW"],
    CREW_DECLINE: ["CREW"],
    CANCEL_BOAT: ["BOAT"],
    CANCEL_CREW: ["CREW"],
    CANCEL_WEATHER: ["BOAT", "CREW"],
    TRIP_START: ["BOAT", "CREW"],
    TRIP_COMPLETE: ["BOAT", "CREW"],
  },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { POST } from "./route";

function call(body: unknown, id = "b1") {
  return POST(
    new Request(`http://localhost/api/bookings/${id}/event`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  seams.getSession.mockResolvedValue({ user: { id: "u1", accountType: "CREW" } });
  seams.applyBookingEvent.mockResolvedValue({ ok: true, state: "ACCEPTED" });
});

describe("POST /api/bookings/[id]/event", () => {
  it("401 when signed out", async () => {
    seams.getSession.mockResolvedValue(null);
    expect((await call({ event: "CREW_ACCEPT" })).status).toBe(401);
    expect(seams.applyBookingEvent).not.toHaveBeenCalled();
  });

  it("400 for an unknown event — applyBookingEvent is never called", async () => {
    const res = await call({ event: "FIRE_EVERYONE" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown action." });
    expect(seams.applyBookingEvent).not.toHaveBeenCalled();
  });

  it("400 when the body is not valid JSON", async () => {
    const res = await call("{not json");
    expect(res.status).toBe(400);
    expect(seams.applyBookingEvent).not.toHaveBeenCalled();
  });

  it("success → { ok, state } and passes (userId, id, event) through", async () => {
    seams.applyBookingEvent.mockResolvedValue({ ok: true, state: "ACCEPTED" });
    const res = await call({ event: "CREW_ACCEPT" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, state: "ACCEPTED" });
    expect(seams.applyBookingEvent).toHaveBeenCalledWith("u1", "b1", "CREW_ACCEPT");
  });

  it("maps applyBookingEvent 403 through with its error body", async () => {
    seams.applyBookingEvent.mockResolvedValue({
      ok: false,
      status: 403,
      error: "You can't take that action on this booking.",
    });
    const res = await call({ event: "CANCEL_BOAT" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You can't take that action on this booking." });
  });

  it("maps applyBookingEvent 409 through", async () => {
    seams.applyBookingEvent.mockResolvedValue({
      ok: false,
      status: 409,
      error: "That action isn't available right now.",
    });
    const res = await call({ event: "TRIP_START" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "That action isn't available right now." });
  });
});
