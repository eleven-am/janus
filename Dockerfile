FROM oven/bun:1-alpine AS deps

RUN apk add --no-cache python3 make g++ linux-headers

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

RUN mkdir /prod-deps && cp package.json bun.lock /prod-deps/ && cd /prod-deps && bun install --frozen-lockfile --production

FROM oven/bun:1 AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run build

FROM oven/bun:1-alpine AS runtime

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/dist ./dist
COPY --from=deps /prod-deps/node_modules ./node_modules
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data && chown -R app:app /data /app

VOLUME /data

USER app

EXPOSE 3000

ENTRYPOINT ["bun", "dist/server/server.js"]
