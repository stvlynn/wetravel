-- Avatar image URL for trip members. Falls back to the default avatar service
-- when null (e.g. legacy seed data or members created before this column).
ALTER TABLE trip_members ADD COLUMN IF NOT EXISTS image text;
