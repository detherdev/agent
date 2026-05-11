# Deploy quickstart — see the landing page live in ~10 minutes

Three paths. Pick by what you want to see today.

| You want to see... | Path | ETA | Needs |
|---|---|---|---|
| Just the marketing site (landing + pricing + legal + /demo) | **A. Vercel + DB only** | ~15 min | Vercel, GitHub, any Postgres (Supabase free) |
| Marketing + signed-in app shell (no agent runs) | **B. Vercel + Fly api** | ~45 min | + Fly, Redis, Clerk |
| The whole thing — agent runs, OAuth, email-in | **C. Full deploy** | ~half day | All 12 providers in DEPLOYMENT.md |

If you just want to **see what we built** and click around, do path A. If you want to actually take a friend through sign-up and onboarding, do path B. If you want a paying customer to try it, do path C and read DEPLOYMENT.md.

---

## Path A — Vercel only (landing page live in ~15 minutes)

This gets `/`, `/pricing`, `/for/bookkeepers`, `/vs/zapier`, `/legal/*`, and `/demo` live. Sign-up will not work (no Clerk yet), but everyone can browse the public surface.

### A.1 Provision a Postgres (5 min)

The `/demo` form posts to our API, which writes to Postgres. We need *some* DB to be reachable. Easiest free option:

```
1. Go to supabase.com → New project → Region: Canada Central (ca-central-1)
2. Wait ~2 min for it to provision
3. Project Settings → Database → Connection string (URI format)
4. Copy DATABASE_URL — it looks like postgres://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
```

### A.2 Run migrations against it (3 min)

From your local machine:

```bash
export DATABASE_URL="postgres://..."
pnpm install
pnpm --filter runtime build
pnpm --filter evals build
pnpm --filter api build
node packages/api/dist/migrate.js
```

You should see `✓ applied 0001_...` through the latest migration.

### A.3 Deploy web to Vercel (5 min)

1. Push the branch you're on to GitHub (or use `main`).
2. Go to **vercel.com → Add New → Project → import your GitHub repo**.
3. **Framework Preset**: Next.js (auto-detected).
4. **Root Directory**: `packages/web`
5. **Build Command**: `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter web build`
6. **Output Directory**: `.next`
7. **Install Command**: leave empty (build command does it).
8. **Environment Variables** (Production):
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_dummy_for_now_replace_when_you_have_clerk
   API_URL=https://your-future-api.com   (placeholder; the demo form fails silently until B)
   ```
   For path A *just to see the marketing site*, `pk_test_dummy_...` is enough — sign-up routes won't work but the landing page renders fine.
9. Click **Deploy**. Wait ~3 minutes.
10. Visit the generated `*.vercel.app` URL.

### A.4 Add a custom domain (optional, 2 min)

In Vercel project settings → Domains → add `yourdomain.com`. Vercel walks you through the DNS records.

### What works at this point
- `/` marketing landing
- `/pricing`
- `/for/bookkeepers`
- `/vs/zapier`
- `/demo` (form renders; submission fails silently without an API)
- `/legal/terms` and `/legal/privacy`

### What does NOT work yet
- Sign-up (no Clerk)
- Demo form submission (no API deployed)
- Anything signed-in

---

## Path B — Vercel web + Fly api (full app shell, ~45 minutes)

Adds: working sign-up, signed-in inbox / status / settings pages, `/demo` form submission lands in the leads table.

Does NOT add: real agent runs (no Anthropic key yet), real OAuth (no Nango integrations configured), no inbound email.

### B.1 Provider accounts (15 min)

Open browser tabs:
- [x] Supabase (have this from path A)
- [ ] [Clerk](https://clerk.com) → create app → copy `pk_test_...` and `sk_test_...`
- [ ] [Upstash](https://upstash.com) → New Redis → Region: Toronto (ca-central-1) → copy `REDIS_URL`
- [ ] [Fly.io](https://fly.io) → install `flyctl` locally: `brew install flyctl` or [other](https://fly.io/docs/hands-on/install-flyctl/)

```bash
flyctl auth signup    # or login
```

### B.2 Create the Fly app (5 min)

```bash
cd /path/to/repo
flyctl apps create myapp-api          # pick a name
# Update infra/fly/api.toml: change `app = "REPLACE_WITH_FLY_APP_NAME"` to your name
```

### B.3 Set Fly secrets (5 min)

```bash
flyctl secrets set -a myapp-api \
  DATABASE_URL="postgres://..." \
  REDIS_URL="rediss://..." \
  CLERK_SECRET_KEY="sk_test_..." \
  WEB_URL="https://your-app.vercel.app"
