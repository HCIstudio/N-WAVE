# Contributing to N-WAVE

Thanks for helping out! This guide covers the local setup, the checks every pull request has
to pass, and how changes reach `main`.

## Development setup

You need **Node 20**, **pnpm 10** (`corepack enable` picks the pinned version), **MongoDB 7**,
and **Docker** if you want to execute workflows.

```bash
# MongoDB
docker run -d --name nwave-mongo -p 27017:27017 mongo:7

# Backend: http://localhost:5001 (hot reload)
cd backend
pnpm install
pnpm dev

# Frontend: http://localhost:5173 (proxies /api to the backend)
cd frontend
pnpm install
pnpm dev
```

To work on the frontend without a backend, build the in-browser demo:
`VITE_DEMO_MODE=true pnpm dev`. The [root README](README.md#running-n-wave) covers the
Docker setups and all configuration variables.

## Checks (the merge gate)

The `Test` workflow (`.github/workflows/test.yml`) runs on every pull request and must pass
before merging. Run the same checks locally in both `frontend/` and `backend/`:

```bash
pnpm lint            # Biome
pnpm test            # Vitest (pnpm test:coverage for a coverage report)
pnpm build           # TypeScript typecheck + build
```

Guidelines:

- **Add tests with your change.** Tests live next to the code as `*.test.ts(x)`. Backend route
  tests use `supertest` against `createApp()` with the Mongoose model mocked, so they need no
  database or Docker.
- **Keep lint green; don't add new rule exceptions.** Several Biome rules are still disabled in
  `frontend/biome.json` while the existing code is cleaned up (tracked in
  [#20](https://github.com/HCIstudio/N-WAVE/issues/20)). Re-enabling one is a welcome PR.
- **No debug logging.** `console.log`/`console.info` fail lint; use `console.warn` or
  `console.error` for messages that should stay.
- **Validate API input.** New or changed request bodies get a zod schema in
  `backend/src/validation/schemas.ts`.

## Branches, pull requests and releases

- `main` is protected: every change lands through a pull request with a green `Test` run.
- Branch from `main` with a short descriptive name (`fix/canvas-crash`, `feat/arm-images`).
- Keep pull requests focused, describe what changed and why, and link the issue
  (`Closes #123`). The pull request template has a short checklist.
- **Don't bump versions.** Every merge to `main` is released automatically by `release.yml`
  (version, Docker images, demo site and GitHub Release). See
  [CI and releases](README.md#ci-and-releases).

## Reporting bugs and requesting features

Use the issue templates. For bugs, include how you run N-WAVE (Docker images, from source, or
the demo), the steps to reproduce, and any errors from the browser console or the backend
logs.

Please report security problems privately to the maintainers instead of opening a public
issue — see [Security](README.md#security) for the current threat model.

## License

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
