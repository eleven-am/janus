FROM oven/bun:1-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install

FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

FROM oven/bun:1-alpine AS runtime

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data && chown -R app:app /data /app

VOLUME /data

USER app

EXPOSE 3000

ENTRYPOINT ["bun", "server.ts"]
