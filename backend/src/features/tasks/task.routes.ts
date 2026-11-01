import { Router } from 'express';
import { parseIdParam } from '../../shared/params.js';
import { parseCreateTask, parseUpdateTask } from './task.schemas.js';
import type { TaskService } from './task.service.js';

export function taskRoutes(service: TaskService): Router {
  return Router()
    .get('/', async (_req, res) => {
      res.json({ data: await service.list() });
    })
    .get('/:id', async (req, res) => {
      res.json({ data: await service.get(parseIdParam(req.params.id)) });
    })
    .post('/', async (req, res) => {
      const task = await service.create(parseCreateTask(req.body));
      res.status(201).location(`/api/v1/tasks/${task.id}`).json({ data: task });
    })
    .patch('/:id', async (req, res) => {
      const id = parseIdParam(req.params.id);
      res.json({ data: await service.update(id, parseUpdateTask(req.body)) });
    });
}
