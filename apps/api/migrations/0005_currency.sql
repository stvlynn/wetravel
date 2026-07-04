-- Currency preferences.
-- 1. Per-user default currency (Better Auth additional field `defaultCurrency`).
-- 2. Per-stop cost currency, so an estimated cost can be recorded in a currency
--    that differs from the trip's base currency (display-only; the budget stays
--    expense-based). Idempotent so it is safe to re-run.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "defaultCurrency" text NOT NULL DEFAULT 'JPY';

ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS cost_currency text NOT NULL DEFAULT '';
