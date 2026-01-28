FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter wa-runtime build
RUN pnpm deploy --filter=wa-runtime --prod /prod/wa-runtime

FROM node:20-alpine AS wa-runtime
WORKDIR /app
COPY --from=build /prod/wa-runtime /app
CMD [ "node", "dist/index.js" ]
