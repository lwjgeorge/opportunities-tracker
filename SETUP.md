# Opportunities Tracker — first-run setup

Single-user job-search dashboard. Built overnight by Halo's agent crew, June 2026.

Everything ships as code, but the app needs a handful of external accounts before it does anything useful. Walk through this checklist in order.

---

## 1. Neon Postgres (5 min)

1. Create a Neon account at https://neon.tech (free tier is plenty).
2. New project. Name: `opportunities-tracker`. Region: closest to you.
3. Copy the connection string. It looks like:
   `postgresql://<user>:<password>@<host>/<db>?sslmode=require`
4. Save it locally:
   ```bash
   cp .env.example .env.local
   # edit .env.local, paste the connection string into DATABASE_URL
   ```
5. Apply migrations:
   ```bash
   pnpm db:migrate
   ```
6. Smoke test:
   ```bash
   pnpm db:studio
   # browser opens Drizzle Studio at localhost:4983; you should see 8 empty tables
   ```

---

## 2. GitHub OAuth app (3 min)

The app is single-user. Sign-in goes through GitHub; only **your** GitHub account is allowed in.

1. https://github.com/settings/applications/new
2. Fill in:
   - Application name: `Opportunities Tracker (local)`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
3. Register. Copy the **Client ID**.
4. "Generate a new client secret". Copy it (it won't show again).
5. Paste into `.env.local`:
   ```
   AUTH_GITHUB_ID=<client id>
   AUTH_GITHUB_SECRET=<client secret>
   ```
6. Find your numeric GitHub user ID:
   ```bash
   curl -s https://api.github.com/users/<your-handle> | jq .id
   ```
   Paste into `.env.local` as `ALLOWED_GITHUB_ID`.
7. Generate an Auth.js session secret:
   ```bash
   openssl rand -base64 32
   ```
   Paste as `AUTH_SECRET`.

For the deployed version, register a **second** OAuth app pointing at `https://opportunities-tracker.vercel.app/api/auth/callback/github`.

---

## 3. Google OAuth client for Gmail polling (5 min)

Gmail polling needs read-only access to your inbox. The app handles the OAuth dance in-product (`/settings/email` → "Connect Gmail"), but the OAuth client itself has to be created manually in Google Cloud.

1. https://console.cloud.google.com/projectcreate — create a project named `opportunities-tracker`.
2. Enable the Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com → Enable.
3. OAuth consent screen:
   - User type: External
   - Publishing status: leave in Testing. Add your own Gmail account as a Test User. (Single-user app, no need to ship for verification.)
   - Scopes: only `https://www.googleapis.com/auth/gmail.readonly` (the app's `Connect` button asks for exactly this; you can add it in the consent screen now or let the run-time request fly).
4. Credentials → Create credentials → OAuth client ID:
   - Application type: Web application
   - Name: `Opportunities Tracker`
   - Authorized redirect URIs (add both):
     - `http://localhost:3000/api/oauth/google/callback`
     - `https://opportunities-tracker.vercel.app/api/oauth/google/callback`
5. Copy the **Client ID** and **Client Secret**.
6. Paste into `.env.local`:
   ```
   GOOGLE_CLIENT_ID=<client id>
   GOOGLE_CLIENT_SECRET=<client secret>
   ```
7. Generate a cron secret (used by Vercel cron to call the polling routes):
   ```bash
   openssl rand -base64 32
   ```
   Paste as `CRON_SECRET`.

When you sign in to the app for the first time and go to **Settings → Email**, you'll see a "Connect Gmail" button that completes the OAuth flow and persists the refresh token in the `oauth_tokens` table.

---

## 4. Vercel deploy (5 min)

1. https://vercel.com/new
2. Import Git Repository → `lwjgeorge/opportunities-tracker`.
3. Scope: your personal team (`slabtax77gmailcoms-projects`).
4. Framework preset: Next.js (auto-detected).
5. Project name: `opportunities-tracker`.
6. Skip env vars in the wizard.
7. After first deploy lands (it'll succeed; the build doesn't need real env vars), go to **Settings → Environment Variables**. Add every key from `.env.example` for `Production`, `Preview`, and `Development`. Production values come from steps 1-3 above; previews can reuse them or get their own.
8. Push to `main` → auto-deploys.
9. The two cron jobs (`/api/cron/poll-gmail` every 5 min, `/api/cron/refresh-companies` daily at 03:00 UTC) appear in **Settings → Crons** after the first deploy. Vercel calls them with `Authorization: Bearer <CRON_SECRET>` automatically.

---

## 5. GitHub Actions (1 min)

The repo ships with `.github/workflows/ci.yml` running `pnpm install` → `pnpm typecheck` → `pnpm lint` → `pnpm test --run` → `pnpm build` on every push.

1. https://github.com/lwjgeorge/opportunities-tracker/settings/actions → **Allow all actions and reusable workflows**.
2. The first push after enabling triggers the workflow. Watch it under **Actions**.

---

## 6. Email allowlist (after you're signed in)

Polling deliberately doesn't slurp your whole inbox. Go to **Email allowlist** in the sidebar and add the domains and addresses you actually want tracked:

- Domain example: `greenhouse.io` (catches every Greenhouse-generated email)
- Address example: `recruiter@hooli.com` (only that exact sender)

Nothing flows into `email_events` until at least one allowlist entry exists.

---

## Env vars cheat sheet

Everything required, in one place:

| Var | Where it comes from | Used by |
|---|---|---|
| `DATABASE_URL` | Step 1 (Neon) | every server component, every route, drizzle |
| `AUTH_SECRET` | Step 2 (`openssl rand -base64 32`) | Auth.js JWT signing |
| `AUTH_GITHUB_ID` | Step 2 (GitHub OAuth app) | Auth.js GitHub provider |
| `AUTH_GITHUB_SECRET` | Step 2 (GitHub OAuth app) | Auth.js GitHub provider |
| `ALLOWED_GITHUB_ID` | Step 2 (`curl /users/<you>`) | the single-user sign-in callback |
| `GOOGLE_CLIENT_ID` | Step 3 (Google Cloud) | Gmail OAuth flow |
| `GOOGLE_CLIENT_SECRET` | Step 3 (Google Cloud) | Gmail OAuth flow |
| `GOOGLE_REFRESH_TOKEN` | Optional fallback. If `oauth_tokens` is empty, the Gmail provider reads from this. After you click "Connect Gmail" in-app, it's irrelevant. | Gmail provider |
| `CRON_SECRET` | Step 3 (`openssl rand -base64 32`) | Bearer-auth on `/api/cron/*` |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com | LLM extractor (round 3) |

---

## What WORKS without any of this

- `pnpm install && pnpm build` produces a deployable bundle. The build does NOT need env vars (DB client is lazy, Auth.js v5 only complains at runtime).
- `pnpm test --run` runs 28 unit tests covering the allowlist→Gmail query builder, the cheerio extractor, the robots.txt parser, and the schema-export contract.
- `pnpm dev` boots the UI. You can navigate the kanban with mock data even before connecting a DB. Sign-in will fail (no GitHub creds), so the (app) routes are reached by setting `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` / `ALLOWED_GITHUB_ID` from step 2 — those are the minimum for sign-in to succeed.

---

## What doesn't work yet

- Real DB-backed data. Until you wire `DATABASE_URL` and `pnpm db:migrate`, the kanban renders only mock data and all server actions throw.
- LLM extraction. Round 3 ships the extractor and eval harness but it's wired off by default — flip via the `LLM_EXTRACTION_ENABLED` env flag once you've added `ANTHROPIC_API_KEY`.
- Inbound email parsing. Gmail polling fetches metadata only by default to keep API quota low. Body fetch is a one-line switch in `src/lib/email/providers/gmail.ts`.
