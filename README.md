# Task Assignment App

Create tasks with nested subtasks and assign them to developers who have the right skills. When a task is created without skills, the backend identifies them from the title using an LLM.

| Layer    | Technology                                                       |
| -------- | ---------------------------------------------------------------- |
| Frontend | TypeScript, React, Vite, TanStack Query                          |
| Backend  | TypeScript, Node.js, Express                                     |
| Database | PostgreSQL: embedded by default, or any server through config    |
| LLM      | Google Gemini API, behind a swappable interface                  |
| Runtime  | Docker Compose                                                   |

## Quick start

Requires Docker with Compose 2.20 or later.

```bash
cp .env.example .env
```

Set `GEMINI_API_KEY` in `.env` ([get a key](https://aistudio.google.com/apikey)), then:

```bash
docker compose up --build
```

| What            | Where                              |
| --------------- | ---------------------------------- |
| App             | http://localhost:8080              |
| API             | http://localhost:3000/api/v1       |
| API docs        | http://localhost:3000/api/v1/docs  |
| Health check    | http://localhost:3000/health       |

The first start takes longer because it initialises the database. Migrations and seed data are applied automatically on every start.

No key? The app still runs. Tasks created with no skills are saved as "pending" and can't be assigned until a key is configured. Tasks with skills selected aren't affected.

To remove all data, run `docker compose down -v`.

### Using an external PostgreSQL server

Switching needs configuration only, with no code changes.

**To use the optional `postgres` service in Compose,** uncomment these two lines in `.env`:

```bash
DB_MODE=external
DATABASE_URL=postgres://postgres:postgres@postgres:5432/task_assignment
```

Then start with the profile enabled:

```bash
docker compose --profile external up --build
```

**To use your own server,** set `DATABASE_URL` to point at it, and leave out `--profile external`. The database must already exist. Migrations and seed data are applied on start.

## Configuration

Docker Compose reads these from `.env`. Every setting is optional unless noted, and the app reports all invalid settings by name at startup, without printing their values.

| Variable                  | Default                 | Purpose                                                       |
| ------------------------- | ----------------------- | ------------------------------------------------------------- |
| `DB_MODE`                 | `embedded`              | `embedded` or `external`                                      |
| `DATABASE_URL`            | (none)                  | Connection URL. **Required** when `DB_MODE=external`          |
| `DB_EMBEDDED_DATA_DIR`    | `.data/postgres`        | Embedded data directory. Docker uses `/app/data/postgres`     |
| `DB_EMBEDDED_PORT`        | `55432`                 | Embedded port, reachable only from the same machine or container |
| `DB_EMBEDDED_USER`        | `postgres`              | Embedded user                                                 |
| `DB_EMBEDDED_PASSWORD`    | `postgres`              | Embedded password                                             |
| `DB_EMBEDDED_NAME`        | `task_assignment`       | Embedded database name                                        |
| `GEMINI_API_KEY`          | (none)                  | Needed to identify skills automatically                       |
| `GEMINI_MODEL`            | `gemini-3.5-flash-lite` | Gemini model                                                  |
| `GEMINI_BASE_URL`         | (none)                  | Routes Gemini traffic through a proxy. Not passed through Compose |
| `SKILL_RETRY_INTERVAL_MS` | `60000`                 | How often pending tasks are retried                           |
| `PORT`                    | `3000`                  | Backend port inside its container or process                  |
| `LOG_LEVEL`               | `info`                  | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`  |
| `CORS_ALLOWED_ORIGINS`    | (empty)                 | Comma-separated origins. Empty means same-origin only         |
| `RATE_LIMIT_WINDOW_MS`    | `60000`                 | Rate limit window, per client address                         |
| `RATE_LIMIT_MAX`          | `300`                   | Requests allowed per window                                   |
| `TRUST_PROXY_HOPS`        | `0`                     | Proxies in front of the API. Compose sets `1` for nginx       |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `postgres`, `postgres`, `task_assignment` | Optional `postgres` service only. Keep `DATABASE_URL` in step |
| `BACKEND_PORT`, `FRONTEND_PORT` | `3000`, `8080`    | Host ports in Compose                                         |

## Local development

Requires Node.js 20.11 or later, and a `.env` file at the repository root (`cp .env.example .env`). No database installation is needed, because the backend starts embedded PostgreSQL itself.

Backend, on port 3000:

```bash
cd backend && npm install && npm run dev
```

Frontend, on http://localhost:5173, proxying `/api` to the backend:

```bash
cd frontend && npm install && npm run dev
```

### Scripts

Run these in `backend/` or `frontend/`:

| Script                 | What it does                               |
| ---------------------- | ------------------------------------------ |
| `npm test`             | Runs the tests                             |
| `npm run lint`         | ESLint                                     |
| `npm run format:check` | Checks formatting (`npm run format` fixes) |
| `npm run typecheck`    | TypeScript                                 |
| `npm run build`        | Production build                           |

Backend only:

| Script            | What it does                                                    |
| ----------------- | --------------------------------------------------------------- |
| `npm run migrate` | Applies pending migrations, then exits                          |
| `npm run seed`    | Applies seed data, then exits. Safe to repeat                   |
| `npm run openapi` | Regenerates `openapi.json` from the schemas                     |

Frontend only: `npm run gen:api` regenerates `src/shared/api/schema.gen.ts` from `backend/openapi.json`. Tests fail if `openapi.json` is stale, and CI fails if the generated types are.

### Migrations and seed data

The server applies both on every start, so you rarely need to run them by hand.

- **Migrations** are numbered SQL files in [`backend/migrations`](backend/migrations). Each runs once, in order, in its own transaction, and an advisory lock stops two instances migrating at once.
- **Seed data** is in [`backend/src/db/seed.ts`](backend/src/db/seed.ts). It only inserts rows that are missing, so repeating it changes nothing.

In **embedded mode**, stop the server before running `npm run migrate` or `npm run seed`, because only one process can use a data directory. In **external mode**, you can run them at any time. Inside a running container, use:

```bash
docker compose exec backend node dist/cli/migrate.js
```

### Tests

Backend tests start a real, temporary PostgreSQL automatically. To run them against your own server, set `TEST_DATABASE_URL`; they truncate tasks, so use a disposable database. The LLM is always mocked: the Gemini client is tested against a local HTTP server, so no key is needed.

| Suite                     | Covers                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `backend/tests/unit`      | Business rules, the service over in-memory fakes, config, LLM prompt, parsing, retries and fallback, retry job |
| `backend/tests/integration` | The API against real PostgreSQL, concurrency, database modes, restarts, CORS, rate limiting, API docs |
| `frontend/src`            | Task list and creation pages, plus tree and draft logic                                |

## Architecture

This section is a summary. [`docs/DESIGN.md`](docs/DESIGN.md) explains each design choice in detail, from the overall system down to individual components.

```mermaid
flowchart LR
  Browser --> Nginx["nginx: SPA and /api proxy"]
  Nginx --> API
  subgraph Backend container
    API["Express API"] --> DB[("PostgreSQL (embedded)")]
    Job["Skill retry job"] --> DB
  end
  API --> Gemini["Gemini API"]
  Job --> Gemini
  API -. "DB_MODE=external" .-> Ext[("PostgreSQL server")]
```

### Backend layers

Dependencies point one way. Business rules know nothing about HTTP or SQL, so they can be unit tested on their own.

```mermaid
flowchart TD
  R["routes: parse and validate HTTP input"] --> S["services: orchestrate a use case"]
  S --> RU["task.rules: pure business rules"]
  S --> Rep["repositories: SQL, behind interfaces"]
  S --> L["llm: SkillIdentifier interface"]
  Rep --> D["db: the only module that knows the database mode"]
  L --> G["gemini: one implementation"]
```

```text
backend/src/
  cli/          migrate, seed and OpenAPI export commands
  config/       environment validation
  db/           connection factory, embedded process, migrations, seed
  features/     tasks, developers, skills: routes → service → repository, plus schemas
  http/         app assembly, error handling, OpenAPI document
  jobs/         background retry of pending skills
  llm/          SkillIdentifier interface, Gemini, prompt, answer parsing
  shared/       domain errors, shared schemas

frontend/src/
  app/          routes and layout
  features/     tasks (api, components, lib, pages), developers, skills
  shared/       typed API client, generated types, reusable UI
```

### Database schema

```mermaid
erDiagram
  developers ||--o{ developer_skills : has
  skills ||--o{ developer_skills : "held by"
  skills ||--o{ task_skills : "required by"
  tasks ||--o{ task_skills : requires
  developers |o--o{ tasks : "assigned to"
  tasks |o--o{ tasks : "parent of"

  developers {
    int id PK
    text name
  }
  skills {
    int id PK
    text name UK
    text description
  }
  developer_skills {
    int developer_id PK,FK
    int skill_id PK,FK
  }
  task_skills {
    int task_id PK,FK
    int skill_id PK,FK
  }
  tasks {
    int id PK
    text title
    task_status status "To-do, In Progress, Done"
    int assignee_id FK
    int parent_task_id FK
    skills_source skills_source "user, llm, pending"
    timestamptz created_at
    timestamptz updated_at
  }
```

Only standard PostgreSQL features are used, so behaviour is the same in both modes.

### Business rules

**Assignment.** A developer must have every skill a task requires. A task whose skills are still pending can't be assigned, because nobody can be shown to qualify. Together with the rule below, this also means a pending task can't be started.

**Starting work.** An unassigned task can't move out of `To-do`. Assigning and starting in the same request is allowed, because the task ends up assigned. The rule governs leaving `To-do` only, so a task already underway can still be unassigned, for example when its developer moves on. The status dropdown disables the other statuses and says why.

**Done.** A task can only move to `Done` when all its direct subtasks are `Done`. As each subtask follows the same rule, it holds for the whole tree. Reopening a subtask under a `Done` parent is rejected as well, since it would break the rule: the parent must be reopened first. I chose this over reopening the parent automatically, so a status never changes without someone asking for it.

**Concurrency.** Each update runs in a transaction that locks the parent row, then the task's row. This stops a parent going `Done` at the same moment its subtask is reopened. Locks are always taken parent first, which also rules out deadlocks. An integration test races these two updates to confirm it.

**Subtask trees.** Trees are created in one transaction, so a failure saves nothing. A request can hold up to 100 tasks, nested up to 10 levels. Cycles can't occur: a parent is set once at insert, no API changes it, and a `CHECK` rejects self-reference. Reads use one statement with a recursive query for a subtree, so there are no N+1 queries.

### Skill identification

When a tree is created, all tasks without skills go to the LLM in **one request**, which keeps latency down and uses less quota than one call per subtask.

- **Driven by the database.** The prompt contains no skill names. Names and descriptions come from the `skills` table.
- **Validated output.** The request sets a JSON response schema limited to known skills, and answers are validated again on receipt, per title.
- **Untrusted input.** Titles are sent as JSON data, and the prompt says not to follow instructions inside them. Even a successful injection could only pick from valid skills.
- **Reliability.** Each attempt has a 15-second timeout, with up to 3 attempts and exponential backoff.

**If identification fails, the task is still created,** with `skillsSource: "pending"`. The failure is logged, assignment is blocked, and the UI explains why. A background job retries pending tasks every minute, and the list refreshes itself while any are pending. A title the LLM can't resolve stays pending without affecting the others in the tree.

## API

The base path is `/api/v1`. Interactive docs are at `/api/v1/docs`, and the OpenAPI 3.1 document at `/api/v1/openapi.json`. Both are generated from the same schemas that validate requests.

| Method  | Path               | Description                                               |
| ------- | ------------------ | --------------------------------------------------------- |
| `GET`   | `/tasks`           | List top-level tasks, newest first, with nested subtasks  |
| `GET`   | `/tasks/:id`       | Read a task and its subtree                               |
| `POST`  | `/tasks`           | Create a task and any nested subtasks                     |
| `PATCH` | `/tasks/:id`       | Change status and/or assignee                             |
| `GET`   | `/developers`      | List developers with skills and assigned tasks            |
| `GET`   | `/developers/:id`  | Read a developer                                          |
| `GET`   | `/skills`          | List skills                                               |
| `GET`   | `/skills/:id`      | Read a skill                                              |

`GET /health`, outside the versioned path, returns `200 {"status":"ok"}`, or `503 {"status":"unavailable"}` if the database can't be reached.

### Create a task

`POST /api/v1/tasks`. `skillIds` and `subtasks` are optional. New tasks start as `To-do` and unassigned.

```json
{
  "title": "As a logged-in user, I want to update my profile",
  "skillIds": [1, 2],
  "subtasks": [
    { "title": "Build the profile form", "skillIds": [1] },
    { "title": "As an admin, I want audit logs of profile changes" }
  ]
}
```

Successful responses wrap their result in `data`. This returns `201`:

```json
{
  "data": {
    "id": 1,
    "title": "As a logged-in user, I want to update my profile",
    "status": "To-do",
    "parentTaskId": null,
    "assignee": null,
    "skills": [
      { "id": 1, "name": "Frontend" },
      { "id": 2, "name": "Backend" }
    ],
    "skillsSource": "user",
    "createdAt": "2026-11-01T09:00:00.000Z",
    "updatedAt": "2026-11-01T09:00:00.000Z",
    "subtasks": []
  }
}
```

(`subtasks` is shortened here. Each entry has the same shape.)

### Update a task

`PATCH /api/v1/tasks/:id`. Provide either field or both; the update is all-or-nothing. Set `assigneeId` to `null` to unassign.

```json
{ "status": "Done", "assigneeId": 3 }
```

### Errors

```json
{ "error": { "code": "SUBTASKS_NOT_DONE", "message": "...", "details": {} } }
```

| Status | Code                       | Meaning                                      |
| ------ | -------------------------- | -------------------------------------------- |
| 400    | `VALIDATION_ERROR`         | The body failed validation                   |
| 400    | `INVALID_ID`               | The id in the path isn't a valid integer     |
| 400    | `TASK_TREE_TOO_LARGE`      | Over the task count or nesting limit         |
| 400    | `BAD_REQUEST`              | The body is malformed or too large           |
| 404    | `TASK_NOT_FOUND`, `DEVELOPER_NOT_FOUND`, `SKILL_NOT_FOUND` | The resource in the path doesn't exist |
| 404    | `ROUTE_NOT_FOUND`          | No such route                                |
| 409    | `TASK_UNASSIGNED`          | Moving an unassigned task out of `To-do`     |
| 409    | `SUBTASKS_NOT_DONE`        | Marking `Done` with unfinished subtasks      |
| 409    | `PARENT_TASK_DONE`         | Reopening a subtask under a `Done` parent    |
| 409    | `TASK_SKILLS_PENDING`      | Assigning a task whose skills aren't known   |
| 422    | `UNKNOWN_SKILLS`           | `skillIds` contains an unknown skill         |
| 422    | `DEVELOPER_NOT_FOUND`      | `assigneeId` doesn't match a developer       |
| 422    | `DEVELOPER_MISSING_SKILLS` | The developer lacks a required skill         |
| 429    | `RATE_LIMITED`             | Too many requests                            |
| 500    | `INTERNAL_ERROR`           | Unexpected server error                      |

## How to extend

### Add developer or skill management

These are read-only today, by design. Developers, skills and their join tables are already normal rows, and nothing in the code or UI assumes particular skills exist.

1. Add a method to the feature's repository, such as `create` in `features/skills/skill.repository.ts`.
2. Add a service method for any rules, such as rejecting a duplicate name.
3. Add a route and a zod schema, then register the path in `http/openapi.ts`.
4. Run `npm run openapi` and `npm run gen:api`, then add a form under `frontend/src/features/skills`.

New skills reach the LLM and the UI automatically. Fill in a useful `description`, as the LLM relies on it.

If you allow removing a skill from a developer, or changing a task's skills, re-check assigned tasks at that point. Today these rules are only checked at assignment, because those relations can't change.

### Swap the LLM provider

Implement `SkillIdentifier` from [`llm/skillIdentifier.ts`](backend/src/llm/skillIdentifier.ts), reusing `buildUserContent` and `parseAnswer`, then construct it in `src/index.ts`. Nothing else changes.

### Swap the database

Set `DB_MODE=external` and `DATABASE_URL`. No code outside [`db/database.ts`](backend/src/db/database.ts) knows which mode is in use. To copy existing data across, use `pg_dump` and `pg_restore`.

## Key decisions and trade-offs

| Decision | Why | Trade-off |
| -------- | --- | --------- |
| Embedded PostgreSQL by default | One container and no setup, with real PostgreSQL behaviour | The package is only published with beta version tags, and it limits you to one backend instance. Use an external server for production |
| Raw SQL through `pg` | Row locks and recursive queries are central here, and clearer in SQL than through an ORM | More hand-written mapping |
| Create the task first, identify skills later if needed | An LLM outage shouldn't stop people recording work | A "pending" state and a retry job to maintain |
| Block assigning pending tasks | Never bypasses the skill rule | Without a working key, those tasks can't be assigned |
| OpenAPI generated from zod | Docs and validation can't disagree, and tests check real responses against them | The path list in `openapi.ts` is still written by hand |
| Generated types instead of an npm workspace | Shares the API contract while each package stays its own Docker build context | One extra step when the API changes, enforced by CI |
| Filtering on the client | Instant, and simple while all tasks are loaded anyway | Needs server-side filtering and pagination at large scale |
| Native `<select>`, `<dialog>` and checkboxes | Keyboard and screen reader support come built in | Options can't hold rich content, so reasons appear as text |

## Dependencies

### Backend

| Package                | Why                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `express`              | Widely known and minimal. Version 5 forwards rejected async handlers to the error handler   |
| `pg`                   | Connection pooling and direct SQL                                                           |
| `embedded-postgres`    | Real PostgreSQL with no installation: the default database. Pinned exactly, as it's published as beta |
| `zod`                  | Validates requests and environment variables, and generates the OpenAPI schemas             |
| `@google/genai`        | Google's official Gemini SDK                                                                |
| `helmet`               | Secure HTTP headers                                                                         |
| `cors`                 | Standard, environment-driven CORS handling                                                  |
| `express-rate-limit`   | Basic abuse protection, mainly because `POST /tasks` can spend LLM quota                    |
| `swagger-ui-express`   | Serves the interactive API docs                                                             |
| `pino`, `pino-http`    | Structured JSON logs with per-request context                                               |

Development only: `typescript`, `tsx` (runs TypeScript with reload), `vitest` and `supertest` (tests), `eslint` and `typescript-eslint` (linting), `prettier` (formatting), and `@types/*`.

Migrations use a short custom runner, because the app only needs forward-only SQL files.

### Frontend

| Package                 | Why                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `react`, `react-dom`    | Required by the brief                                                                                      |
| `react-router-dom`      | Routing, URL-backed filters, and the navigation blocking behind the discard confirmation                   |
| `@tanstack/react-query` | Server state: caching, refetching, optimistic updates with rollback, and ordered mutations. Hand-rolling these would be more code and more bugs |

Development only: `vite` (dev server and build), `typescript`, `vitest`, `jsdom` and Testing Library (tests), `openapi-typescript` (generates API types), `eslint` with `typescript-eslint` and `eslint-plugin-react-hooks` (linting), `prettier` (formatting), and `@types/*`.

Styling is plain CSS with custom properties, as the UI is too small to justify a component library.

## Assumptions and known limitations

- **Statuses.** The brief lists "To-do, Done, etc.", so I added `In Progress`.
- **Independent subtasks.** A subtask has its own skills and assignee, and doesn't inherit them.
- **Assignment happens on the list page.** The create form has no assignee, because LLM-identified skills aren't known until the task is saved.
- **One top-level task per save.** This follows the wireframe, which has "Add Subtask" but no "Add Task".
- **Skills can't be corrected by hand.** There's no API for editing a task, so a wrong LLM answer stands. A task stuck as pending can't be fixed by hand either.
- **Progress counts direct subtasks,** matching the Done rule.
- **Rate limits can be sidestepped on port 3000.** Compose trusts one proxy hop for nginx, and publishes the backend port for API access. Anyone calling port 3000 directly can spoof `X-Forwarded-For`. In production, don't publish that port.
- **Out of scope.** The brief doesn't call for authentication, editing or deleting tasks, adding subtasks to existing tasks, developer or skill management, or pagination. A production version would need authentication first.
