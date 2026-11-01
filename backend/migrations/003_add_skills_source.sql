-- Part 5: record whether a task's skills came from the user or from the LLM.

CREATE TYPE skills_source AS ENUM ('user', 'llm');

ALTER TABLE tasks ADD COLUMN skills_source skills_source NOT NULL DEFAULT 'user';
