import { headers } from "next/headers";
import { auth } from "../../../../../lib/auth";
import { applyBookingEvent, EVENT_SIDES, type UserEvent } from "../../../../../lib/booking-events";

/* POST /api/bookings/[id]/event — native-callable counterpart to bookingEventAction.
   Auth-gate, validate the event name against EVENT_SIDES keys (unknown → 400), then
   defer entirely to applyBookingEvent: the party/EVENT_SIDES gate, the state machine,
   and refund-first-on-cancel all live there (M-2/M-3, G-1). The ApplyResult maps
   straight through — ok → { ok, state }, else { error } at the core's status. */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return new Response("sign in required", { status: 401 });
  const user = session.user as { id: string };

  const { event } = (await req.json().catch(() => ({}))) as { event?: string };
  if (!event || !(event in EVENT_SIDES)) {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  const { id } = await params;
  const r = await applyBookingEvent(user.id, id, event as UserEvent);
  // `in`-narrowing (not `!r.ok`) because this project's tsconfig has strict:false —
  // TS won't narrow a boolean-discriminated union without strictNullChecks, but the
  // presence check on the error-only field narrows in both directions.
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status });
  return Response.json({ ok: true, state: r.state });
}
