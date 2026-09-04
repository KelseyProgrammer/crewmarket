-- CreateTable
CREATE TABLE "booking" (
    "id" TEXT NOT NULL,
    "crewProfileId" TEXT NOT NULL,
    "boatUserId" TEXT NOT NULL,
    "tripType" TEXT NOT NULL,
    "dates" JSONB NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REQUESTED',
    "piAttestedAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "fundsHeldAt" TIMESTAMP(3),
    "tripStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_profile_claim" (
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crew_profile_claim_pkey" PRIMARY KEY ("profileId")
);

-- CreateIndex
CREATE INDEX "booking_boatUserId_idx" ON "booking"("boatUserId");

-- CreateIndex
CREATE INDEX "booking_crewProfileId_idx" ON "booking"("crewProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "crew_profile_claim_userId_key" ON "crew_profile_claim"("userId");

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_boatUserId_fkey" FOREIGN KEY ("boatUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

