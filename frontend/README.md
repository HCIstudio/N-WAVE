# N-WAVE Frontend

React + Vite + TypeScript single-page app: the node-based workflow editor and the
client-side Nextflow script generator. It talks to the backend through a small REST API; in
the browser-only demo build that client is swapped for in-browser storage.

## Development

```bash
pnpm install
pnpm dev      # http://localhost:5173, proxies /api to the backend on :5001
pnpm build    # typecheck + production build
pnpm test     # unit tests (pnpm test:coverage for coverage)
pnpm lint     # Biome
pnpm test:e2e # Playwright E2E against the demo build (run `pnpm exec playwright install chromium` once)
```

For the full stack (frontend + backend + MongoDB) and the architecture, see the
[root README](../README.md). For usage guides, see the
[Wiki](https://github.com/HCIstudio/N-WAVE/wiki).

## Structure

- `src/components/` — canvas, nodes, panels, dialogs
- `src/generators/` — graph → Nextflow script
- `src/hooks/` — workflow logic and UI state
- `src/registry/`, `src/data/` — node and process definitions
- `src/demo/` — in-browser store for the demo build
- `src/pages/` — HomePage (library) and WorkflowPage (editor)
- `src/api.ts`, `src/api/` — backend client
- `e2e/` — Playwright end-to-end tests (canvas flow)

## License

Apache License 2.0. See [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE) at the repository root.
