# Deployment runbook

End-to-end guide for taking the platform from `git push` to a live
URL someone can sign up at. Canadian data residency target.

Estimated total wall-clock from zero accounts: **3–5 hours** if everything goes smoothly. **A day** in practice — provider verifications (Stripe, Postmark domain), DNS propagation, and Nango per-provider OAuth setup are the slow parts.

---

## 0. Architecture you're deploying

```
                    Cloudflare DNS
                          │
            ┌─────────────┼───────────────┐
            │             │               │
     app.your...    api.your...    inbox.your...
            │             │               │
        Vercel        Fly.io          Postmark MX
        (web)         (YYZ region)    (inbound mail)
                          │
                ┌─────────┼──────────┐
                │         │          │
              api      worker     triggers
                │         │          │
                └─────┬───┴──────────┘
                      │
                Fly internal network
                      │
              Postgres (YYZ)     Redis (Upstash YYZ)
              Neon / Supabase
```

Subprocessors with cross-border data transfer (disclosed in /legal/privacy):
Anthropic (US), Clerk (US), Nango (US/EU), Stripe (US/Canada), Sentry (US/EU).

---

## 1. Accounts you need

In rough order of operation. Each link expects ~10–20 minutes.

| # | Provider | What it does | Plan / cost |
|---|---|---|---|
| 1 | **Cloudflare / Namecheap** | Domain + DNS | $10–20 / year |
| 2 | **Fly.io** | Run api / worker / triggers | Pay-as-you-go (~$10–30 / mo to start) |
| 3 | **Postgres**: Supabase Canada Central, Neon (verify CA region), or AWS RDS ca-central-1 | Workspace data, runs, audit log | Free → $25 / mo |
| 4 | **Upstash Redis** (Toronto region) | BullMQ queue durability | Free → $10 / mo |
| 5 | **Clerk** | Auth, MFA, sessions | Free up to 10k MAU |
| 6 | **Nango** | OAuth + token storage | Free → $250 / mo |
| 7 | **Anthropic** | Claude API for agent runs | Pay-as-you-go (passes through to customers) |
| 8 | **Stripe** | Billing (Canadian entity) | 2.9% + 30¢ per charge |
| 9 | **Postmark** | Inbound mail routing + transactional outbound | Free 100/mo → $15 / mo |
| 10 | **Sentry** | Error tracking | Free up to 5k events / mo |
| 11 | **Vercel** | Deploy `packages/web` | Free → $20 / mo |
| 12 | **GitHub** | Source + CI/CD (have already) | Free for private |

---

## 2. Provision infrastructure

### 2.1 Domain & DNS

Buy `yourdomain.com`. Plan three subdomains:
- `app.yourdomain.com` → Vercel
- `api.yourdomain.com` → Fly
- `inbox.yourdomain.com` → Postmark MX records (set later in step 2.9)

### 2.2 Postgres

```
Supabase: New project → Region: ca-central-1
Or Neon: confirm Canadian region is available, else swap
Get: DATABASE_URL (postgres://...)
```

### 2.3 Redis

```
Upstash: New Redis → Region: aws-ca-central-1 (Toronto)
Get: REDIS_URL (rediss://...)
```

### 2.4 Clerk

```
1. Create app
2. Authentication settings:
   - Email: ✅
   - Google OAuth: ✅
   - MFA: TOTP available (Pro plan customers can enforce later)
3. Custom domain: app.yourdomain.com (paste later)
4. Webhook endpoints: skip for now (next-slice feature)
Get:
   - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (pk_live_...)
   - CLERK_SECRET_KEY (sk_live_...)
```

### 2.5 Nango

Each integration requires registering an OAuth app at each provider
(Google Cloud Console for Gmail/Drive, Intuit Developer for QuickBooks,
Microsoft Entra for Outlook, Stripe Connect, Slack app, etc.).

