# CLAUDE.md

Guidance for AI assistants (and humans) working on **LinkBot / Linky** — a self-hosted LinkedIn outreach + CRM platform. The product brand in the UI is **Linky**; the repo and code identifiers say **LinkBot**.

## What this app does

Automates LinkedIn outreach end-to-end:

- **CRM** — store contacts in user-owned CRMs (one default `Mon Réseau` per user, auto-synced from connections).
- **Campaigns** — search-based, DM, connection request, and combined `connection_dm` / `search_connection_dm` / `export` flows. Supports multi-step follow-up cycles (main + up to 7 relances) with per-step delays and AI-generated personalization (Google Gemini 2.5 Flash).
- **Lead magnets** — watch a LinkedIn post, detect commenters using a keyword, then like/reply/connect/DM them on a fixed cadence.
- **Reply detection** — periodically polls conversations to mark contacts as `reussi` (replied) and stop follow-ups.
- **Rate-limit guard rails** — global daily quotas, schedule windows, warmup curve, and 15h account-wide cooldowns when LinkedIn returns `FUSE_LIMIT_EXCEEDED` / 429.

## Repository layout

```
backend/             FastAPI + SQLAlchemy app, Playwright, scheduler, jobs
  app/
    main.py          App factory, lifespan, middleware, /api/health, /api/cron/*, /api/admin/*
    config.py        Env-driven settings (DATABASE_URL, JWT_SECRET, CORS_ORIGINS, CRON_SECRET, SUPABASE_*)
    database.py      SQLAlchemy engine, init_db(), idempotent _run_migrations()
    models.py        ORM models (User, CRM, Contact, Campaign, CampaignContact, CampaignMessage,
                     CampaignAction, LeadMagnet, LeadMagnetContact, Tag, Blacklist, Notification, AppSettings)
    schemas.py       Pydantic request/response shapes
    auth.py          bcrypt + JWT helpers
    dependencies.py  get_db, get_current_user (HTTPBearer)
    scheduler.py     Custom asyncio scheduler (replaces APScheduler — see "Scheduler")
    linkedin_service.py    Async wrappers around open_linkedin_api (asyncio.to_thread)
    playwright_actions.py  Headless Chromium fallback for actions LinkedIn closed off (reply_to_comment)
    storage.py       File uploads — Supabase Storage in prod, local /uploads in dev
    routers/         FastAPI routers, all prefixed /api/*: auth, user, onboarding, crm, campaigns,
                     config, dashboard, blacklist, tags, notifications, lead_magnets
    jobs/            Per-campaign-type tick runners called by the scheduler
                     search_campaign, dm_campaign, connection_campaign, connection_dm_campaign,
                     search_connection_dm_campaign, export_campaign, lead_magnet_job,
                     sync_connections, reply_checker, import_connections
    utils/           ai_message (Gemini), template_engine, rate_limit_cooldown,
                     post_url_parser, csv_parser, sync_lock
  open_linkedin_api/ Vendored fork of linkedin-api (Voyager). Custom RateLimiter, cookie repo.
  scripts/           Ad-hoc debugging scripts (test_reply_*, dump_post_dom, debug_reply_flow)
  Dockerfile         python:3.11-slim-bookworm + Playwright Chromium (--with-deps)
  run.py             Local entrypoint (uvicorn with reload off in production)
  requirements.txt

frontend/            React 19 + Vite 8 + Tailwind v4, deployed to Vercel
  src/
    main.jsx, App.jsx        BrowserRouter, lazy-loaded routes, AuthProvider, react-hot-toast
    api/                     One module per backend domain — all hit /api via axios client.js
    pages/                   Top-level routes (DashboardPage, CRMListPage, CampaignsPage, …)
    components/              ui/ atoms (Modal, Badge, AlertBanner, atoms…), layout/ (Sidebar, PageWrapper)
    context/AuthContext.jsx  Token in localStorage as `linkbot_token`
    utils/date.js
  vite.config.js     Dev proxy /api + /uploads -> http://localhost:8000; PWA manifest
  vercel.json        Rewrites /api/* and /uploads/* to https://linkbot-api.onrender.com
  eslint.config.js   Flat config (eslint v9), react-hooks + react-refresh

extension/           Chrome MV3 extension — adds "Add to LinkBot" button on linkedin.com,
                     auto-syncs li_at + JSESSIONID cookies to the backend
  manifest.json
  background/service-worker.js   API client, cookie sync, message router
  content/                        Content script + styles for /in/* and /search/*
  popup/                          Login + CRM picker UI
```

