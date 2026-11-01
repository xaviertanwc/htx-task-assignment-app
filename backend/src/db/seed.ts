import { withTransaction, type Pool } from './database.js';

const SKILLS = [
  {
    name: 'Frontend',
    description:
      'Anything the user sees or interacts with in the browser: pages, layout, responsiveness, forms and client-side behaviour.',
  },
  {
    name: 'Backend',
    description:
      'Server-side work: business logic, APIs, data storage, file storage, security, logging and infrastructure.',
  },
];

const DEVELOPERS = [
  { name: 'Alice', skills: ['Frontend'] },
  { name: 'Bob', skills: ['Backend'] },
  { name: 'Carol', skills: ['Frontend', 'Backend'] },
  { name: 'Dave', skills: ['Backend'] },
];

/** Inserts reference data. Safe to run repeatedly: existing rows are left untouched. */
export async function runSeed(pool: Pool): Promise<void> {
  await withTransaction(pool, async (client) => {
    for (const skill of SKILLS) {
      await client.query(
        'INSERT INTO skills (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [skill.name, skill.description],
      );
    }
    for (const developer of DEVELOPERS) {
      // developers.name is deliberately not unique, so ON CONFLICT is not available here.
      await client.query(
        `INSERT INTO developers (name)
         SELECT $1::text WHERE NOT EXISTS (SELECT 1 FROM developers WHERE name = $1)`,
        [developer.name],
      );
      await client.query(
        `INSERT INTO developer_skills (developer_id, skill_id)
         SELECT d.id, s.id
         FROM developers d JOIN skills s ON s.name = ANY($2::text[])
         WHERE d.name = $1
         ON CONFLICT DO NOTHING`,
        [developer.name, developer.skills],
      );
    }
  });
}
