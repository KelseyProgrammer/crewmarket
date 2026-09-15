import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { expo } from "@better-auth/expo";
import { APIError } from "better-auth/api";
import { prisma } from "@crewmarket/db";
import { isAdminEmail } from "./credential-rules";

/* Accounts & Roles (SOW 2.i). Two account types only: CREW offers services, BOAT books
   them (M-1). ADMIN is never a signup option — operator accounts are promoted manually. */

export const ACCOUNT_TYPES = ["CREW", "BOAT"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  trustedOrigins: [
    "crewmarket://", // standalone / dev-client builds use the app scheme
    // Expo Go sends origin `exp://<lan-ip>:8081`. The @better-auth/expo plugin only
    // auto-trusts "exp://" when NODE_ENV==="development"; on Vercel (production) it
    // doesn't, so we trust it explicitly for the Expo Go device pass. DEV/DEMO ONLY —
    // remove before a real production launch (standalone builds use crewmarket://).
    "exp://",
    "http://localhost:3000",
    "http://localhost:3002",
    "https://crewmarket-web.vercel.app",
  ],
  user: {
    additionalFields: {
      accountType: { type: "string", required: true, input: true },
      // Rule D-2: signup requires attesting the marketplace disclaimer.
      disclaimerAccepted: { type: "boolean", required: true, input: true },
      disclaimerAcceptedAt: { type: "date", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const u = user as typeof user & { accountType?: string; disclaimerAccepted?: boolean };
          if (isAdminEmail(u.email, process.env.ADMIN_EMAILS)) {
            // Admin accounts are provisioned out-of-band, never via self-signup —
            // otherwise anyone could register an allowlisted address and pass the
            // /admin gate (V-1).
            throw new APIError("BAD_REQUEST", { message: "This email can't be used for sign-up." });
          }
          if (!ACCOUNT_TYPES.includes(u.accountType as AccountType)) {
            throw new APIError("BAD_REQUEST", { message: "Choose a crew or boat account." });
          }
          if (u.disclaimerAccepted !== true) {
            throw new APIError("BAD_REQUEST", {
              message: "You must acknowledge the marketplace disclaimer to create an account.",
            });
          }
          return { data: { ...user, disclaimerAcceptedAt: new Date() } };
        },
      },
    },
  },
  plugins: [expo(), nextCookies()],
});

export type ServerSession = typeof auth.$Infer.Session;
