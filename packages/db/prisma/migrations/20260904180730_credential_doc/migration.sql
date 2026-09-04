-- CreateTable
CREATE TABLE "credential_doc" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "licenseClass" TEXT,
    "expiresAt" TIMESTAMP(3),
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByEmail" TEXT,

    CONSTRAINT "credential_doc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credential_doc_s3Key_key" ON "credential_doc"("s3Key");

-- CreateIndex
CREATE INDEX "credential_doc_profileId_idx" ON "credential_doc"("profileId");

-- AddForeignKey
ALTER TABLE "credential_doc" ADD CONSTRAINT "credential_doc_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
