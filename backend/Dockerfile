# The build and deps stages run on the build machine's native platform: they
# compile TypeScript and install production dependencies, which are plain
# JavaScript (no native modules or install scripts), so their output works on
# every architecture. The runtime stage only copies it in. This keeps Node off
# QEMU in multi-arch builds (linux/amd64 + linux/arm64): pnpm install under
# arm64 emulation can crash with "Illegal instruction" and hang the build.
# If a dependency with native code is ever added, install it in the runtime
# stage instead.
FROM --platform=$BUILDPLATFORM node:20-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM --platform=$BUILDPLATFORM node:20-alpine AS deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:20-alpine AS runtime

WORKDIR /app

# The backend calls the docker CLI to launch the Nextflow runner container.
RUN apk add --no-cache docker-cli

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/workflows/library/assets ./dist/workflows/library/assets

EXPOSE 5001

CMD ["node", "dist/server.js"]
