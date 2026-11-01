-- Part 4.1: a task can have subtasks, which are themselves tasks (adjacency list).

ALTER TABLE tasks
  ADD COLUMN parent_task_id INT REFERENCES tasks (id) ON DELETE CASCADE,
  ADD CONSTRAINT tasks_not_own_parent CHECK (parent_task_id <> id);

CREATE INDEX tasks_parent_task_id_idx ON tasks (parent_task_id);
