import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { prisma } from "@crewmarket/db";

/* Accounts & Roles (SOW 2.i). Two account types only: CREW offers services, BOAT books
   them (M-1). ADMIN is never a signup option — operator accounts are promoted manually. */

export const ACCOUNT_TYPES = ["CREW", "BOAT"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
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
  plugins: [nextCookies()],
});

export type ServerSession = typeof auth.$Infer.Session;
