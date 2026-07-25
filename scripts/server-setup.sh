#!/usr/bin/env bash
# Tikhat Partner — Ubuntu 24.04 server setup
# Installs: Node.js 20 LTS, PostgreSQL 16, Nginx, PM2 (+ log rotation)
# Usage (as root or with sudo):
#   chmod +x scripts/server-setup.sh
#   sudo ./scripts/server-setup.sh

set -euo pipefail

APP_NAME="tikhat-partner"
WEB_ROOT="/var/www/tikhat"
APP_USER="${SUDO_USER:-$USER}"
DB_NAME="tikhat_partner"
DB_USER="tikhat"
DB_PASSWORD="${TIKHAT_DB_PASSWORD:-}"

log() { echo "[server-setup] $*"; }
fail() { echo "[server-setup] ERROR: $*" >&2; exit 1; }

if [[ "${EUID}" -ne 0 ]]; then
  fail "Run as root (sudo ./scripts/server-setup.sh)"
fi

export DEBIAN_FRONTEND=noninteractive

log "Updating apt packages..."
apt-get update -y
apt-get upgrade -y

log "Installing base packages..."
apt-get install -y \
  curl \
  ca-certificates \
  gnupg \
  lsb-release \
  software-properties-common \
  build-essential \
  git \
  ufw \
  unzip \
  openssl

# ---------------------------------------------------------------------------
# Node.js 20 LTS
# ---------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  log "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  log "Node.js already installed: $(node -v)"
fi

node -v
npm -v

# ---------------------------------------------------------------------------
# PostgreSQL 16
# ---------------------------------------------------------------------------
if ! command -v psql >/dev/null 2>&1; then
  log "Installing PostgreSQL 16..."
  apt-get install -y postgresql postgresql-contrib
else
  log "PostgreSQL already installed: $(psql --version)"
fi

systemctl enable postgresql
systemctl start postgresql

if [[ -z "${DB_PASSWORD}" ]]; then
  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '=+/')"
  log "Generated DB password (save this): ${DB_PASSWORD}"
fi

log "Ensuring database role and database exist..."
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

# ---------------------------------------------------------------------------
# Nginx
# ---------------------------------------------------------------------------
if ! command -v nginx >/dev/null 2>&1; then
  log "Installing Nginx..."
  apt-get install -y nginx
else
  log "Nginx already installed: $(nginx -v 2>&1)"
fi

systemctl enable nginx
mkdir -p "${WEB_ROOT}"
chown -R www-data:www-data "${WEB_ROOT}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
NGINX_SRC="${REPO_ROOT}/nginx/tikhat.conf"

if [[ -f "${NGINX_SRC}" ]]; then
  log "Installing Nginx site config from ${NGINX_SRC}..."
  cp "${NGINX_SRC}" /etc/nginx/sites-available/tikhat.conf
  ln -sfn /etc/nginx/sites-available/tikhat.conf /etc/nginx/sites-enabled/tikhat.conf
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
else
  log "WARNING: ${NGINX_SRC} not found — skip Nginx site install"
fi

# ---------------------------------------------------------------------------
# PM2 (global) + log rotation + startup on reboot
# ---------------------------------------------------------------------------
log "Installing PM2 globally..."
npm install -g pm2

log "Configuring PM2 log rotation..."
pm2 install pm2-logrotate || true
pm2 set pm2-logrotate:max_size 20M || true
pm2 set pm2-logrotate:retain 30 || true
pm2 set pm2-logrotate:compress true || true

log "Configuring PM2 to start on reboot..."
# Generate startup unit for the invoking (non-root) user when possible
if [[ -n "${APP_USER}" && "${APP_USER}" != "root" ]]; then
  su - "${APP_USER}" -c "pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER}" || true
else
  pm2 startup systemd -u root --hp /root || true
fi

# ---------------------------------------------------------------------------
# App directories
# ---------------------------------------------------------------------------
mkdir -p "${WEB_ROOT}"
mkdir -p /var/log/tikhat

log "============================================================"
log "Server setup complete"
log "Node:        $(node -v)"
log "npm:         $(npm -v)"
log "PostgreSQL:  $(psql --version)"
log "Nginx:       $(nginx -v 2>&1)"
log "PM2:         $(pm2 -v)"
log "Web root:    ${WEB_ROOT}"
log "Database:    ${DB_NAME} (user: ${DB_USER})"
log "Next steps:"
log "  1. Clone/copy the app to the server"
log "  2. Create backend/.env (see README.md)"
log "  3. Place TLS certs or run Certbot (see README.md)"
log "  4. Run: ./scripts/deploy.sh"
log "============================================================"
