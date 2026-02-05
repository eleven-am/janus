# Janus

AI-powered calendar assistant with voice support. Manages Google Calendar and Outlook calendars through a web UI, REST API, or voice via the [Hu](https://github.com/eleven-am) voice platform.

## What it does

- Connects to Google Calendar and Microsoft Outlook via OAuth2
- Natural language calendar management powered by Claude (Anthropic) or local Ollama models
- Voice interaction through the Hu voice platform (WebSocket-based)
- Web UI for authentication and managing linked accounts
- REST API for programmatic calendar access

## Tech stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Framework | TanStack Start (Vite + React 19) |
| Auth | better-auth (Google, Microsoft, Hu OAuth2) |
| Database | SQLite via Drizzle ORM |
| AI | Vercel AI SDK + Anthropic Claude / Ollama |
| Voice | @eleven-am/hu-sdk |
| Styling | Tailwind CSS 4 |

## Setup

```bash
git clone git@github.com:eleven-am/janus.git
cd janus
bun install
```

Copy `.env.example` or create `.env` with the following:

```
PORT=3000
APP_URL=http://localhost:3000
DATABASE_PATH=janus.db

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

BETTER_AUTH_SECRET=          # min 32 characters

ANTHROPIC_API_KEY=           # optional, falls back to Ollama
OLLAMA_URL=http://localhost:11434

HU_URL=https://voice.maix.ovh
HU_AGENT_ID=
HU_PRIVATE_KEY_PATH=./private.pem
```

Google OAuth is required. Microsoft and Hu are optional.

## Running

```bash
bun run dev       # development
bun run build     # production build
bun run start     # run production build
```

## Database

Migrations live in `drizzle/` and are managed with Drizzle Kit:

```bash
bun run db:generate   # generate migration from schema changes
bun run db:migrate    # apply migrations
```

## Docker

3-stage multi-stage build on `oven/bun:1-alpine`. Builds for `linux/amd64` and `linux/arm64`.

```bash
make build    # build and push to registry
```

Or manually:

```bash
docker build -t janus .
docker run -p 3000:3000 --env-file .env -v $(pwd)/data:/data janus
```

The container runs as a non-root user. SQLite database and keys are expected at `/data`.

## API

```
GET    /api/v1/calendars
GET    /api/v1/calendars/:calendarId
GET    /api/v1/calendars/:calendarId/events
POST   /api/v1/calendars/:calendarId/events
GET    /api/v1/calendars/:calendarId/events/:eventId
PATCH  /api/v1/calendars/:calendarId/events/:eventId
DELETE /api/v1/calendars/:calendarId/events/:eventId
POST   /api/v1/link/init
GET    /health
```

All calendar endpoints require authentication.

## Project structure

```
src/
├── agent/       # AI chat + Hu voice agent
├── auth/        # better-auth configuration
├── config/      # Environment config (Zod validated)
├── db/          # Drizzle schema + client
├── lib/         # Middleware, validation, logging
├── providers/   # Calendar provider abstraction (Google, Outlook)
├── routes/      # TanStack file-based routes + API endpoints
├── server.ts    # Server entry point
└── router.tsx   # Router config
```

## License

ISC
