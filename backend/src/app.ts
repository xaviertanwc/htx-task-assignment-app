import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Pool as Db } from './db/database.js';
import { AppError } from './errors.js';
import type { SkillIdentifier } from './llm/skillIdentifier.js';
import { errorHandler } from './middleware/errorHandler.js';
import { developersRouter } from './modules/developers.js';
import { skillsRouter } from './modules/skills.js';
import { createTaskService } from './modules/taskService.js';
import { tasksRouter } from './modules/tasks.js';

export interface AppDependencies {
  db: Db;
  skillIdentifier: SkillIdentifier;
  logger: Logger;
}

export function createApp({ db, skillIdentifier, logger }: AppDependencies): Express {
  const app = express();
  app.use(helmet());
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  const api = Router();
  api.use('/tasks', tasksRouter(createTaskService(db, skillIdentifier)));
  api.use('/developers', developersRouter(db));
  api.use('/skills', skillsRouter(db));
  app.use('/api', api);

  app.use((req, _res, next) => {
    next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}.`));
  });
  app.use(errorHandler);
  return app;
}
