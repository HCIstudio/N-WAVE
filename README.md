# N-WAVE

**Nextflow Workflow Authoring and Visualization Environment**

N-WAVE is a visual editor for [Nextflow](https://www.nextflow.io/) pipelines. You build a
workflow by dragging nodes onto a canvas — file inputs, operators (filter / map / merge),
processes, and output displays — connect them, and N-WAVE generates a runnable Nextflow
script from the graph. You can then execute the workflow and inspect its results, all from
the browser. It's aimed at researchers and teams who want to compose and run data workflows
without hand-writing Nextflow.

- 🧪 **[Try the live demo](https://hcistudio.github.io/N-WAVE/)** — runs entirely in your browser, no install.
- 🐳 **[Run it with Docker](#2-quick-start-with-published-images-docker)** — the full stack with one command.

---

## Contents

- [What's in the box](#whats-in-the-box)
- [How it works](#how-it-works)
  - [Architecture](#architecture)
  - [How workflow execution works](#how-workflow-execution-works)
- [Running N-WAVE](#running-n-wave)
  - [1. Online demo (browser only)](#1-online-demo-browser-only)
  - [2. Quick start with published images (Docker)](#2-quick-start-with-published-images-docker)
  - [3. From source (Docker Compose)](#3-from-source-docker-compose)
  - [4. Local development](#4-local-development)
- [Configuration](#configuration)
- [Repository layout](#repository-layout)
- [Continuous integration & releases](#continuous-integration--releases)
- [License](#license)

---

## What's in the box

| Piece | Tech | Responsibility |
|-------|------|----------------|
| **Frontend** | React 18, Vite, TypeScript, [React Flow](https://reactflow.dev/), Tailwind | The visual canvas, workflow library, and the client-side Nextflow **script generator**. |
| **Backend** | Node, Express, TypeScript, Mongoose | Workflow **persistence** and workflow **execution** (runs Nextflow). |
| **Database** | MongoDB | Stores saved workflows. |
| **Runner** | `nextflow/nextflow` Docker image | Pulled on demand by the backend to actually run pipelines. |

---

## How it works

### Architecture

```
                     ┌──────────────────────────────────────────────┐
   browser  ───────► │  frontend (nginx)  :5173                      │
                     │   • React Flow canvas + Nextflow generator    │
                     │   • proxies /api ─────────────┐               │
                     └───────────────────────────────┼───────────────┘
                                                     │
                     ┌───────────────────────────────▼───────────────┐
                     │  backend (Express)  :5001                      │
                     │   • /api/workflows  → persistence (MongoDB)    │
                     │   • /api/execute    → runs Nextflow  ──────┐   │
                     └────────────┬───────────────────────────────┼───┘
                                  │                                │
                     ┌────────────▼─────────┐        ┌─────────────▼────────────┐
                     │   MongoDB  :27017     │        │  nextflow/nextflow (run   │
                     │   saved workflows     │        │  on the host's Docker)    │
                     └───────────────────────┘        └───────────────────────────┘
```

- The **frontend** owns the canvas and turns the node graph into a Nextflow script
  (`frontend/src/generators/`). The script is generated in the browser.
- The **backend** persists workflows to MongoDB and executes them. It exposes a small REST
  API under `/api` (`workflows`, `files`, `execute`).
- The **frontend** talks to the backend only through `frontend/src/api.ts`. In the online
  demo that client is swapped for an in-browser store (see
  [`frontend/src/demo/`](frontend/src/demo/)), which is why the demo needs no backend.

### How workflow execution works

The backend does **not** bundle Nextflow. When you run a workflow it launches the official
`nextflow/nextflow` image on the host's Docker daemon and shares files with it via
`--volumes-from`:

```
docker run --rm --platform linux/amd64 --volumes-from nwave-backend \
  nextflow/nextflow:<version> nextflow run <your-workflow>.nf ...
```

This is controlled by the `NEXTFLOW_EXECUTION_MODE` environment variable:

| Value | Behavior |
|-------|----------|
| `docker` | **Always** run Nextflow in a container. The only host requirement is Docker — no local Nextflow/Java. This is what the Docker deployment uses, so it runs on any machine. |
| `local` | Always use a host `nextflow` binary. |
| `auto` (default) | Prefer a local binary, fall back to the container. Convenient for development. |

Because the `nextflow/nextflow` tags are published for `linux/amd64` only, the runner is
pinned to that platform (`NEXTFLOW_PLATFORM`, default `linux/amd64`) so it works natively on
Intel/AMD and under emulation on ARM (e.g. Apple Silicon).

For the backend to launch containers, the host Docker socket is mounted into it
(`/var/run/docker.sock`) and it has a fixed `container_name` so the runner can attach to its
volumes — both are set up in the compose files.

---

## Running N-WAVE

### 1. Online demo (browser only)

Visit **https://hcistudio.github.io/N-WAVE/**. Everything runs client-side:

- ✅ Build, edit, duplicate, import, and inspect workflows and their generated Nextflow.
- 💾 Projects are **ephemeral** — saved only in your browser's local storage.
- 🚫 Workflows **cannot be executed** (that needs a backend). Use Docker for real runs.

### 2. Quick start with published images (Docker)

No clone required — grab the compose file from the [latest release](https://github.com/HCIstudio/N-WAVE/releases)
(`latest.yml`) and start it:

```bash
docker compose -f latest.yml up -d
```

This pulls the prebuilt images and starts the full stack. Then open **http://localhost:5173**.

- Frontend (UI): http://localhost:5173
- Backend (API): http://localhost:5001
- MongoDB: `mongodb://localhost:27017`

Workflow outputs are written to `./results` on the host. Stop with:

```bash
docker compose -f latest.yml down
```

> Requires Docker with the daemon running. The first workflow execution pulls the
> `nextflow/nextflow` image, so it may take a moment.

### 3. From source (Docker Compose)

Clone the repo and build the images locally:

```bash
docker compose up -d --build
```

Same endpoints as above. This is the recommended way to run a full, executable stack while
developing on the Docker packaging.

Stop and remove volumes with:

```bash
docker compose down -v
```

### 4. Local development

Run the frontend and backend dev servers directly for fast iteration. You still need MongoDB
(and Docker, if you want to execute workflows).

**MongoDB** (easiest via Docker):

```bash
docker run -d --name nwave-mongo -p 27017:27017 mongo:7
```

**Backend** (`http://localhost:5001`, hot-reloads via nodemon):

```bash
cd backend
pnpm install
# MONGODB_URI defaults to mongodb://localhost:27017/nwave
pnpm dev
```

**Frontend** (`http://localhost:5173`, Vite dev server, proxies `/api` → `localhost:5001`):

```bash
cd frontend
pnpm install
pnpm dev
```

To build the browser-only demo locally:

```bash
cd frontend
VITE_DEMO_MODE=true pnpm build && pnpm preview
```

---

## Configuration

### Backend environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5001` | API port. |
| `MONGODB_URI` | `mongodb://localhost:27017/nwave` | MongoDB connection string. |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:8080` | Comma-separated allowed origins. |
| `NEXTFLOW_EXECUTION_MODE` | `auto` | `docker` \| `local` \| `auto` (see [execution](#how-workflow-execution-works)). |
| `NEXTFLOW_PLATFORM` | `linux/amd64` | Platform for the Nextflow runner container. |
| `BACKEND_CONTAINER_NAME` | `nwave-backend` | Container name the runner attaches volumes from. |

### Frontend build variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_DEMO_MODE` | `false` | `true` builds the backend-less demo (in-browser storage). |
| `VITE_BASE_PATH` | `/` | Base path for sub-path hosting (e.g. `/N-WAVE/` on GitHub Pages). |
| `VITE_API_BASE_URL` | `/api` | Where the frontend sends API requests. |

See `.env.example` for a starting point for the from-source Docker build.

---

## Repository layout

```
N-WAVE/
├─ backend/                 # Express API + Nextflow execution
│  └─ src/
│     ├─ controllers/       # workflow CRUD, execution
│     ├─ routes/            # /api/workflows, /api/files, /api/execute
│     ├─ models/            # Mongoose models
│     └─ workflows/         # built-in demo, import & materialize logic
├─ frontend/                # React + Vite SPA
│  └─ src/
│     ├─ components/        # canvas, nodes, panels, dialogs
│     ├─ generators/        # graph → Nextflow script
│     ├─ demo/              # in-browser store for the demo build
│     └─ pages/             # HomePage (library), WorkflowPage (editor)
├─ docker-compose.yml       # from-source full stack
├─ latest.yml               # published-image full stack (shipped in releases)
└─ .github/workflows/       # CI, image publish, release, Pages deploy
```

For component-level docs, see [`backend/README.md`](backend/README.md) and
[`frontend/README.md`](frontend/README.md).

## Continuous integration & releases

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `test.yml` | pull request / push to `main` | The merge gate: lint (informational), typecheck, and build for both packages. |
| `release.yml` | push to `main` | Cuts a new version: bumps the patch version, builds and pushes images to Docker Hub (`hcistudio/nwave-*:<version>` + `:latest`), and creates a GitHub Release with `latest.yml`. |
| `pages.yml` | push to `main` | Builds the demo (`VITE_DEMO_MODE=true`) and deploys it to GitHub Pages. |

`main` is protected: changes land only via pull request, and a PR can be merged only once
the **Test** workflow passes. Because `release.yml` runs on every merge to `main`, each merged
PR produces a new versioned release automatically.

## License

The backend is MIT licensed. The frontend is licensed under CC-BY-NC-SA-4.0. See the
`LICENSE` files in each package.
