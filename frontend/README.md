# N-WAVE Frontend

This is the frontend for **N-WAVE: Nextflow Workflow Authoring and Visualization Environment**. It provides an intuitive, node-based web interface for building, visualizing, and running Nextflow workflows.

## Overview

- **Node-based Workflow Editor**: Drag-and-drop interface for constructing scientific workflows visually
- **Reusable UI Components**: Modular React components for nodes, panels, dialogs, and more
- **Real-time Execution Feedback**: Integrated with the backend for workflow execution and status updates
- **TypeScript + React + Vite**: Modern, fast, and scalable frontend stack

## Project Structure

- `src/components/` — UI components (nodes, panels, dialogs, etc.)
- `src/hooks/` — Custom React hooks for workflow logic and UI state
- `src/generators/` — Nextflow script generation from visual workflows
- `src/data/` — Node/process definitions and type declarations
- `src/context/` — React context for global state
- `src/pages/` — Main application pages
- `src/api.ts` — API integration with the backend

> **Note:** The structure is modular and can be extended as the project grows. Add new folder as needed to keep code organized and maintainable.

> For detailed documentation on components, hooks, and generators, see the README files in their respective subdirectories.

## Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```
2. **Start the development server**
   ```bash
   pnpm dev
   ```
3. **Build for production**
   ```bash
   pnpm build
   ```

## Feature Requests & Contribution

- All feature requests, contribution guidelines, and roadmap are managed in the [backend README](../backend/README.md). Please refer to it for project direction and how to get involved.

## License

- This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0). See the [LICENSE](LICENSE) file or the backend for details.

---

**N-WAVE** — Making Nextflow workflows accessible to everyone.
