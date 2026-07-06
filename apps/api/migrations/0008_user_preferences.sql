-- Per-user UI preferences persisted across devices.
-- Currently stores the travel-planner sidebar width and collapsed state.

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id                     text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  planner_sidebar_width       numeric NOT NULL DEFAULT 30,
  planner_sidebar_collapsed   boolean NOT NULL DEFAULT false,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