```
1. nango.dev → New project
2. For each provider you want to expose (gmail, quickbooks, outlook,
   stripe, slack, google-drive, plaid, netsuite, hubspot):
   - Click "Add integration"
   - Paste client_id + client_secret from the provider's developer console
   - For Plaid: use the integration template that proxies to /transactions/get
   - For NetSuite: choose OAuth2 (NOT TBA); accountId arrives via
     connection_config.accountId from the install dialog
3. Webhook URL: https://api.yourdomain.com/v1/connect/webhook
4. Webhook signing secret: generate, paste into NANGO_WEBHOOK_SECRET
Get:
   - NANGO_SECRET_KEY (private — for the api/worker)
   - NEXT_PUBLIC_NANGO_PUBLIC_KEY (for the web Connect UI)
   - NANGO_WEBHOOK_SECRET
```

### 2.6 Stripe (Canadian entity)

```
1. Create Canadian Stripe account (or use existing US one)
2. Products → New:
   - Name: Starter, monthly, $99 USD → copy price_id
   - Name: Pro, monthly, $399 USD → copy price_id
3. Customer Portal → enable cancellation, payment-method update,
   invoice history
4. Webhook → Add endpoint:
   - URL: https://api.yourdomain.com/v1/billing/webhook
   - Events: customer.subscription.created/updated/deleted,
     invoice.paid, invoice.payment_failed
   - Get the signing secret
Get:
   - STRIPE_SECRET_KEY (sk_live_...)
   - STRIPE_WEBHOOK_SECRET (whsec_...)
   - STRIPE_PRICE_ID_STARTER, STRIPE_PRICE_ID_PRO
```
Note: Stripe wiring code lands in the next slice. For free-trial-only
launch, you can skip steps 6 and revisit later.

### 2.7 Anthropic

```
console.anthropic.com → API keys
Set a monthly budget cap (Settings → Billing → Spend limits).
Get: ANTHROPIC_API_KEY
```

### 2.8 Sentry

```
sentry.io → Two new projects:
  - "myapp-api" (platform: Node.js)
  - "myapp-web" (platform: Next.js)
For each: copy DSN
For source-map upload (web only):
  - Auth token (Account → User Auth Tokens, "project:write")
  - Org slug, project slug
Get:
   - SENTRY_DSN_API
   - NEXT_PUBLIC_SENTRY_DSN_WEB
   - SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT (for CI)
```

### 2.9 Postmark

```
1. Create server
2. Inbound stream:
   - Inbound domain: inbox.yourdomain.com
   - Postmark provides MX values — set them in Cloudflare DNS:
       inbox.yourdomain.com    MX    inbound.postmarkapp.com    10
   - Webhook URL: https://api.yourdomain.com/v1/webhooks/inbound-email
   - Use Basic Auth on the webhook with a strong password.
3. Outbound stream (transactional):
   - Verify sender domain: yourdomain.com (add the DKIM CNAME they show)
Get:
   - POSTMARK_SERVER_TOKEN (transactional sends — next slice)
   - INBOUND_WEBHOOK_USER, INBOUND_WEBHOOK_PASSWORD (Basic Auth)
   - INBOUND_EMAIL_DOMAIN = "inbox.yourdomain.com"
```

### 2.10 Fly.io

```
fly auth signup
fly apps create REPLACE_WITH_FLY_APP_NAME
# Update infra/fly/api.toml: change `app = "..."` line.

# Set all secrets:
fly secrets set -a REPLACE_WITH_FLY_APP_NAME \
  DATABASE_URL="postgres://..." \
  REDIS_URL="rediss://..." \
  CLERK_SECRET_KEY="sk_live_..." \
  NANGO_SECRET_KEY="..." \
  NANGO_WEBHOOK_SECRET="..." \
  ANTHROPIC_API_KEY="sk-ant-..." \
  INBOUND_WEBHOOK_USER="postmark" \
  INBOUND_WEBHOOK_PASSWORD="..." \
  INBOUND_EMAIL_DOMAIN="inbox.yourdomain.com" \
  WEB_URL="https://app.yourdomain.com" \
  SENTRY_DSN="..." \
  SLACK_CLIENT_ID="..." \
  SLACK_CLIENT_SECRET="..." \
  SLACK_SIGNING_SECRET="..." \
  SLACK_REDIRECT_URI="https://api.yourdomain.com/v1/slack/install/callback" \
  TEAMS_APP_ID="..." \
  TEAMS_APP_SECRET="..."
```

