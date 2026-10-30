-- Part 1: developers, skills and tasks.

CREATE TABLE skills (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE developers (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE developer_skills (
  developer_id INT NOT NULL REFERENCES developers (id) ON DELETE CASCADE,
  skill_id     INT NOT NULL REFERENCES skills (id) ON DELETE RESTRICT,
  PRIMARY KEY (developer_id, skill_id)
);
CREATE INDEX developer_skills_skill_id_idx ON developer_skills (skill_id);

CREATE TYPE task_status AS ENUM ('To-do', 'In Progress', 'Done');

CREATE TABLE tasks (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       TEXT NOT NULL CHECK (btrim(title) <> ''),
  status      task_status NOT NULL DEFAULT 'To-do',
  assignee_id INT REFERENCES developers (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_assignee_id_idx ON tasks (assignee_id);

CREATE TABLE task_skills (
  task_id  INT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  skill_id INT NOT NULL REFERENCES skills (id) ON DELETE RESTRICT,
  PRIMARY KEY (task_id, skill_id)
);
CREATE INDEX task_skills_skill_id_idx ON task_skills (skill_id);
