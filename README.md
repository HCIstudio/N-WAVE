# N-WAVE

Welcome to the Nextflow Workflow Authoring and Visualization Environment (N-WAVE) project!

N-WAVE is a modern, modular platform designed to streamline workflow automation and data processing. It provides an integrated environment for building, executing, and managing complex data workflows, combining a robust backend with an intuitive frontend interface. N-WAVE aims to be suitable for researchers, engineers, and teams looking to accelerate their data-driven projects with efficiency and flexibility.

This repository contains both the backend and frontend codebases for the N-WAVE application.

- For backend setup, usage, and details, see [backend/README.md](./backend/README.md)
- For frontend setup, usage, and details, see [frontend/README.md](./frontend/README.md)

## Try it online (demo)

A live, no-install build is published to GitHub Pages on every push to `main`:

**https://hcistudio.github.io/N-WAVE/**

The hosted demo runs **entirely in your browser** — there is no backend attached. That means:

- ✅ You can build, edit, duplicate, import and inspect workflows and the generated Nextflow script.
- 💾 Projects are **ephemeral**: they're saved only in your browser's local storage and are not shared with anyone.
- 🚫 Workflows **cannot be executed** in the demo (execution needs Nextflow + Docker on a server).

To actually run workflows, use the Docker deployment below.

> How it works: the demo is built with `VITE_DEMO_MODE=true`, which swaps the HTTP API client for an in-browser store (see [`frontend/src/demo/`](./frontend/src/demo/)). The regular Docker build is unaffected and talks to the real backend as usual.

## Docker Compose Setup

N-WAVE can be started from the project root with Docker Compose:

```bash
docker compose up -d --build
```

This starts:

- `frontend` at `http://localhost:5173`
- `backend` API at `http://localhost:5001`
- `mongodb` at `mongodb://localhost:27017`

### Notes about Nextflow and Docker

- The backend executes workflows via local `nextflow` if available.
- Workflow outputs are persisted to `./results` on the host.

Stop services with:

```bash
docker compose down -v
```

Please refer to the respective READMEs for development installation instructions and more details about each part of the project.

