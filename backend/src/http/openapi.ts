import { z } from 'zod';
// Imported for their side effect: schemas with `.meta({ id })` join zod's global registry.
import '../features/developers/developer.schemas.js';
import '../features/skills/skill.schemas.js';
import '../features/tasks/task.schemas.js';
import '../shared/responses.js';

const COMPONENT_PATH = '#/components/schemas/';

type SchemaName = 'Task' | 'TaskInput' | 'TaskUpdate' | 'Developer' | 'Skill' | 'ErrorResponse';

const ref = (name: SchemaName) => ({ $ref: `${COMPONENT_PATH}${name}` });

const dataResponse = (description: string, schema: object) => ({
  description,
  content: {
    'application/json': {
      schema: { type: 'object', required: ['data'], properties: { data: schema } },
    },
  },
});

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('ErrorResponse') } },
});

const jsonBody = (schema: object) => ({
  required: true,
  content: { 'application/json': { schema } },
});

const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
};

const COMMON_ERRORS = {
  '429': errorResponse('Too many requests.'),
  '500': errorResponse('Unexpected server error.'),
};

function readEndpoints(tag: string, name: SchemaName, label: string) {
  return {
    collection: {
      get: {
        tags: [tag],
        operationId: `list${tag}`,
        summary: `List ${label}s`,
        responses: {
          '200': dataResponse(`All ${label}s.`, { type: 'array', items: ref(name) }),
          ...COMMON_ERRORS,
        },
      },
    },
    item: {
      get: {
        tags: [tag],
        operationId: `get${name}`,
        summary: `Read a ${label}`,
        parameters: [idParameter],
        responses: {
          '200': dataResponse(`The ${label}.`, ref(name)),
          '400': errorResponse('The id is not a valid integer.'),
          '404': errorResponse(`No such ${label}.`),
          ...COMMON_ERRORS,
        },
      },
    },
  };
}

const skills = readEndpoints('Skills', 'Skill', 'skill');
const developers = readEndpoints('Developers', 'Developer', 'developer');

const { schemas: registered } = z.toJSONSchema(z.globalRegistry, {
  io: 'input',
  uri: (id) => `${COMPONENT_PATH}${id}`,
});

// zod marks each schema as a standalone document; as components they must not be.
function toComponent(schema: (typeof registered)[string]) {
  const { $id, $schema, ...component } = schema;
  return component;
}

const schemas = Object.fromEntries(
  Object.entries(registered).map(([name, schema]) => [name, toComponent(schema)]),
);

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Task Assignment API',
    version: '1.0.0',
    description: 'Create tasks with nested subtasks and assign them to qualified developers.',
  },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/tasks': {
      get: {
        tags: ['Tasks'],
        operationId: 'listTasks',
        summary: 'List top-level tasks, newest first, with nested subtasks',
        responses: {
          '200': dataResponse('All tasks.', { type: 'array', items: ref('Task') }),
          ...COMMON_ERRORS,
        },
      },
      post: {
        tags: ['Tasks'],
        operationId: 'createTask',
        summary: 'Create a task and any nested subtasks',
        description:
          'Tasks without skills have them identified by the LLM. If that fails, the task is still created with skillsSource "pending" and retried in the background.',
        requestBody: jsonBody(ref('TaskInput')),
        responses: {
          '201': dataResponse('The created task tree.', ref('Task')),
          '400': errorResponse('The body failed validation or exceeds the tree limits.'),
          '422': errorResponse('A skill id does not exist.'),
          ...COMMON_ERRORS,
        },
      },
    },
    '/tasks/{id}': {
      get: {
        tags: ['Tasks'],
        operationId: 'getTask',
        summary: 'Read a task and its subtree',
        parameters: [idParameter],
        responses: {
          '200': dataResponse('The task.', ref('Task')),
          '400': errorResponse('The id is not a valid integer.'),
          '404': errorResponse('No such task.'),
          ...COMMON_ERRORS,
        },
      },
      patch: {
        tags: ['Tasks'],
        operationId: 'updateTask',
        summary: 'Change status and/or assignee',
        parameters: [idParameter],
        requestBody: jsonBody(ref('TaskUpdate')),
        responses: {
          '200': dataResponse('The updated task.', ref('Task')),
          '400': errorResponse('The body failed validation.'),
          '404': errorResponse('No such task.'),
          '409': errorResponse(
            'The status rule was broken (SUBTASKS_NOT_DONE, PARENT_TASK_DONE) or skills are still pending (TASK_SKILLS_PENDING).',
          ),
          '422': errorResponse(
            'The developer does not exist or lacks a required skill (DEVELOPER_NOT_FOUND, DEVELOPER_MISSING_SKILLS).',
          ),
          ...COMMON_ERRORS,
        },
      },
    },
    '/developers': developers.collection,
    '/developers/{id}': developers.item,
    '/skills': skills.collection,
    '/skills/{id}': skills.item,
  },
  components: { schemas },
};
