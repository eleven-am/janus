FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

RUN mkdir /prod-deps && cp package.json bun.lock /prod-deps/ && cd /prod-deps && bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run build

FROM oven/bun:1-alpine AS runtime

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/.output ./.output
COPY --from=deps /prod-deps/node_modules ./node_modules
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data && chown -R app:app /data /app

VOLUME /data

USER app

EXPOSE 3000

ENTRYPOINT ["bun", ".output/server/index.mjs"]
