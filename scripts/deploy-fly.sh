#!/usr/bin/env bash
#
# Interactive Fly deploy helper. Walks you through:
#   1. flyctl install check
#   2. fly auth login (opens browser)
#   3. fly apps create (asks once)
#   4. fly secrets set (you paste each)
#   5. fly deploy
#
# After this finishes, the api / worker / triggers are live on Fly.
# Set FLY_API_TOKEN as a GitHub Actions secret afterwards so subsequent
# pushes to main auto-deploy via .github/workflows/deploy.yml.
#
# Usage:
#   ./scripts/deploy-fly.sh

set -euo pipefail

# Colors for the impatient.
g() { printf "\033[32m%s\033[0m\n" "$*"; }
y() { printf "\033[33m%s\033[0m\n" "$*"; }
r() { printf "\033[31m%s\033[0m\n" "$*"; }
b() { printf "\033[1m%s\033[0m\n" "$*"; }

b "→ Fly deploy helper"
echo

# --- 1. flyctl install -------------------------------------------------------
if ! command -v flyctl >/dev/null 2>&1; then
  y "flyctl not installed."
  case "$(uname)" in
    Darwin) echo "  Run: brew install flyctl" ;;
    Linux)  echo "  Run: curl -L https://fly.io/install.sh | sh" ;;
    *)      echo "  See: https://fly.io/docs/hands-on/install-flyctl/" ;;
  esac
  exit 1
fi
g "✓ flyctl installed: $(flyctl version | head -1)"

# --- 2. auth -----------------------------------------------------------------
if ! flyctl auth whoami >/dev/null 2>&1; then
  y "→ Opening browser for Fly auth (click Allow)…"
  flyctl auth login
else
  g "✓ signed in as $(flyctl auth whoami)"
fi

# --- 3. app name -------------------------------------------------------------
APP_NAME="${FLY_APP_NAME:-}"
if [ -z "$APP_NAME" ]; then
  read -rp "$(b 'Fly app name (lowercase, no spaces, must be globally unique): ')" APP_NAME
fi

if ! flyctl apps list 2>/dev/null | grep -q "^$APP_NAME"; then
  y "→ Creating Fly app: $APP_NAME"
  flyctl apps create "$APP_NAME"
else
  g "✓ app $APP_NAME already exists"
fi

# --- 4. update fly.toml ------------------------------------------------------
FLY_TOML="infra/fly/api.toml"
if grep -q "REPLACE_WITH_FLY_APP_NAME" "$FLY_TOML"; then
  y "→ Patching $FLY_TOML to use app name '$APP_NAME'"
  # macOS sed and GNU sed differ on -i; this works on both.
  sed -i.bak "s/REPLACE_WITH_FLY_APP_NAME/$APP_NAME/g" "$FLY_TOML"
  rm -f "${FLY_TOML}.bak"
  g "✓ patched. Remember to commit this change."
fi

# --- 5. secrets --------------------------------------------------------------
b "→ Setting Fly secrets. Paste each value, then Enter."
echo "  (Press Ctrl+C now to abort if you don't have these ready.)"
echo

prompt_secret() {
  local key="$1" desc="$2" current
  current="$(flyctl secrets list -a "$APP_NAME" 2>/dev/null | grep -c "^$key " || true)"
  if [ "$current" -gt 0 ]; then
    read -rp "  $key already set. Replace? (y/N): " yn
    [[ "$yn" != "y" && "$yn" != "Y" ]] && return 0
  fi
  read -rsp "  $key  ($desc): " val
  echo
  [ -z "$val" ] && { y "  (skipped — empty)"; return 0; }
  flyctl secrets set -a "$APP_NAME" "$key=$val" --stage >/dev/null
  g "  ✓ $key"
}

prompt_secret "DATABASE_URL"      "Postgres connection string (Supabase Canada Central recommended)"
prompt_secret "REDIS_URL"         "Upstash Redis URL (Toronto region)"
prompt_secret "CLERK_SECRET_KEY"  "sk_test_... or sk_live_..."
prompt_secret "WEB_URL"           "https://your-app.vercel.app (for CORS)"

echo
y "→ Optional secrets (skip with empty for path-B deploy):"
prompt_secret "ANTHROPIC_API_KEY" "sk-ant-..."
prompt_secret "NANGO_SECRET_KEY"  "Nango admin key (skip if not using OAuth integrations yet)"
prompt_secret "NANGO_WEBHOOK_SECRET" "HMAC secret for /v1/connect/webhook"
prompt_secret "SENTRY_DSN"        "https://...sentry.io/... (skip if no Sentry yet)"

# Deploy the staged secrets.
flyctl secrets deploy -a "$APP_NAME" >/dev/null 2>&1 || true

# --- 6. deploy ---------------------------------------------------------------
b "→ Deploying… (Docker build runs on Fly's remote builders)"
flyctl deploy -c "$FLY_TOML" --remote-only

# --- 7. smoke test -----------------------------------------------------------
APP_URL="https://${APP_NAME}.fly.dev"
echo
b "→ Smoke testing $APP_URL"
sleep 2

curl_check() {
  local path="$1"
  local got; got=$(curl -s -o /dev/null -w '%{http_code}' "$APP_URL$path" || echo "000")
  if [ "$got" = "200" ]; then
    g "  ✓ $path → 200"
  else
    r "  ✗ $path → $got"
  fi
}

curl_check "/health"
curl_check "/ready"

# --- 8. token for GitHub Actions --------------------------------------------
echo
b "→ Next: wire GitHub Actions to auto-deploy on push to main."
echo
y "Run the following, then paste the output into your GitHub repo:"
y "  → Settings → Secrets and variables → Actions → New repository secret"
y "  Name:  FLY_API_TOKEN"
echo
echo "    flyctl tokens create deploy -a $APP_NAME"
echo
g "Done. api: $APP_URL"
