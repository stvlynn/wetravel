-- AlterTable
ALTER TABLE "user" ADD COLUMN     "emailIsPlaceholder" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "external_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_conflicts" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "primary_user_id" TEXT NOT NULL,
    "conflicting_user_id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "identity_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_identities_user_idx" ON "external_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_identity_subject_unique" ON "external_identities"("provider", "subject_type", "issuer", "subject");

-- CreateIndex
CREATE INDEX "identity_conflicts_primary_user_idx" ON "identity_conflicts"("primary_user_id");

-- CreateIndex
CREATE INDEX "identity_conflicts_conflicting_user_idx" ON "identity_conflicts"("conflicting_user_id");

-- CreateIndex
CREATE INDEX "identity_conflicts_status_created_idx" ON "identity_conflicts"("status", "created_at");

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
