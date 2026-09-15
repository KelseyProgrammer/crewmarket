"use server";

import { redirect } from "next/navigation";
import { prisma } from "@crewmarket/db";
import { createExpressAccount, createOnboardingLink } from "@crewmarket/payments";
import { claimedProfileId, sessionUser } from "../../lib/bookings";

/* Payout setup is opt-in from /account only — accepting work is never gated on
   it (M-2). Failure convention matches credential-actions: silent no-op returns
   for wrong-role, redirect for signed-out. */

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
    await prisma.crewProfileClaim.update({
      where: { profileId },
      data: { stripeAccountId: accountId },
    });
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const url = await createOnboardingLink(accountId, `${base}/account`, `${base}/account`);
  redirect(url);
}
