import cors from 'cors';
import express, { Router, type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';
import type { Pool } from '../db/database.js';
import { createDeveloperRepository } from '../features/developers/developer.repository.js';
import { developerRoutes } from '../features/developers/developer.routes.js';
import { createDeveloperService } from '../features/developers/developer.service.js';
import { createSkillRepository } from '../features/skills/skill.repository.js';
import { skillRoutes } from '../features/skills/skill.routes.js';
import { createSkillService } from '../features/skills/skill.service.js';
import { createTaskRepository } from '../features/tasks/task.repository.js';
import { taskRoutes } from '../features/tasks/task.routes.js';
import { createTaskService } from '../features/tasks/task.service.js';
import type { SkillIdentifier } from '../llm/skillIdentifier.js';
import { AppError } from '../shared/errors.js';
import { errorHandler } from './errorHandler.js';
import { openApiDocument } from './openapi.js';

export interface AppDependencies {
  pool: Pool;
  skillIdentifier: SkillIdentifier;
  logger: Logger;
  corsAllowedOrigins: string[];
  rateLimit: { windowMs: number; max: number };
  trustProxyHops: number;
}

export function createApp({
  pool,
  skillIdentifier,
  logger,
  corsAllowedOrigins,
  rateLimit: rateLimitOptions,
  trustProxyHops,
}: AppDependencies): Express {
  const tasks = createTaskRepository(pool);
  const skills = createSkillRepository(pool);
  const developers = createDeveloperRepository(pool);

  const app = express();
  // Without this, every request behind nginx would count as one client for rate limiting.
  app.set('trust proxy', trustProxyHops);
  app.use(helmet());
  if (corsAllowedOrigins.length > 0) app.use(cors({ origin: corsAllowedOrigins }));
  app.use(pinoHttp({ logger, redact: ['req.headers.authorization', 'req.headers.cookie'] }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch (error) {
      req.log.error({ err: error }, 'Health check failed');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const api = Router();
  api.use(
    rateLimit({
      windowMs: rateLimitOptions.windowMs,
      limit: rateLimitOptions.max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) => {
        next(new AppError('rate_limited', 'RATE_LIMITED', 'Too many requests. Try again shortly.'));
      },
    }),
  );
  api.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  api.use(
    '/docs',
    // Swagger UI needs inline styles and data: images, which the default policy blocks.
    helmet({
      contentSecurityPolicy: {
        directives: {
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'upgrade-insecure-requests': null,
        },
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument),
  );
  api.use(
    '/tasks',
    taskRoutes(createTaskService({ tasks, skills, developers, skillIdentifier, logger })),
  );
  api.use('/developers', developerRoutes(createDeveloperService(developers)));
  api.use('/skills', skillRoutes(createSkillService(skills)));
  app.use('/api/v1', api);

  app.use((req, _res, next) => {
    next(new AppError('not_found', 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}.`));
  });
  app.use(errorHandler);
  return app;
}
