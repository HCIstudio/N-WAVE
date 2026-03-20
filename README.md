# N-WAVE

Welcome to the Nextflow Workflow Authoring and Visualization Environment (N-WAVE) project!

N-WAVE is a modern, modular platform designed to streamline workflow automation and data processing. It provides an integrated environment for building, executing, and managing complex data workflows, combining a robust backend with an intuitive frontend interface. N-WAVE aims to be suitable for researchers, engineers, and teams looking to accelerate their data-driven projects with efficiency and flexibility.

This repository contains both the backend and frontend codebases for the N-WAVE application.

- For backend setup, usage, and details, see [backend/README.md](./backend/README.md)
- For frontend setup, usage, and details, see [frontend/README.md](./frontend/README.md)

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
- If local `nextflow` is not available, it falls back to `docker run nextflow/nextflow:<version>`.
- To enable that fallback inside the backend container, `docker-compose.yml` mounts `/var/run/docker.sock` and the backend image includes Docker CLI.
- Workflow outputs are persisted to `./backend/results` on the host.

Stop services with:

```bash
docker compose down
```

Please refer to the respective READMEs for development installation instructions and more details about each part of the project.

