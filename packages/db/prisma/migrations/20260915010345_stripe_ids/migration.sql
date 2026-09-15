-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "stripeRefundId" TEXT,
ADD COLUMN     "stripeTransferId" TEXT;

-- AlterTable
ALTER TABLE "crew_profile_claim" ADD COLUMN     "stripeAccountId" TEXT;
