import { prisma } from "@crewmarket/db";
import { payoutReadiness } from "@crewmarket/payments";
import { claimedProfileId } from "../../lib/bookings";
import { beginPayoutOnboarding } from "./payout-actions";

/* Readiness is fetched live from Stripe on every load — no mirrored state (P-1).
   Copy: "funds held"/"payouts", never "escrow" (G-1); setup is optional (M-2). */

export async function PayoutsSection({ userId }: { userId: string }) {
  const profileId = await claimedProfileId(userId);
  if (!profileId) return null;

  const claim = await prisma.crewProfileClaim.findUnique({ where: { profileId } });
  const accountId = claim?.stripeAccountId ?? null;
  // Stripe being unreachable (or a stale sandbox account id) must never take
  // down /account — degrade to the not-finished branch, which offers a retry.
  const readiness = accountId ? await payoutReadiness(accountId).catch(() => null) : null;

  return (
    <div className="account__panel">
      <span className="eyebrow">PAYOUTS</span>
      {readiness?.payoutsEnabled && readiness.transfersEnabled ? (
        <p className="account__lede">
          Payouts are active. Stripe handles your identity, bank, and tax details — we never
          see them.
        </p>
      ) : (
        <>
          <p className="account__lede">
            {accountId
              ? "Payout setup is started but not finished. Stripe needs a few more details before payouts can go out."
              : "Set up payouts through Stripe to receive your rate after each trip's 48-hour review window. Stripe handles your identity, bank, and tax details — we never see them."}
          </p>
          <p className="account__lede mono">Optional — you can accept bookings either way.</p>
          <form action={beginPayoutOnboarding}>
            <button className="btn btn--brass" type="submit">
              {accountId ? "Finish payout setup" : "Set up payouts"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
