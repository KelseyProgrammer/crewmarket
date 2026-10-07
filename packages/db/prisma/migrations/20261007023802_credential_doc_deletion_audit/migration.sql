-- CreateTable
CREATE TABLE "credential_doc_deletion" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "licenseClass" TEXT,
    "expiresAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "verifiedByEmail" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_doc_deletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credential_doc_deletion_profileId_idx" ON "credential_doc_deletion"("profileId");
