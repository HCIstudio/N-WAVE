# N-WAVE Backend

Express + TypeScript API for N-WAVE. It stores workflows in MongoDB, installs nf-core
components, runs Nextflow (a host binary or the `nextflow/nextflow` image, see the
[execution model](../README.md#how-workflow-execution-works)) and serves run logs and results.
Input files live on the workflow's nodes in the browser and travel with each run request.

## Development

Needs Node 20.19+, pnpm and MongoDB 7 ([CONTRIBUTING.md](../CONTRIBUTING.md) has the setup).

```bash
pnpm install
pnpm dev      # http://localhost:5001, hot reload (tsx watch)
pnpm build    # compile TypeScript
pnpm start    # run the compiled server
pnpm lint     # Biome
pnpm test     # Vitest (pnpm test:coverage for coverage)
```

Tests live next to the code as `*.test.ts`. Route tests use `supertest` against `createApp()`
(`src/app.ts`) with the Mongoose model mocked, so they need no database, Docker or Nextflow.
Environment variables are listed in the [root README](../README.md#configuration).

## API

All routes are under `/api`. Request bodies are validated with [zod](https://zod.dev) schemas
in `src/validation/schemas.ts`; invalid requests get `400` with `{ message, error, details }`.

| Route | Purpose |
| --- | --- |
| `GET/POST /workflows`, `GET/PUT/DELETE /workflows/:id`, `POST /workflows/:id/duplicate` | Saved and built-in workflows. |
| `POST /execute/execute` | Start a run; streams its output (first line `N-WAVE run: <id>`). Takes `resume` and a `runProfile`. |
| `POST /execute/cancel` | Cancel a run (`{ executionId }`). |
| `GET /execute/docker-status`, `/execute/nextflow-status`, `/execute/limits` | What this server can run, and its resource limits. |
| `GET /execute/runs?workflowId=` | Run history, newest first. |
| `GET /execute/runs/:id/log`, `/files`, `/results/<path>` | A run's log, result file list and result files. |
| `GET /execute/runs/:id/tasks`, `/tasks/:hash/files`, `/tasks/:hash/output/<path>` | A run's tasks (from Nextflow's log) and the files each produced. |
| `GET/DELETE /execute/cache?workflowId=` | Size of a workflow's run cache, and clearing it. |
| `GET /nfcore/catalog`, `/nfcore/installed`; `POST /nfcore/install`, `/nfcore/uninstall` | The nf-core catalog and installed components. |
| `GET /nfcore/modules/source?id=`, `/nfcore/modules/files?id=` | A component's `main.nf`, or all its files (installed copy, else GitHub at the catalog commit). |
| `GET/POST /custom-nodes`, `DELETE /custom-nodes/:id` | Custom nodes and node packs. |
| `GET /pipelines/schema` | An nf-core pipeline's parameter schema. |

## Structure

- `src/controllers/`: request handlers
- `src/execution/`: setting up and starting runs (run folder, Nextflow command, resources,
  run profiles, the runner)
- `src/runs/`: run history, task events and run caches
- `src/nfcore/`, `src/pipelines/`: installing nf-core components; pipeline schemas and versions
- `src/workflows/`: built-in demos, import and materializing
- `src/validation/`, `src/models/`, `src/routes/`, `src/config/`, `src/utils/`
- `src/app.ts`: the Express app (used by the server and the tests); `src/server.ts`: entry point

## License

Apache License 2.0. See [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE).
