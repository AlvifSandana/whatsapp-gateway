FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter dashboard build
RUN pnpm deploy --filter=dashboard --prod /prod/dashboard

FROM node:20-alpine AS dashboard
WORKDIR /app
COPY --from=build /prod/dashboard /app
COPY --from=build /app/apps/dashboard/dist /app/dist

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