## Development workflows

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium     # first time only, for reply_to_comment
cp ../.env.example ../.env      # then edit
python run.py                   # uvicorn on :8000 with reload (when ENV != production)
```

Defaults if env vars are missing:

- `DATABASE_URL` — falls back to SQLite at `backend/data/app.db`. Production uses Supabase Postgres (must be the **direct** connection on port 5432, not the pooler).
- `JWT_SECRET` — has a dev default; **must** be overridden in prod.
- `CORS_ORIGINS` — comma-separated; defaults to localhost Vite ports.
- `CRON_SECRET` — required to call `/api/cron/*` and `/api/admin/scheduler-status`.
- `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_BUCKET` — when unset, file uploads stay on local disk.
- `SENTRY_DSN` — optional; opt-in only (no PII, traces off).

The seed step in `main.seed_db()` creates a default `TEKA / ADMIN` user and a `Mon Réseau` CRM. There's also a hardcoded admin login bypass in `routers/auth.py:login` for `TEKA / ADMIN` — keep it.

### Frontend

```bash
cd frontend
npm install
npm run dev           # Vite on :5173, proxies /api + /uploads to localhost:8000
npm run lint          # eslint flat config
npm run build         # production build to dist/
```

`VITE_API_URL` overrides the API base; default in dev is the relative `/api` (proxied), in prod the Vercel rewrite forwards to Render.

### Chrome extension

Load `extension/` as an unpacked extension in `chrome://extensions`. The service worker hits `https://linkbot-api.onrender.com/api` directly — for local dev against a local backend, edit `API_BASE` in `extension/background/service-worker.js`.

### Tests / scripts

There is **no automated test suite**. `backend/scripts/` contains one-off Playwright/Voyager debugging scripts; they're useful for diagnosing LinkedIn DOM/SDUI changes but are not wired into CI.

## Architecture notes

### Multi-user

The codebase originated as a single-user app. `_run_migrations()` in `database.py` adds `user_id` columns to legacy tables (`crm`, `tag`, `blacklist`, `campaign`) idempotently and drops the old global unique constraints. `user_id` is nullable for backfill; new code should always set it. Auth is JWT + Bearer (HS256, 72h). `get_current_user` in `dependencies.py` is the standard FastAPI dependency.

### Scheduler (`backend/app/scheduler.py`)

A bespoke single-task asyncio loop — **not APScheduler** (which silently failed on Render). It:

- Loops every 5s checking a registry (`_campaigns: dict[id, info]`).
- Fires registered campaigns when `next_run` elapses, then recomputes the interval via `_compute_dynamic_interval()` (remaining quota / time left in window, with 10% jitter).
- Runs reply checks every `REPLY_CHECK_INTERVAL = 300s` and (via external cron POST) connection sync every 6h.
- Skips campaigns whose family is in cooldown (`utils/rate_limit_cooldown.py`); lead magnets are exempt.
- Lead-magnet IDs are encoded as `"lm_<id>"` in the registry key — handle both `int` and `str` IDs.
- `_recover_running_campaigns()` re-registers anything left in `running` state across restarts.

When you add a new job type:
1. Add an `elif` branch in `_run_campaign_tick`.
2. Add an entry to `family_for_campaign_type` in `utils/rate_limit_cooldown.py` if it issues writes.
3. Update `_compute_dynamic_interval` if it has its own quota.

### LinkedIn integration

- `open_linkedin_api/` is a vendored fork of [`linkedin-api`](https://github.com/tomquirk/linkedin-api). Don't pull from the upstream blindly — there are local changes (custom `RateLimiter`, `CookieRepository`, settings).
- All sync calls are wrapped in `asyncio.to_thread` from `linkedin_service.py`. Add new endpoints there, not directly inline in jobs.
- `JSESSIONID` must be wrapped in double quotes for Voyager to accept it (`get_linkedin_client` handles this).
- Some endpoints (notably comment replies) no longer work via Voyager since LinkedIn moved to SDUI/protobuf — use `playwright_actions.reply_to_comment_via_browser` instead. The Dockerfile installs Chromium specifically for this.
- `is_rate_limit_error(exc)` checks for `FUSE_LIMIT_EXCEEDED` or `status code 429`. Whenever you call a write endpoint (connection, DM), guard the call and trigger the appropriate cooldown when it fires.

### Cron / external triggers

`/api/cron/sync-connections?key=$CRON_SECRET` is hit by cron-job.org to fan out connection sync across all users. `/api/admin/scheduler-status?key=$CRON_SECRET` is the ops snapshot. Both are 403'd without the secret.

### Database migrations

There is no Alembic. Migrations live in `database._run_migrations()` as idempotent `ALTER TABLE … IF NOT EXISTS` style SQL run on every `init_db()`. **Do not** add destructive SQL; add columns + indexes with `IF NOT EXISTS`, and gate Postgres-only ops on `is_pg`.

### Frontend conventions

- React 19, **JSX (no TypeScript)**.
- TanStack Query is installed but most pages use plain `useEffect` + the per-domain modules in `src/api/`. New pages can adopt React Query freely.
- Tailwind v4 via the `@tailwindcss/vite` plugin (no `tailwind.config.js`). Custom CSS variables (e.g. `hsl(var(--accent))`, `--bg`) are defined in `src/index.css`.
- Routes are lazy-loaded in `App.jsx` to keep first-paint chunks small.
- `axios` interceptor in `api/client.js` retries 5xx/network errors once for GETs and force-redirects to `/login` on 401.

### Performance + observability

- `_TimingMiddleware` adds `Server-Timing` header and logs any `/api/*` request taking >200ms.
- Indexes added in migrations: `(campaign_id, status)` on `campaign_contact`, `(user_id, status)` on `campaign`, `(campaign_id, created_at)` on `campaign_action`. Keep N+1 queries out of list endpoints — use the `_batch_*` helpers in `routers/campaigns.py` as a model.
- Sentry is opt-in via `SENTRY_DSN`.

## Conventions

- **Language mix** — backend code/comments are English; user-facing copy and many enum/status values (`pending`, `envoye`, `relance_1..7`, `reussi`, `perdu`, `demande_envoyee`) are French. Keep status strings as-is even if writing English code around them.
- **Logging** — use `logging.getLogger(__name__)` for normal logs. `print(..., flush=True)` is used intentionally in scheduler/job code so Render's stdout-only log capture surfaces it; keep it that way for hot paths you want visible in prod logs.
- **Cookies** — never log `li_at` or `JSESSIONID`. They're stored on `User.li_at_cookie` / `User.jsessionid_cookie`.
- **Comments** — only when the *why* is non-obvious (LinkedIn quirks, intentional fallbacks, rate-limit reasoning). The existing codebase already follows this — match it.
- **Routes** — every router lives under `/api/<domain>` and is mounted in `main.py`. New routers must be `include_router`-ed there.
- **No TypeScript / no tests** — don't introduce them piecemeal; if you add either, do it as a deliberate, complete migration.

## Deployment

- **Backend** — Render (free tier), Docker build from `backend/Dockerfile`. Image is Debian 12 (bookworm) — **do not bump to trixie** (Playwright's `--with-deps` pulls font packages that were removed there).
- **Frontend** — Vercel. `vercel.json` rewrites `/api/*` and `/uploads/*` to the Render URL; everything else falls through to `index.html` (SPA).
- **Chrome extension** — manual zip + Web Store upload (no CI). Update `version` in `manifest.json` first.
- **Database** — Supabase Postgres. Use the **direct** connection on port 5432, never the pooler on 6543 (psycopg2 misbehaves with the transaction pooler for our migration patterns).
- **Cron** — cron-job.org calls `/api/cron/sync-connections?key=…` on a 6h cadence.

## Pitfalls / gotchas

- The TEKA admin user is auto-created on every startup with `id=1`. Don't repurpose user id 1.
- `psycopg2-binary` on Apple Silicon may need `brew install postgresql` first.
- Adding fields to `User` / `Contact` / `Campaign` models requires a matching `ALTER TABLE` block in `_run_migrations` — Postgres won't auto-add columns from `Base.metadata.create_all`.
- The frontend doesn't tree-shake `lucide-react` particularly well — prefer named imports of single icons.
- `gemini_api_key` is per-user (not a server secret). The free Gemini tier is 15 RPM — `utils/ai_message.py` enforces 14 RPM via a sliding-window limiter.
- `playwright install --with-deps chromium` is mandatory wherever the backend runs; without it `reply_to_comment` will fail at runtime, not at startup.
- When a rate-limit cooldown fires, the entire family (`connections` or `dms`) freezes for 15h across all of a user's campaigns. Lead magnets do **not** trigger and do **not** respect cooldowns.

## Quick command reference

```bash
# Run backend with auto-reload
ENV=dev python backend/run.py

# Run frontend dev server (proxies to localhost:8000)
cd frontend && npm run dev

# Build frontend for prod
cd frontend && npm run build

# Lint frontend
cd frontend && npm run lint

# Inspect scheduler state in prod
curl "https://linkbot-api.onrender.com/api/admin/scheduler-status?key=$CRON_SECRET"

# Trigger connection sync for all users
curl "https://linkbot-api.onrender.com/api/cron/sync-connections?key=$CRON_SECRET"
```
