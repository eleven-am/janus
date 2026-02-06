FROM node:22-alpine AS deps

RUN apk add --no-cache python3 make g++ linux-headers

WORKDIR /app

COPY package.json bun.lock ./

RUN npm install

FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data && chown -R app:app /data /app

VOLUME /data

USER app

EXPOSE 3000

ENTRYPOINT ["node", ".output/server/index.mjs"]
