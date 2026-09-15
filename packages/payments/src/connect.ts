import { stripeClient } from "./stripe";

/** Crew payout account: Accounts v2 recipient configuration with an Express
    dashboard — Stripe owns KYC/bank/tax (P-1); we store the account id only.
    Crew are individual contractors, hence entity_type "individual". */
export async function createExpressAccount(contactEmail: string): Promise<string> {
  const account = await stripeClient().v2.core.accounts.create({
    display_name: contactEmail,
    contact_email: contactEmail,
    identity: { country: "us", entity_type: "individual" },
    dashboard: "express",
    defaults: {
      currency: "usd",
      // Recipient-only accounts require the platform as collector (verified live).
      responsibilities: { fees_collector: "application", losses_collector: "application" },
    },
    configuration: {
      recipient: {
        capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
      },
    },
  });
  return account.id;
}

export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const link = await stripeClient().v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        return_url: returnUrl,
        refresh_url: refreshUrl,
      },
    },
  });
  return link.url;
}

export type PayoutReadiness = { payoutsEnabled: boolean; transfersEnabled: boolean };

/** Fetched live on every read — no mirrored onboarding state (P-1). */
export async function payoutReadiness(accountId: string): Promise<PayoutReadiness> {
  const account = await stripeClient().v2.core.accounts.retrieve(accountId, {
    include: ["configuration.recipient"],
  });
  const caps = account.configuration?.recipient?.capabilities?.stripe_balance;
  return {
    payoutsEnabled: caps?.payouts?.status === "active",
    transfersEnabled: caps?.stripe_transfers?.status === "active",
  };
}
