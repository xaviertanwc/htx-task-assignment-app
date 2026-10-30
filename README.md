# Task Assignment App

A full-stack application for creating tasks with nested subtasks and assigning them to developers with the right skills. When a task is created without skills, the backend identifies them from the title using an LLM.

| Layer    | Technology                                        |
| -------- | ------------------------------------------------- |
| Frontend | TypeScript, React, Vite                           |
| Backend  | TypeScript, Node.js, Express                      |
| Database | PostgreSQL                                        |
| LLM      | Google Gemini API                                 |
| Runtime  | Docker Compose                                    |

## Quick start

Requires Docker with Compose.

```bash
cp .env.example .env
```

Set `GEMINI_API_KEY` in `.env` ([get a key](https://aistudio.google.com/apikey)), then:

```bash
docker compose up --build
```

- App: http://localhost:8080
- API: http://localhost:3000/api

Migrations and seed data are applied automatically when the backend starts. To reset all data, run `docker compose down -v`.

The app runs without a key, but creating a task with no skills selected returns an error. Tasks with skills selected work normally.

### Configuration

Docker Compose reads these from `.env`. All are optional.

| Variable            | Default                 | Purpose                                            |
| ------------------- | ----------------------- | -------------------------------------------------- |
| `GEMINI_API_KEY`    | (none)                  | Needed to identify skills automatically            |
| `GEMINI_MODEL`      | `gemini-3.5-flash-lite` | Gemini model to use                                |
| `POSTGRES_USER`     | `postgres`              | Database user                                      |
| `POSTGRES_PASSWORD` | `postgres`              | Database password; change it outside local use     |
| `POSTGRES_DB`       | `task_assignment`       | Database name                                      |
| `BACKEND_PORT`      | `3000`                  | Host port for the API                              |
| `FRONTEND_PORT`     | `8080`                  | Host port for the web app                          |

The backend also accepts `DATABASE_URL`, `PORT`, `LOG_LEVEL` and `GEMINI_BASE_URL` (for routing Gemini traffic through a proxy) when run outside Compose.

## Local development

Requires Node.js 20.11 or later. You need three terminals.

**1. Database.** Run the bundled embedded Postgres, which needs no installation, or point `DATABASE_URL` in the next step at your own instance:

```bash
cd backend && npm install && npm run db:embedded
```

**2. Backend** on port 3000:

```bash
cd backend && DATABASE_URL=postgres://postgres:postgres@localhost:5432/task_assignment GEMINI_API_KEY=your-key npm run dev
```

**3. Frontend** on http://localhost:5173, proxying `/api` to the backend:

```bash
cd frontend && npm install && npm run dev
```

### Tests and checks

Run these in `backend/` or `frontend/`:

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run typecheck
```

Backend tests run against a real, temporary PostgreSQL that starts automatically. Set `TEST_DATABASE_URL` to use your own instead. The Gemini client is tested against a local HTTP server, so no API key is needed and no external calls are made.

## System design

```mermaid
flowchart LR
  Browser -->|"/"| Nginx["nginx: static SPA"]
  Browser -->|"/api"| Nginx
  Nginx -->|proxy| API["Express API"]
  API --> DB[(PostgreSQL)]
  API -->|"tasks with no skills"| Gemini["Gemini API"]
```

The backend has three layers: routes parse and validate HTTP input, `taskService` holds the business rules, and `taskRepository` holds the SQL.

### Database schema

```mermaid
erDiagram
  developers ||--o{ developer_skills : has
  skills ||--o{ developer_skills : "held by"
  skills ||--o{ task_skills : "required by"
  tasks ||--o{ task_skills : requires
  developers |o--o{ tasks : "assigned to"
  tasks |o--o{ tasks : "parent of"

  developers { int id PK
    text name }
  skills { int id PK
    text name UK }
  tasks { int id PK
    text title
    task_status status
    int assignee_id FK
    int parent_task_id FK
    skills_source skills_source }
```

- **Subtasks** are rows in `tasks` that point to a parent through `parent_task_id`. A subtask therefore has every property of a task, and nesting depth is unlimited at the schema level. Trees are read with a recursive query.
- **Status** is a Postgres enum: `To-do`, `In Progress`, `Done`.
- **`skills_source`** records whether a task's skills came from the user or the LLM, and the UI marks LLM-identified skills with an "AI" tag.
- **Migrations** are plain SQL files in [`backend/migrations`](backend/migrations), applied once each, in order. Seed data is a migration too, so it can't be applied twice.

### Business rules

Both rules are enforced on the backend. The frontend also applies them to its dropdowns so users aren't offered choices that would fail.

**Assignment.** A developer must have every skill the task requires. Carol is the only seeded developer who can take a task that needs both Frontend and Backend.

**Done.** A task can only move to `Done` when all its direct subtasks are `Done`. Because each subtask follows the same rule, this holds for the whole tree.

The reverse case also has to be handled: reopening a subtask under a `Done` parent would break the rule. That request is rejected, and the parent must be reopened first. I chose this over reopening the parent automatically, so a status never changes without someone asking for it.

**Concurrency.** Checking these rules and then writing could race: a parent could move to `Done` at the same moment a subtask is reopened. Each update runs in a transaction that locks the parent row, then the task's own row. Locks are always taken parent first, which also prevents deadlocks. An integration test runs these two updates concurrently to check the rule holds.

### Skill identification

When a task tree is created, all tasks without skills are sent to Gemini in **one request**, which keeps latency down and uses less of the rate limit than one call per subtask.

- **Constrained output.** The request uses a JSON response schema whose skill values are limited to those in the database, so adding a skill to the `skills` table makes it available to the model. The response is validated again on receipt, because the schema is not a guarantee.
- **Untrusted input.** Task titles are sent as JSON data, and the prompt tells the model not to follow instructions in them. Even a successful injection could only produce a choice among valid skills.
- **Reliability.** Each attempt has a 15-second timeout, and there are up to 3 attempts with exponential backoff. Invalid answers are retried too.
- **Provider independence.** Gemini sits behind a small `SkillIdentifier` interface, so changing provider means adding one implementation.

**If identification fails, the request returns 503 and nothing is saved.** The form keeps what the user entered, so they can retry or select skills themselves. The LLM call happens before the database transaction opens, so a slow response doesn't hold a connection.

The trade-off is that task creation with no skills selected depends on Gemini being available. The alternative is to save the task and identify skills in the background, which would keep creation working during an outage. However, it adds a state where a task has no known skills and can't be safely assigned, plus a retry worker to clear that state. I kept the simpler design for this scope, and a background queue would be the natural next step in production.

## API

The base path is `/api`. Bodies are JSON.

| Method  | Path               | Description                                    |
| ------- | ------------------ | ---------------------------------------------- |
| `GET`   | `/tasks`           | List top-level tasks, newest first, with nested subtasks |
| `GET`   | `/tasks/:id`       | Read a task and its subtree                    |
| `POST`  | `/tasks`           | Create a task and any nested subtasks          |
| `PATCH` | `/tasks/:id`       | Change status and/or assignee                  |
| `GET`   | `/developers`      | List developers with skills and assigned tasks |
| `GET`   | `/developers/:id`  | Read a developer                               |
| `GET`   | `/skills`          | List skills                                    |
| `GET`   | `/skills/:id`      | Read a skill                                   |

`GET /health` (outside `/api`) checks database connectivity.

### Create a task

`POST /api/tasks`. `skillIds` and `subtasks` are optional. Tasks with no `skillIds` have their skills identified by the LLM.

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

A request can hold up to 100 tasks, nested up to 10 levels deep. New tasks start as `To-do` and unassigned.

The response is `201` with the created task:

```json
{
  "id": 1,
  "title": "As a logged-in user, I want to update my profile",
  "status": "To-do",
  "parentTaskId": null,
  "assignee": null,
  "skills": [{ "id": 1, "name": "Frontend" }, { "id": 2, "name": "Backend" }],
  "skillsSource": "user",
  "createdAt": "2026-10-30T15:00:00.000Z",
  "updatedAt": "2026-10-30T15:00:00.000Z",
  "subtasks": []
}
```

(`subtasks` is shortened here. Each entry has the same shape.)

### Update a task

`PATCH /api/tasks/:id`. Provide either field or both; the update is all-or-nothing. Set `assigneeId` to `null` to unassign.

```json
{ "status": "Done", "assigneeId": 3 }
```

### Errors

Errors share one format, and `details` is included where useful:

```json
{ "error": { "code": "SUBTASKS_NOT_DONE", "message": "...", "details": {} } }
```

| Status | Code                          | Meaning                                       |
| ------ | ----------------------------- | --------------------------------------------- |
| 400    | `VALIDATION_ERROR`            | The body failed validation                    |
| 400    | `INVALID_ID`                  | The id in the path isn't a valid integer      |
| 400    | `TASK_TREE_TOO_LARGE`         | Over the task count or nesting limit          |
| 400    | `BAD_REQUEST`                 | The body is malformed or too large            |
| 404    | `TASK_NOT_FOUND`, `DEVELOPER_NOT_FOUND`, `SKILL_NOT_FOUND` | The resource in the path doesn't exist |
| 404    | `ROUTE_NOT_FOUND`             | No such route                                 |
| 409    | `SUBTASKS_NOT_DONE`           | Marking `Done` with unfinished subtasks       |
| 409    | `PARENT_TASK_DONE`            | Reopening a subtask under a `Done` parent     |
| 422    | `UNKNOWN_SKILLS`              | `skillIds` contains an unknown skill          |
| 422    | `DEVELOPER_NOT_FOUND`         | `assigneeId` doesn't match a developer        |
| 422    | `DEVELOPER_MISSING_SKILLS`    | The developer lacks a required skill          |
| 503    | `SKILL_IDENTIFICATION_FAILED` | The LLM failed; nothing was saved             |

## Libraries

### Backend

| Library            | Why                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------- |
| `express`          | Widely known and minimal. Version 5 forwards rejected async handlers to the error handler. |
| `pg`               | Direct SQL. Row locks and recursive queries are central here, and are clearer in SQL than through an ORM. |
| `zod`              | Validates requests and environment variables, with TypeScript types derived from the schemas. |
| `@google/genai`    | Google's official Gemini SDK.                                                           |
| `helmet`           | Sets secure HTTP headers with one line.                                                 |
| `pino`, `pino-http`| Structured JSON logs with per-request context.                                          |

Development only: `typescript`, `tsx` (run TypeScript in watch mode), `vitest` and `supertest` (tests), `embedded-postgres` (real Postgres for tests without Docker), `eslint` and `typescript-eslint` (linting).

Migrations use a short custom runner, as the app only needs forward-only SQL files.

### Frontend

| Library                 | Why                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `react`, `react-dom`    | Required by the brief.                                                                    |
| `vite`                  | Fast development server and production build. An SPA doesn't need a server-rendering framework. |
| `react-router-dom`      | Client-side routing between the two pages.                                                |
| `@tanstack/react-query` | Handles server state: caching, loading and error states, and refetching after updates.    |

Development only: `vitest`, `jsdom` and Testing Library (tests), `eslint` with `typescript-eslint` and `eslint-plugin-react-hooks` (linting). Styling is plain CSS with custom properties, as the UI is too small to justify a component library.

## Assumptions and limitations

- **Statuses.** The brief lists "To-do, Done, etc.", so I added `In Progress`.
- **Required skills.** A developer must have *all* of a task's skills, not just one.
- **Independent subtasks.** A subtask has its own skills and assignee, and doesn't inherit them from its parent.
- **Assignment happens on the list page.** The create form doesn't offer an assignee, as the brief doesn't require one and LLM-identified skills aren't known until the task is saved.
- **One top-level task per save.** This follows the wireframe, which has "Add Subtask" but no "Add Task".
- **Every task needs at least one skill.** The LLM must choose one, so no task can be assigned without a skill check.
- **Out of scope.** The brief doesn't call for authentication, editing or deleting tasks, adding subtasks to existing tasks, or pagination. A production version would need authentication and rate limiting, especially on `POST /tasks` because it triggers paid or quota-limited LLM calls.
