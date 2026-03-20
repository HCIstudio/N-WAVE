FROM node:20-alpine AS build

WORKDIR /app

# Required so backend can call docker CLI for Nextflow/process execution fallback
RUN apk add --no-cache docker-cli

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:20-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache docker-cli
RUN corepack enable

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./package.json

EXPOSE 5001

CMD ["node", "dist/server.js"]