### 2.10c Microsoft Teams interactive bot (optional)

The Teams bot lets workspaces approve runs via Adaptive Cards inside Teams.

```
1. Azure Portal → Bot Services → Create
   - Bot type: Multi-tenant
   - Microsoft App ID: auto-create
   - Pricing tier: F0 (free)
2. Once created → Configuration:
   - Messaging endpoint: https://api.yourdomain.com/v1/teams/messages
3. Channels → Add Microsoft Teams channel
4. App registration → Certificates & secrets → New client secret
   - Copy:
     - Application (client) ID → TEAMS_APP_ID + NEXT_PUBLIC_TEAMS_APP_ID
     - Client secret value     → TEAMS_APP_SECRET
5. Open infra/teams/manifest.json:
   - Replace REPLACE_WITH_TEAMS_APP_ID (twice — `id` and `bots[0].botId`)
   - Replace REPLACE_WITH_YOUR_DOMAIN with your domain
   - Add color.png (192×192) + outline.png (32×32) icons in the same dir
6. Zip manifest.json + icons → upload at https://admin.teams.microsoft.com/
   to publish org-wide, OR upload to each customer's Teams Apps as
   a "custom app" during onboarding.
7. Customer install: workspace owner enters their Microsoft Entra
   tenant ID at /connect, clicks "Install" — opens Teams app deep link.
   Admin adds the bot to a channel; the bot's first activity completes
   the install.
```

### 2.10b Slack interactive bot (optional, recommended)

The bot lets workspaces approve runs from Slack instead of the web inbox.
Without it, approvals still work fine — they're just decided in `/inbox`.

```
1. api.slack.com/apps → Create New App → "From a manifest"
2. Pick your workspace, paste infra/slack/manifest.json
   (replace REPLACE_WITH_YOUR_DOMAIN with your domain first)
3. Install to your dev workspace; copy:
   - Client ID  → SLACK_CLIENT_ID
   - Client Secret → SLACK_CLIENT_SECRET
   - Signing Secret → SLACK_SIGNING_SECRET
4. Set redirect URI: https://api.yourdomain.com/v1/slack/install/callback
5. Each customer hits `/connect` in the web app → "Install" on the
   Slack approvals tile → completes the OAuth → bot lands in their
   workspace.
```

### 2.11 Vercel

```
1. Import GitHub repo
2. Root directory: packages/web
3. Framework preset: Next.js (auto)
4. Build command: pnpm --filter web build
5. Install command: pnpm install --filter web... --frozen-lockfile
6. Set env vars (Production):
   API_URL=https://api.yourdomain.com
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
   CLERK_SECRET_KEY=sk_live_...
   NEXT_PUBLIC_NANGO_PUBLIC_KEY=...
   NEXT_PUBLIC_SENTRY_DSN=...
   SENTRY_AUTH_TOKEN=... (for source-map upload)
   SENTRY_ORG=...
   SENTRY_PROJECT=...
7. Domain: app.yourdomain.com (Vercel guides DNS — add the CNAME).
```

---

## 3. First deploy

### 3.1 Push to main

```bash
git push origin main
```

GitHub Actions runs `.github/workflows/ci.yml` (typecheck + build).
On success, `.github/workflows/deploy.yml` runs `flyctl deploy` for the api app.
Vercel auto-deploys the web side from its GitHub integration.

The first Fly deploy:
- Builds the Docker image
- Runs `release_command` = `node packages/api/dist/migrate.js`
  - Applies `db/schema.sql` (fresh DB) + every migration in `db/migrations/`
- Promotes the new VMs once migrations succeed

If migrations fail, the new VMs aren't promoted — old ones keep serving.

### 3.2 Point api.yourdomain.com at Fly

```bash
fly certs add api.yourdomain.com -a REPLACE_WITH_FLY_APP_NAME
# Then in Cloudflare DNS:
#   api.yourdomain.com  CNAME  REPLACE_WITH_FLY_APP_NAME.fly.dev  proxy=off
```

### 3.3 Smoke test

