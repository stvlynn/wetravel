-- AlterTable
ALTER TABLE "trip_members" ADD COLUMN     "can_invite" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'editor',
ADD COLUMN     "user_id" TEXT;

-- CreateTable
CREATE TABLE "trip_invites" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "access_scope" TEXT NOT NULL DEFAULT 'anyone',
    "role" TEXT NOT NULL DEFAULT 'editor',
    "can_invite" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_invite_allowed_emails" (
    "invite_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "trip_invite_allowed_emails_pkey" PRIMARY KEY ("invite_id","email")
);

-- CreateTable
CREATE TABLE "trip_invite_acceptances" (
    "invite_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_invite_acceptances_pkey" PRIMARY KEY ("invite_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_invites_token_hash_key" ON "trip_invites"("token_hash");

-- CreateIndex
CREATE INDEX "trip_invites_trip_idx" ON "trip_invites"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_members_trip_user_unique" ON "trip_members"("trip_id", "user_id");

-- AddForeignKey
ALTER TABLE "trip_invites" ADD CONSTRAINT "trip_invites_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_invite_allowed_emails" ADD CONSTRAINT "trip_invite_allowed_emails_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "trip_invites"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_invite_acceptances" ADD CONSTRAINT "trip_invite_acceptances_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "trip_invites"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
