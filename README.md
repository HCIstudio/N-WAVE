# N-WAVE

Welcome to the Nextflow Workflow Authoring and Visualization Environment (N-WAVE) project!

N-WAVE is a modern, modular platform designed to streamline workflow automation and data processing. It provides an integrated environment for building, executing, and managing complex data workflows, combining a robust backend with an intuitive frontend interface. N-WAVE aims to be suitable for researchers, engineers, and teams looking to accelerate their data-driven projects with efficiency and flexibility.

This repository contains both the backend and frontend codebases for the N-WAVE application.

The following set of instructions allows for setting up the project:
Requirements:
  - Docker Desktop

Setup steps:
  1. Pick a [release](https://github.com/HCIstudio/N-WAVE/releases), each zip folder always contains the respective and latest version of N-Wave.
  2. Download and extract the zip folder.
  3. Ensure that Docker Desktop is running
  4. (Optional) For changing ports or database access, modify the .env.backend file as detailed in [backend/README.md](./backend/README.md).
  5. Open the command prompt and navigate into the extracted folder.
  6a. For starting the downloaded version, run "docker compose up -d"
  6b. For starting the latest version, run "docker compose -f latest.yml up -d"
  The application should now be available under [localhost:5173](http://localhost:5173/) through a browser

Trouble-Shooting:
  - Work-in-progress

- For backend setup, usage, and details, see [backend/README.md](./backend/README.md)
- For frontend setup, usage, and details, see [frontend/README.md](./frontend/README.md)

Please refer to the respective READMEs for installation instructions, development guidelines, and more information about each part of the project.
