FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter api build
RUN pnpm deploy --filter=api --prod /prod/api

FROM node:20-alpine AS api
WORKDIR /app
COPY --from=build /prod/api /app
EXPOSE 3000
CMD [ "node", "dist/index.js" ]
