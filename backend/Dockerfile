#backend
FROM node:20-slim
WORKDIR /backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl openjdk-17-jre-headless ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN curl -s https://get.nextflow.io | bash \
 && mv nextflow /usr/local/bin/nextflow

RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
 && rm -rf /var/lib/apt/lists/*


ENV NXF_HOME=/backend/.nextflow

RUN corepack enable

COPY package*.json ./
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5001
CMD ["pnpm", "dev", "--", "--host", "0.0.0.0"]