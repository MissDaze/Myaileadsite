# LeadForge AI

A SaaS platform that automates local business lead generation and website deployment.

## Overview

LeadForge AI scrapes local businesses without websites, sends personalised cold SMS outreach, uses AI to classify intent, automatically builds and deploys a full website for interested businesses, then sends a follow-up with the live URL.

## Architecture

```
monorepo/
  backend/   # Node.js 20 · TypeScript · Express · PostgreSQL · Prisma · BullMQ · Redis
  frontend/  # React 19 · TypeScript · Tailwind · shadcn/ui · Zustand · TanStack Table · Recharts
  docker-compose.yml
```

## Pipeline

1. **Scrape** — Outscraper API finds businesses with no website, stored as Lead records (deduplicated by phone).
2. **Review** — Admin filters/excludes leads in TanStack Table, selects a batch.
3. **Cold SMS** — TextMagic sends a personalised SMS per lead with opt-out included.
4. **Intent** — TextMagic webhook receives replies. Keywords classified first (yes/interested = POSITIVE, stop/no = NEGATIVE), Claude fallback for ambiguous.
5. **AI Build** — POSITIVE intent queues a BullMQ job. Worker sends all lead fields to Claude claude-opus-4-5 to generate a complete FastAPI + React 19 website.
6. **Deploy** — Files pushed to GitHub via Contents API. Railway project provisioned via GraphQL. Polled until live. `site_url` written to Lead.
7. **Follow-up** — SMS with live URL. Second POSITIVE → pricing SMS + human flag. Second NEGATIVE → CLOSED_LOST.

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL and Redis)

## Quick Start

### 1. Start Infrastructure

```bash
docker-compose up -d
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your API keys
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and log in with the admin credentials from your `.env`.

### 4. Start BullMQ Worker (separate terminal)

```bash
cd backend
npm run worker
```

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `ADMIN_USERNAME` | Admin login username |
| `ADMIN_PASSWORD` | Admin login password |
| `OUTSCRAPER_API_KEY` | [Outscraper](https://outscraper.com/) API key |
| `TEXTMAGIC_USERNAME` | TextMagic account username |
| `TEXTMAGIC_API_KEY` | TextMagic API key |
| `OPENROUTER_API_KEY` | [OpenRouter](https://openrouter.ai/) API key |
| `OPENROUTER_MODEL` | Model slug for generation/classification (default: `anthropic/claude-opus-4.5`) -- use a paid, code-capable model with a large output budget, not a free-tier one |
| `GITHUB_TOKEN` | GitHub Personal Access Token (repo scope) |
| `GITHUB_USERNAME` | GitHub username for created repos |
| `RAILWAY_TOKEN` | [Railway](https://railway.app/) API token |
| `PORT` | Backend port (default: 3001) |

## API Endpoints

All routes except `/api/auth/login` and `/api/webhook/textmagic` require `Authorization: Bearer <token>`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Get JWT token |
| `GET` | `/api/scrape-jobs` | List scrape jobs |
| `POST` | `/api/scrape-jobs` | Create & run scrape job |
| `GET` | `/api/scrape-jobs/:id/leads` | Leads for a job |
| `GET` | `/api/leads` | All leads (filtered/paginated) |
| `PATCH` | `/api/leads/:id` | Update lead |
| `POST` | `/api/leads/bulk-exclude` | Bulk exclude leads |
| `POST` | `/api/sms/send-bulk` | Send bulk SMS |
| `POST` | `/api/webhook/textmagic` | TextMagic reply webhook |
| `GET` | `/api/build/queue` | Build queue status |
| `GET` | `/api/build/:leadId/log` | SSE build log stream |
| `GET` | `/api/deployments` | Deployed sites |
| `GET` | `/api/analytics` | Funnel + chart data |

## Frontend Pages

| Page | Route | Description |
|---|---|---|
| Login | `/login` | Admin authentication |
| Scrape Jobs | `/scrape-jobs` | Create and monitor scrape jobs |
| Leads | `/leads` | Review, filter, bulk SMS/exclude/build |
| Outreach | `/outreach` | SMS queue and reply inbox |
| Build Queue | `/build-queue` | Live build status + log viewer |
| Deployments | `/deployments` | Site cards with live URLs |
| Follow-up CRM | `/follow-up` | Post-deployment follow-up management |
| Analytics | `/analytics` | Funnel chart, lead stats, conversion rates |

## TextMagic Webhook

Configure TextMagic to send reply webhooks to:
```
POST https://your-domain.com/api/webhook/textmagic
```

The webhook always returns HTTP 200 to prevent TextMagic retry storms.

## Development

```bash
# Backend with hot reload
cd backend && npm run dev

# Frontend with HMR
cd frontend && npm run dev

# BullMQ worker
cd backend && npm run worker

# Database migrations
cd backend && npm run db:migrate

# TypeScript type check
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

## Production Build

```bash
# Backend
cd backend && npm run build && npm start

# Frontend
cd frontend && npm run build
# Serve dist/ with nginx or similar
```