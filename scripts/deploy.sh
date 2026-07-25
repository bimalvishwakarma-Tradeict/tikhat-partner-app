#!/usr/bin/env bash
# Tikhat Partner — full deployment script
# Pulls latest code, installs deps, migrates DB, builds frontend web,
# copies static assets to Nginx web root, restarts PM2, health-checks API.
#
# Usage (from repo root):
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"
FRONTEND_DIR="${REPO_ROOT}/frontend"
WEB_ROOT="${TIKHAT_WEB_ROOT:-/var/www/tikhat}"
API_HEALTH_URL="${TIKHAT_HEALTH_URL:-http://127.0.0.1:5000/api/health}"
EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://tikhatpartner.online/api/v1}"
PM2_APP_NAME="tikhat-backend"

log() { echo "[deploy] $*"; }
fail() { echo "[deploy] ERROR: $*" >&2; exit 1; }

cd "${REPO_ROOT}"

log "Repository: ${REPO_ROOT}"

# ---------------------------------------------------------------------------
# 1. Pull latest code
# ---------------------------------------------------------------------------
if [[ -d "${REPO_ROOT}/.git" ]]; then
  log "Pulling latest code..."
  git pull --ff-only
else
  log "No git repository detected — skip pull"
fi

# ---------------------------------------------------------------------------
# 2. Validate environment
# ---------------------------------------------------------------------------
log "Validating environment variables..."
if [[ ! -f "${BACKEND_DIR}/.env" ]]; then
  fail "Missing ${BACKEND_DIR}/.env — create it before deploying"
fi
node "${SCRIPT_DIR}/validate-env.js" --env-file "${BACKEND_DIR}/.env"

# ---------------------------------------------------------------------------
# 3. Install dependencies
# ---------------------------------------------------------------------------
log "Installing backend dependencies..."
cd "${BACKEND_DIR}"
npm install --omit=dev

log "Installing frontend dependencies..."
cd "${FRONTEND_DIR}"
npm install

# ---------------------------------------------------------------------------
# 4. Run migrations
# ---------------------------------------------------------------------------
log "Running database migrations..."
cd "${BACKEND_DIR}"
npm run migrate

# ---------------------------------------------------------------------------
# 5. Build frontend (web)
# ---------------------------------------------------------------------------
log "Building frontend for web (expo export --platform web)..."
cd "${FRONTEND_DIR}"
export EXPO_PUBLIC_API_URL
npx expo export --platform web

DIST_DIR=""
if [[ -d "${FRONTEND_DIR}/dist" ]]; then
  DIST_DIR="${FRONTEND_DIR}/dist"
elif [[ -d "${FRONTEND_DIR}/web-build" ]]; then
  DIST_DIR="${FRONTEND_DIR}/web-build"
else
  fail "Frontend build output not found (expected dist/ or web-build/)"
fi

# ---------------------------------------------------------------------------
# 6. Copy build to Nginx web root
# ---------------------------------------------------------------------------
log "Copying frontend build to ${WEB_ROOT}..."
mkdir -p "${WEB_ROOT}"
rsync -a --delete "${DIST_DIR}/" "${WEB_ROOT}/" 2>/dev/null || {
  rm -rf "${WEB_ROOT:?}/"*
  cp -a "${DIST_DIR}/." "${WEB_ROOT}/"
}
if command -v chown >/dev/null 2>&1; then
  chown -R www-data:www-data "${WEB_ROOT}" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 7. Restart PM2
# ---------------------------------------------------------------------------
log "Restarting PM2 (${PM2_APP_NAME})..."
cd "${BACKEND_DIR}"
mkdir -p "${BACKEND_DIR}/logs"

# Prefer CommonJS twin when present (reliable with package.json "type":"module")
ECOSYSTEM_FILE="ecosystem.config.js"
if [[ -f ecosystem.config.cjs ]]; then
  ECOSYSTEM_FILE="ecosystem.config.cjs"
fi

if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  pm2 reload "${ECOSYSTEM_FILE}" --env production || pm2 restart "${PM2_APP_NAME}"
else
  pm2 start "${ECOSYSTEM_FILE}" --env production
fi
pm2 save

# ---------------------------------------------------------------------------
# 8. Health check
# ---------------------------------------------------------------------------
log "Waiting for API health check: ${API_HEALTH_URL}"
ATTEMPTS=30
SLEEP_SECS=2
OK=0
for ((i = 1; i <= ATTEMPTS; i++)); do
  if curl -fsS "${API_HEALTH_URL}" >/tmp/tikhat-health.json 2>/dev/null; then
    OK=1
    break
  fi
  sleep "${SLEEP_SECS}"
done

if [[ "${OK}" -ne 1 ]]; then
  fail "Health check failed after $((ATTEMPTS * SLEEP_SECS))s — ${API_HEALTH_URL}"
fi

log "Health check OK:"
cat /tmp/tikhat-health.json || true
echo
log "Deploy complete."
