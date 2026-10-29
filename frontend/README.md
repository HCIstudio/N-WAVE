# N-WAVE Frontend

React + Vite + TypeScript app: the workflow canvas and the Nextflow script generator. It talks
to the [backend](../backend/README.md) through `src/api.ts`; the browser demo build
(`VITE_DEMO_MODE=true`) swaps that client for in-browser storage (`src/demo/`). How the app is
used is in the [wiki](https://github.com/HCIstudio/N-WAVE/wiki).

## Development

```bash
pnpm install
pnpm dev           # http://localhost:5173, proxies /api to the backend on :5001
pnpm build         # typecheck + production build
pnpm test          # unit tests (pnpm test:coverage for coverage)
pnpm lint          # Biome
pnpm test:e2e      # Playwright against the demo build (once: pnpm exec playwright install chromium)
pnpm nfcore:catalog  # regenerate the nf-core catalog (see ../scripts/README.md)
```

[CONTRIBUTING.md](../CONTRIBUTING.md) lists the checks a pull request must pass.

## Structure

| Folder | What's in it |
| --- | --- |
| `src/pages/` | The home page, Help, Global Settings, the Roadmap and the workflow editor (`WorkflowPage.tsx`, with its hooks in `pages/workflow/`) |
| `src/components/` | Canvas, nodes, node panels ([panels](src/components/panels/README.md)), shared UI ([common](src/components/common/README.md)), tutorial |
| `src/registry/` | Node definitions: ports, settings and the code each node generates; nf-core, custom nodes, node packs, pipelines |
| `src/generators/` | Graph → Nextflow script ([generators](src/generators/README.md)) |
| `src/execution/` | What runs show: task mapping, failure explanations, run profiles |
| `src/export/` | Download and Export Project |
| `src/roadmap/` | The Roadmap page's releases and features, updated with every minor release |
| `src/glossary/`, `src/templates/`, `src/workflows/` | Glossary terms, New Workflow templates, workflow helpers (node kinds, import, default settings) |
| `src/settings/`, `src/notifications/` | Global Settings shared by every page (run defaults, feature switches) and browser notifications |
| `src/hooks/` | Shared hooks ([hooks](src/hooks/README.md)) |
| `src/demo/` | The browser demo's in-browser backend |
| `src/api.ts`, `src/api/` | The backend client |
| `src/test/` | Test helpers, stored examples and real Nextflow logs |
| `e2e/`, `scripts/lint/` | Playwright tests; the projects `nextflow lint` checks in CI |

## License

Apache License 2.0. See [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE).
