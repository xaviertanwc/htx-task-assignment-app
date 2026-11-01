import { Router } from 'express';
import { parseIdParam } from '../../shared/params.js';
import type { SkillService } from './skill.service.js';

export function skillRoutes(service: SkillService): Router {
  return Router()
    .get('/', async (_req, res) => {
      res.json({ data: await service.list() });
    })
    .get('/:id', async (req, res) => {
      res.json({ data: await service.get(parseIdParam(req.params.id)) });
    });
}
