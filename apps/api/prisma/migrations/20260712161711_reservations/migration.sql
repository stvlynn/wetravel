-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'tentative',
    "title" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '',
    "confirmation_number" TEXT NOT NULL DEFAULT '',
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6),
    "timezone" TEXT NOT NULL,
    "location_name" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "day_number" INTEGER,
    "stop_id" TEXT,
    "expense_id" TEXT,
    "amount_minor" BIGINT,
    "currency" CHAR(3),
    "notes" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservations_trip_start_idx" ON "reservations"("trip_id", "start_at");

-- CreateIndex
CREATE INDEX "reservations_stop_idx" ON "reservations"("stop_id");

-- CreateIndex
CREATE INDEX "reservations_expense_idx" ON "reservations"("expense_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_idempotency_key" ON "reservations"("trip_id", "created_by", "idempotency_key");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