```bash
# Liveness
curl https://api.yourdomain.com/health
# → {"ok":true}

# Readiness (DB + Redis)
curl https://api.yourdomain.com/ready
# → {"ready":true,"db":true,"redis":true}
```

Visit `https://app.yourdomain.com`:
- Should see the marketing landing page (no auth required)
- Click "Start free trial" → Clerk hosted sign-up → workspace bootstraps
- `/inbox` should be empty; AppHeader should show "Trial: 14 days left"
- `/jobs` should list templates from `packs/`
- Install a job → `/runs` shows the workflow

### 3.4 Connector setup smoke test

```
/connect → click "Connect" on a tile (e.g., Gmail)
→ Nango Connect modal opens
→ Walk OAuth
→ Modal closes; tile flips green
→ Postgres `connections` table now has the row
```

### 3.5 Inbound mail smoke test

```
1. Get your workspace's inbox address from /settings/data
   (or query workspaces.inbox_address directly).
2. Forward a real email to wx-xxxxxx@inbox.yourdomain.com.
3. Watch the Postmark inbound stream — should show the message.
4. Watch Fly logs — api should accept the webhook with 200.
5. /runs should show a new run for any inbound_email-triggered workflow
   that's installed.
```

### 3.6 Deliberate error → Sentry

```bash
curl https://api.yourdomain.com/v1/runs/00000000-0000-0000-0000-000000000000
# 404, captures nothing.

# Trigger an actual error in dev (or in staging). Confirm a Sentry issue lands.
```

---

## 4. Day-2 ops

### Run a migration manually

```bash
fly ssh console -a REPLACE_WITH_FLY_APP_NAME -C "node packages/api/dist/migrate.js"
```

### Pause a customer's workspace

```bash
fly postgres connect -a REPLACE_WITH_FLY_PG_APP -d agent
# psql:
update workflows set is_paused = true where workspace_id = '...';
```

### Roll back a deploy

```bash
fly releases -a REPLACE_WITH_FLY_APP_NAME
fly deploy --image registry.fly.io/REPLACE_WITH_FLY_APP_NAME:v123 -a REPLACE_WITH_FLY_APP_NAME
```

### Rotate a secret

```bash
fly secrets set -a REPLACE_WITH_FLY_APP_NAME ANTHROPIC_API_KEY="sk-ant-new..."
# Fly does a rolling restart automatically.
```

### Scale up worker

```bash
fly scale count -a REPLACE_WITH_FLY_APP_NAME worker=2
# Two worker VMs, each consuming the BullMQ runs queue concurrently.
```

### Backup verification (quarterly DR drill)

```
1. Open your Postgres provider's console.
2. Take a manual snapshot.
3. Restore to a fresh DB in staging.
4. Point staging api at it, run smoke tests.
5. Document timestamp + duration of restore in your DR log (SOC2 evidence).
```

---

## 5. What's still placeholder

This deployment is functional for trial-only launch. Before charging customers:
- **Stripe code wiring** is not yet built. The "Upgrade plan" button in
  `/settings/billing` is disabled. Workspaces stay on `plan_tier='trial'`
  until you upgrade them in SQL.
- **Outbound email** (welcome, daily digest, approval-pending, trial-ending,
  usage-alerts) is not wired. Postmark inbound works; outbound doesn't.
- **Member invites + roles** are placeholders. Only the workspace owner
  can sign in (single seat). Multi-seat ships with the Pro plan.
- **Data export / delete endpoints** are placeholders. PIPEDA paths
  documented in `/settings/data` aren't functional yet.
- **SOC2 evidence collection** (Vanta/Drata) is not connected.

These are tracked in `/root/.claude/plans/starting-a-new-project-gentle-church.md`
under the production-readiness plan.

---

## 6. The TL;DR command sequence

Once all accounts exist and secrets are filed:

```bash
# Update infra/fly/api.toml: replace REPLACE_WITH_FLY_APP_NAME
# Commit + push
git add infra/fly/api.toml
git commit -m "Configure Fly app name"
git push origin main
# GitHub Actions deploys. Vercel auto-deploys.
# Smoke test per §3.3.
```
