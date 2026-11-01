-- Describes each skill so the LLM prompt can be built entirely from database rows.

ALTER TABLE skills ADD COLUMN description TEXT NOT NULL DEFAULT '';
