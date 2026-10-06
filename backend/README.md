# N-WAVE Backend

Express + TypeScript API for N-WAVE. It persists workflows to MongoDB and executes them by
launching the official `nextflow/nextflow` Docker image. It stores workflow and file
metadata only — file contents live in the browser.

## Development

Requires Node 20, pnpm, and a running MongoDB (v7).

```bash
pnpm install
pnpm dev      # http://localhost:5001, hot-reload via nodemon
pnpm build    # compile TypeScript
pnpm start    # run the compiled server
pnpm lint     # Biome
pnpm test     # Vitest (pnpm test:coverage for a coverage report)
```

Tests live next to the code as `*.test.ts`. Route tests use `supertest` against
`createApp()` (`src/app.ts`) with the Mongoose model mocked, so they need no database,
Docker, or Nextflow.

`MONGODB_URI` defaults to `mongodb://localhost:27017/nwave`. See the
[root README](../README.md#configuration) for all environment variables and the
[execution model](../README.md#how-workflow-execution-works). To run the full stack in
Docker, use `docker compose up -d --build` from the repository root.

## API

All routes are under `/api`:

- `workflows` — `GET`/`POST` `/workflows`, `GET`/`PUT`/`DELETE` `/workflows/:id`
- `files` (metadata only) — `GET` `/files`, `POST` `/files/upload`, `GET`/`DELETE` `/files/:id`
- `execute` — `POST` `/execute/execute`, `POST` `/execute/cancel`, `GET` `/execute/docker-status`, `GET` `/execute/nextflow-status`
- `nfcore`, `custom-nodes` — node catalog and custom node definitions

Request bodies are validated with [zod](https://zod.dev) schemas in
`src/validation/schemas.ts`. Invalid requests get a `400` with
`{ message, error, details }`, where `details` lists every problem as `path: message`.

## Structure

- `src/config/` — database and server configuration
- `src/controllers/` — request handlers
- `src/execution/` — pure Nextflow script normalization and command building (unit tested)
- `src/validation/` — request body schemas
- `src/models/` — Mongoose schemas
- `src/routes/` — API route definitions
- `src/workflows/` — built-in demo, import, and materialize logic
- `src/app.ts` — Express app factory (used by the server and the tests)
- `src/server.ts` — entry point

## License

Apache License 2.0. See [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE) at the repository root.
