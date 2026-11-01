import { Router } from 'express';
import type { Queryable } from '../db/database.js';
import { notFound } from '../errors.js';
import { parseIdParam } from './params.js';

export interface Developer {
  id: number;
  name: string;
  skills: { id: number; name: string }[];
  tasks: { id: number; title: string; status: string }[];
}

const SELECT_DEVELOPERS = `
  SELECT
    d.id,
    d.name,
    COALESCE((
      SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.id)
      FROM developer_skills ds JOIN skills s ON s.id = ds.skill_id
      WHERE ds.developer_id = d.id
    ), '[]') AS skills,
    COALESCE((
      SELECT json_agg(json_build_object('id', t.id, 'title', t.title, 'status', t.status) ORDER BY t.id)
      FROM tasks t
      WHERE t.assignee_id = d.id
    ), '[]') AS tasks
  FROM developers d
`;

export function developersRouter(db: Queryable): Router {
  return Router()
    .get('/', async (_req, res) => {
      const { rows } = await db.query<Developer>(`${SELECT_DEVELOPERS} ORDER BY d.id`);
      res.json(rows);
    })
    .get('/:id', async (req, res) => {
      const id = parseIdParam(req.params.id);
      const { rows } = await db.query<Developer>(`${SELECT_DEVELOPERS} WHERE d.id = $1`, [id]);
      if (!rows[0]) throw notFound('Developer', id);
      res.json(rows[0]);
    });
}
