# Contributing to N-WAVE

Thanks for helping out! This guide covers the local setup, the checks every pull request has
to pass, and how changes reach `main`.

## Development setup

You need **Node 20.19 or newer** (mongoose 9 requires it), **pnpm 10** (`corepack enable` picks the pinned version), **MongoDB 7**,
and **Docker** if you want to execute workflows.

With nvm, `nvm use` in the repository picks Node 20 (from `.nvmrc`). `pnpm install` warns
("Unsupported engine") on an older Node; with one, tools fail with confusing errors such as
`Cannot find module '@biomejs/cli-linux-x64/biome'`.

```bash
# MongoDB
docker run -d --name nwave-mongo -p 127.0.0.1:27017:27017 mongo:7

# Backend: http://localhost:5001 (hot reload)
cd backend
pnpm install
pnpm dev

# Frontend: http://localhost:5173 (proxies /api to the backend)
cd frontend
pnpm install
pnpm dev
```

To work on the frontend without a backend, run it as the browser demo:
`VITE_DEMO_MODE=true pnpm dev`. The [root README](README.md#running-n-wave) covers the
Docker setups and all [configuration variables](README.md#configuration); the
[wiki](https://github.com/HCIstudio/N-WAVE/wiki) describes the app for users. Package notes:
[backend](backend/README.md), [frontend](frontend/README.md), [scripts](scripts/README.md).

## Checks (the merge gate)

The `Test` workflow (`.github/workflows/test.yml`) runs on every pull request and must pass
before merging. Run the same checks locally in both `frontend/` and `backend/`:

```bash
pnpm lint            # Biome
pnpm test            # Vitest (pnpm test:coverage for a coverage report)
pnpm build           # TypeScript typecheck + build
```

CI runs `pnpm test:coverage`. In `frontend/` it fails when line coverage drops below the
thresholds in `vitest.config.ts`: a floor for all code, and 80% for script generation
(`src/generators/`) and the `.nf` importer. New code needs tests to keep the floor.

The scripts have their own tests, including one that checks the links in the README and the
wiki pages (run from the repository root):

```bash
node --test scripts/*.test.mjs
```

The Nextflow N-WAVE generates is checked with `nextflow lint`. The built-in examples and a set
of node combinations are exported as projects, with the script and config a run of each uses,
and linted with a pinned Nextflow (needs Docker, or `nextflow` on PATH, after `pnpm install`
in both packages):

```bash
scripts/lint-generated-nextflow.sh
```

When you change the generator or add a node type, add a combination that uses it to
`frontend/scripts/lint/fixtures.ts`.

End-to-end tests (Playwright) cover the canvas flow against the backend-less demo build.
They run as a separate, non-blocking CI job; locally:

```bash
cd frontend
pnpm exec playwright install chromium   # once
pnpm test:e2e
```

Guidelines:

- **Add tests with your change.** Tests live next to the code as `*.test.ts(x)`. Backend route
  tests use `supertest` against `createApp()` with the Mongoose model mocked, so they need no
  database or Docker.
- **Keep lint green; don't disable rules.** Both packages run Biome's recommended rules
  in full, with one exception: the frontend turns off `noTemplateCurlyInString`, since
  the Nextflow code it generates and tests is full of Groovy `${...}` in plain strings.
  A `biome-ignore` comment needs a stated reason: for hooks, use it only for
  deliberate re-run triggers, and prefer `useLatestRef` for callbacks an effect should call
  without re-running. Avoid `any`; the only allowed one is the `NodeData` index signature.
- **No debug logging.** `console.log`/`console.info` fail lint; use `console.warn` or
  `console.error` for messages that should stay.
- **Validate API input.** New or changed request bodies get a zod schema in
  `backend/src/validation/schemas.ts`.
- **Update the docs with the change.** User-facing behaviour is described in the wiki: edit its
  page in [`wiki/`](wiki/README.md) in the same pull request (the Wiki workflow publishes it
  after the merge). Configuration belongs in the [README](README.md#configuration), development notes in
  the package READMEs. Keep pages brief, and link instead of repeating.

## Branches, pull requests and releases

- `main` is protected: every change lands through a pull request with a green `Test` run.
- Branch from `main` with a short descriptive name (`fix/canvas-crash`, `feat/arm-images`).
- Keep pull requests focused, describe what changed and why, and link the issue
  (`Closes #123`). The pull request template has a short checklist.
- **Don't bump patch versions.** Every merge to `main` is released automatically (see
  [Releases](#releases)).

## Releases

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `test.yml` | pull request, push to `main` | The merge gate: lint, unit tests with coverage, typecheck and build for both packages, the script tests, Nextflow lint of the generated scripts, and Playwright end-to-end tests (not blocking yet). |
| `wiki.yml` | push to `main` that changes `wiki/` | Publishes the `wiki/` pages to the GitHub wiki (`scripts/publish-wiki.sh`). |
| `release.yml` | push to `main` | Steps the version, deploys the demo to GitHub Pages, pushes multi-arch images (`linux/amd64`, `linux/arm64`) to Docker Hub as `hcistudio/nwave-*:<version>` and `:latest`, commits the version to both `package.json` files, and creates a GitHub Release (`v<version>`) with `latest.yml`. |

Patch versions are automatic: each merge steps the patch version from the latest `v*` tag. To
release a new minor or major version (for example when closing a milestone), set `"version"`
in both `frontend/package.json` and `backend/package.json` to it (e.g. `1.4.0`) in the pull
request. When it is newer than the latest tag, the merge releases exactly that version, and
later merges continue from it. The two files must match, or the release fails.

A minor or major release also updates the Roadmap page (`/roadmap`) in
`frontend/src/roadmap/roadmap.ts`: mark the release `released`, set `ROADMAP_UPDATED_FOR` to it,
move the next release to `in-progress`, and add or change planned releases to match the
milestones. The unit tests fail until `ROADMAP_UPDATED_FOR` matches the version in
`package.json`. The **Roadmap links** CI step checks the issue and milestone numbers against
GitHub. The roadmap never shows dates.

**One-time setup, `RELEASE_TOKEN`:** the version commit is pushed back to the protected `main`,
so CI pushes as an actor that bypasses the ruleset. Create a fine-grained personal access token
owned by a repository admin, for this repository with *Contents: Read and write*, and add it
as the Actions secret `RELEASE_TOKEN`. (The GitHub Actions app can't be added to a ruleset's
bypass list.) `release.yml` ignores its own `chore(release):` commits, so the push doesn't
start a release loop.

## Reporting bugs and requesting features

Use the issue templates. For bugs, include how you run N-WAVE (Docker images, from source, or
the demo), the steps to reproduce, and any errors from the browser console or the backend
logs.

Please report security problems privately to the maintainers instead of opening a public
issue — see [Security](README.md#security) for the current threat model.

## License

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
