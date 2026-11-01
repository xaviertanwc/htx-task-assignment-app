-- Keeps the retry job's polling cheap. Separate from 005 because a new enum value
-- cannot be used in the transaction that adds it.

CREATE INDEX tasks_pending_skills_idx ON tasks (id) WHERE skills_source = 'pending';
