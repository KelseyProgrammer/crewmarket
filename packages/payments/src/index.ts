/**
 * @crewmarket/payments — Stripe Connect Express integration (rules P-1..P-4).
 * Flow: crew onboards -> Express account (Stripe holds KYC/bank/1099 data).
 * Booking: PaymentIntent w/ manual capture or hold -> transfer to crew after
 * COMPLETED + 48h dispute window -> platform fee via application_fee_amount (itemized, P-3).
 * TODO: onboardCrewAccount(), createEscrowIntent(booking), releasePayout(booking), refundByTier(booking, reason)
 * Cancellation tiers (incl. CANCELLED_WEATHER) are policy inputs — read from config, not hardcoded (G-1).
 */
export {};
