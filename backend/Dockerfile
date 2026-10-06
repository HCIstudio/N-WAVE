# The build stage runs on the build machine's native platform: it only
# compiles TypeScript, so its output is architecture-independent. The runtime
# stage installs production dependencies for the target platform, which keeps
# multi-arch builds (linux/amd64 + linux/arm64) fast and correct.
FROM --platform=$BUILDPLATFORM node:20-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:20-alpine AS runtime

WORKDIR /app

# The backend calls the docker CLI to launch the Nextflow runner container.
RUN apk add --no-cache docker-cli
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/workflows/library/assets ./dist/workflows/library/assets

EXPOSE 5001

CMD ["node", "dist/server.js"]
