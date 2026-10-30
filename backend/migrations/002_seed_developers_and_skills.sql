-- Part 1.2: seed data. Running this as a migration guarantees it applies exactly once.

INSERT INTO skills (name) VALUES ('Frontend'), ('Backend');

INSERT INTO developers (name) VALUES ('Alice'), ('Bob'), ('Carol'), ('Dave');

INSERT INTO developer_skills (developer_id, skill_id)
SELECT d.id, s.id
FROM (VALUES
  ('Alice', 'Frontend'),
  ('Bob',   'Backend'),
  ('Carol', 'Frontend'),
  ('Carol', 'Backend'),
  ('Dave',  'Backend')
) AS seed (developer_name, skill_name)
JOIN developers d ON d.name = seed.developer_name
JOIN skills s ON s.name = seed.skill_name;
