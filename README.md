# AgentDocs

AI-powered documentation that stays in sync with your GitHub repos.

## Stack

| Layer | Tech |
|---|---|
| API | Node.js 20 + TypeScript + Express |
| Dashboard | Next.js 14 App Router + Tailwind CSS |
| Database | PostgreSQL 15 + Drizzle ORM |
| Queue | BullMQ + Redis |
| AI | Anthropic Claude (claude-sonnet-4-6) |
| Auth | NextAuth.js (GitHub OAuth) |
| Hosting | Railway |

## Local Dev Setup

### Prerequisites
- Node.js 20+
- Docker Desktop
- [ngrok](https://ngrok.com) (for GitHub webhook tunneling)

### Getting Started

```bash
git clone https://github.com/alpalally/rtc
cd rtc

npm install

cp .env.example .env
# Fill in: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET,
#          ANTHROPIC_API_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, NEXTAUTH_SECRET

docker compose up -d          # starts Postgres + Redis

cd apps/api
npm run db:generate            # generate migrations
npm run db:migrate             # run migrations

ngrok http 3001                # expose local API for GitHub webhooks

cd ../..
npm run dev                    # starts api (port 3001) and web (port 3000)
```

## Project Structure

```
rtc/
├── apps/
│   ├── api/                   # Express backend
│   │   └── src/
│   │       ├── routes/        # HTTP handlers (webhooks, repos, auth, events)
│   │       ├── workers/       # BullMQ job processors (docSync)
│   │       ├── services/      # github.ts, claude.ts (future)
│   │       ├── db/            # Drizzle schema + migrations
│   │       └── lib/           # config, queue, utils
│   └── web/                   # Next.js dashboard
│       └── app/               # App Router pages
├── docker-compose.yml
├── .env.example
└── turbo.json
```

## Webhook Flow

```
GitHub push event
  → POST /webhooks/github
  → Verify HMAC-SHA256 signature
  → Enqueue job: { repoId, commitSha, changedFiles }
  → 200 OK immediately

BullMQ Worker (docSync):
  → Fetch changed files via Octokit
  → Filter to supported extensions
  → For each file: call Claude API → generate doc
  → Upsert doc record in Postgres
  → Mark sync_event done
```
