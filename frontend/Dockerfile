FROM node:20-alpine AS build

WORKDIR /app/frontend

RUN apk add --no-cache git
RUN corepack enable

ARG APP_VERSION
ARG BUILD_DATE
ARG GIT_SHA

ENV APP_VERSION=${APP_VERSION}
ENV BUILD_DATE=${BUILD_DATE}
ENV GIT_SHA=${GIT_SHA}

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend .
COPY .git /app/.git
RUN pnpm build

FROM nginx:1.27-alpine AS runtime

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
