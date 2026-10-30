import { Router } from 'express';
import { parseIdParam } from './params.js';
import { parseCreateTask, parseUpdateTask } from './taskSchemas.js';
import type { TaskService } from './taskService.js';

export function tasksRouter(service: TaskService): Router {
  return Router()
    .get('/', async (_req, res) => {
      res.json(await service.list());
    })
    .get('/:id', async (req, res) => {
      res.json(await service.get(parseIdParam(req.params.id)));
    })
    .post('/', async (req, res) => {
      const task = await service.create(parseCreateTask(req.body));
      res.status(201).location(`/api/tasks/${task.id}`).json(task);
    })
    .patch('/:id', async (req, res) => {
      const id = parseIdParam(req.params.id);
      res.json(await service.update(id, parseUpdateTask(req.body)));
    });
}
