FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter worker build
RUN pnpm deploy --filter=worker --prod /prod/worker

FROM node:20-alpine AS worker
WORKDIR /app
COPY --from=build /prod/worker /app
CMD [ "node", "dist/index.js" ]
