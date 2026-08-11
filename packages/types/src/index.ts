import { z } from "zod";

// ---------- CREW ----------

export const CrewRole = z.enum(["MATE", "DECKHAND", "CAPTAIN", "SECOND_CAPTAIN", "ENGINEER", "COOK"]);

export const Credential = z.object({
  kind: z.enum(["USCG_OUPV", "USCG_MASTER_25_50_100", "STCW_BASIC", "CPR_FIRST_AID", "TWIC", "STATE_CHARTER_LICENSE", "OTHER"]),
  licenseClass: z.string().optional(),        // e.g. "Master 100T"
  expiresAt: z.string().optional(),
  docRef: z.string().optional(),              // S3 key — rule V-2: presigned access only
  verified: z.boolean().default(false),       // rule V-1: admin/vendor-set only, never self-set
});

export const CrewProfile = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  roles: z.array(CrewRole),
  homePort: z.string(),                       // e.g. "Islamorada, FL" — coarse (rule D-3)
  regions: z.array(z.string()),               // willing-to-work regions
  yearsExperience: z.number(),
  fisheries: z.array(z.string()),             // e.g. "sailfish", "offshore troll", "bottom", "tournament"
  vesselExperience: z.array(z.string()),      // e.g. "sportfisher 40-60ft", "center console", "outriggers/kites"
  dayRateUsd: z.number(),                     // rule M-2: crew-set, never platform-mandated
  halfDayRateUsd: z.number().optional(),
  tournamentRateUsd: z.number().optional(),
  bio: z.string(),
  photoRefs: z.array(z.string()),
  credentials: z.array(Credential),
  availability: z.array(z.object({ date: z.string(), status: z.enum(["OPEN", "BOOKED", "UNAVAILABLE"]) })),
  stripeConnectAccountId: z.string().optional(), // rule P-1: Stripe holds KYC/bank/tax data, not us
  stats: z.object({ tripsCompleted: z.number(), avgRating: z.number().optional(), responseRate: z.number().optional() }),
});
export type CrewProfile = z.infer<typeof CrewProfile>;

// ---------- BOAT / OWNER ----------

export const BoatProfile = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  boatName: z.string(),
  vessel: z.object({ makeModel: z.string(), lengthFt: z.number(), type: z.enum(["SPORTFISHER", "EXPRESS", "CENTER_CONSOLE", "CATAMARAN", "OTHER"]) }),
  homePort: z.string(),
  operationType: z.enum(["PRIVATE", "CHARTER", "TOURNAMENT_PROGRAM"]),
  insuranceAttestation: z.object({ attestedAt: z.string(), coversCrew: z.boolean() }).optional(), // rule D-4
  stats: z.object({ tripsBooked: z.number(), avgRating: z.number().optional() }),
});
export type BoatProfile = z.infer<typeof BoatProfile>;

// ---------- JOB / BOOKING ----------

export const JobPost = z.object({
  id: z.string().uuid(),
  boatId: z.string().uuid(),
  role: CrewRole,
  dates: z.array(z.string()),
  tripType: z.enum(["HALF_DAY", "FULL_DAY", "MULTI_DAY", "TOURNAMENT", "DELIVERY"]),
  offeredRateUsd: z.number().optional(),      // an offer, negotiable — crew rate autonomy (M-2)
  description: z.string(),
  status: z.enum(["OPEN", "FILLED", "CANCELLED", "EXPIRED"]),
});

export const Booking = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid().optional(),        // direct bookings may skip a job post
  boatId: z.string().uuid(),
  crewId: z.string().uuid(),
  agreedRateUsd: z.number(),
  platformFeeUsd: z.number(),                 // rule P-3: itemized, transparent
  dates: z.array(z.string()),
  state: z.enum([
    "REQUESTED", "ACCEPTED", "ESCROW_FUNDED", "IN_PROGRESS",
    "COMPLETED", "DISPUTE_WINDOW", "PAID_OUT",
    "CANCELLED_WEATHER", "CANCELLED_BOAT", "CANCELLED_CREW",
  ]),
  agreementRef: z.string().optional(),        // rule M-4: boat↔crew agreement doc, platform not a party
  stripePaymentIntentId: z.string().optional(),
});
export type Booking = z.infer<typeof Booking>;

export const Review = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),               // reviews only from completed on-platform bookings (P-4 moat)
  authorId: z.string().uuid(),
  subjectId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  text: z.string(),
});
