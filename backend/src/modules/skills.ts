import { Router } from 'express';
import type { Queryable } from '../db/pool.js';
import { notFound } from '../errors.js';
import { parseIdParam } from './params.js';

export interface Skill {
  id: number;
  name: string;
}

export async function listSkills(db: Queryable): Promise<Skill[]> {
  const { rows } = await db.query<Skill>('SELECT id, name FROM skills ORDER BY id');
  return rows;
}

export function skillsRouter(db: Queryable): Router {
  return Router()
    .get('/', async (_req, res) => {
      res.json(await listSkills(db));
    })
    .get('/:id', async (req, res) => {
      const id = parseIdParam(req.params.id);
      const { rows } = await db.query<Skill>('SELECT id, name FROM skills WHERE id = $1', [id]);
      if (!rows[0]) throw notFound('Skill', id);
      res.json(rows[0]);
    });
}
