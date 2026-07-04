-- Store the selected currency for each shared expense.
-- The current budget algorithm still sums numeric amounts without conversion;
-- this field preserves the user's selection for display and future FX support.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT '';
