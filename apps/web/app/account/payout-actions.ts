"use server";

import { redirect } from "next/navigation";
import { prisma } from "@crewmarket/db";
import { createExpressAccount, createOnboardingLink } from "@crewmarket/payments";
import { claimedProfileId, sessionUser } from "../../lib/bookings";

/* Payout setup is opt-in from /account only — accepting work is never gated on
   it (M-2). Void form action whose form renders only for claimed CREW accounts,
   so the wrong-role paths are unreachable in the UI and return silently. */

export async function beginPayoutOnboarding() {
  const user = await sessionUser();
  if (!user) redirect("/sign-in?from=/account");
  if (user.accountType !== "CREW") return;
  const profileId = await claimedProfileId(user.id);
  if (!profileId) return;

  const claim = await prisma.crewProfileClaim.findUnique({ where: { profileId } });
  let accountId = claim?.stripeAccountId ?? null;
  if (!accountId) {
    accountId = await createExpressAccount(user.email);
    const claimed = await prisma.crewProfileClaim.updateMany({
      where: { profileId, stripeAccountId: null }, // CAS: only the first submit persists
      data: { stripeAccountId: accountId },
    });
    if (claimed.count === 0) {
      // Lost the race — use the id the winning submit persisted.
      const winner = await prisma.crewProfileClaim.findUnique({ where: { profileId } });
      accountId = winner?.stripeAccountId ?? accountId;
    }
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const url = await createOnboardingLink(accountId, `${base}/account`, `${base}/account`);
  redirect(url);
}