```

That's the minimum to bring the API up. Anthropic, Nango, Postmark — all left for path C.

### B.4 Deploy api to Fly (5 min)

```bash
flyctl deploy -c infra/fly/api.toml --remote-only
```

This triggers Fly's builder, which:
- Builds the Dockerfile
- Runs `release_command` = `node packages/api/dist/migrate.js` (no-op since you already migrated)
- Promotes the new VMs

When it finishes, you should see:
```
==> Monitoring deployment for myapp-api
v0 deployed successfully
```

### B.5 Point api.yourdomain.com at Fly (5 min)

```bash
flyctl certs add api.yourdomain.com -a myapp-api
# Then in Cloudflare/Namecheap:
#   CNAME  api  myapp-api.fly.dev  (proxy off)
```

Or skip the custom domain and use `myapp-api.fly.dev` directly — for testing, that's fine.

### B.6 Update Vercel env vars (3 min)

In Vercel project settings → Environment Variables, set:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...    (real one now)
CLERK_SECRET_KEY=sk_test_...
API_URL=https://api.yourdomain.com               (or https://myapp-api.fly.dev)
```

Trigger a redeploy: Vercel project → Deployments → ⋯ → Redeploy.

### B.7 Smoke test

```bash
# Liveness
curl https://api.yourdomain.com/health    # → {"ok":true}

# Readiness
curl https://api.yourdomain.com/ready     # → {"ready":true,"db":true,"redis":true}
```

Visit `https://your-app.vercel.app`:
- Marketing landing renders ✓
- Click "Start free" → Clerk sign-up form ✓
- Sign up with email → workspace bootstraps ✓
- Land on `/onboarding` or `/inbox` ✓
- AppHeader shows "Trial: 14 days left" ✓

`/demo` form now submits successfully (writes to `leads` table). Confirm:

```sql
-- in Supabase SQL editor:
select * from leads order by created_at desc limit 5;
```

### What works at path B
- Full marketing site
- Sign-up + onboarding
- Signed-in shell: inbox, status, runs, tasks, jobs, connect, settings
- `/demo` lead capture writes to DB
- Trial countdown + usage bars in `/settings/billing`

### What does NOT work yet
- **Actually running a workflow** — no `ANTHROPIC_API_KEY` set
- **Connecting Gmail / QuickBooks** — no Nango integrations configured
- **Inbound email** — no Postmark MX records
- **Stripe checkout** — code not yet wired (next slice)

---

## Path C — Full deploy

Follow `DEPLOYMENT.md`. It covers all 12 providers, secrets, smoke tests, day-2 ops. Plan a half-day.

---

## Troubleshooting

**Vercel build fails on `next build` with "Missing publishableKey"** — Clerk's build-time check. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_dummy_for_build_only` in Vercel env vars; production uses the real key from runtime env. (Already set up in the GitHub Actions CI as well.)

**`flyctl deploy` hangs at "Building image"** — likely your local network. Use `--remote-only` (already in the command above) to build on Fly's builders instead of locally.

**Migrations fail with "permission denied"** — Supabase requires the `postgres` user, not a pooler role. Use the **direct connection string** from Settings → Database, not the connection pooler URL.

**Clerk sign-up shows but redirects to error page after submit** — Vercel env vars probably set in **Preview**, not **Production**. Check.

**Demo form submits but I see no leads** — The form fires-and-forgets; check the API logs via `flyctl logs -a myapp-api`. Most likely: `API_URL` in Vercel doesn't include `https://`, or there's a CORS mismatch with `WEB_URL` on the api side.

---

## What I'd do next, in order

1. **Get path A live tomorrow.** Even if sign-up doesn't work, the landing being public lets you start collecting `/demo` leads (just point the form `mailto:` until the API is up — quick edit to `submitLead`).
2. **Move to path B by end of week.** Now you can take real sign-ups, even if they can't run agents yet (label it "early access — agent runs land in 2 weeks").
3. **Pick 3 design partners.** Bookkeeping firms via your `/demo` form. Plan a 1-hour onboarding session per partner.
4. **Path C deploy with their Anthropic + Nango set up.** They can actually run their invoices through.
