# Tikhat Partner App

Enterprise investor management platform for Tikhat Foods.

**Domain:** https://tikhatpartner.online  
**Stack:** React Native (Expo) · Node.js 20 · Express · PostgreSQL 16 · Nginx · PM2 · Cloudflare

---

## Prerequisites

| Component | Version / notes |
|-----------|-----------------|
| Server OS | Ubuntu 24.04 LTS (recommended) |
| Node.js | 20 LTS |
| PostgreSQL | 16 |
| Nginx | Latest from apt |
| PM2 | Latest (global npm install) |
| Domain + DNS | `tikhatpartner.online` (Cloudflare) |
| TLS | Cloudflare Origin Cert or Let's Encrypt |
| Email | Resend.com API key |
| Backups | Google Drive API OAuth credentials |

Local development also works on Windows/macOS with Node 20 + PostgreSQL 16.

---

## Repository layout

```
tikhat-partner-app/
├── frontend/          # Expo (React Native) app
├── backend/           # Express API + cron jobs
├── database/          # SQL migrations
├── nginx/             # Nginx site config
├── scripts/           # Server setup & deploy
└── README.md
```

---

## Step-by-step deployment (production)

### 1. Provision the server

```bash
# On a fresh Ubuntu 24.04 VPS (as root)
git clone <YOUR_REPO_URL> /opt/tikhat-partner
cd /opt/tikhat-partner
chmod +x scripts/server-setup.sh scripts/deploy.sh
sudo ./scripts/server-setup.sh
```

This installs Node.js 20, PostgreSQL 16, Nginx, and PM2 (with log rotation + reboot startup).

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env   # or create manually
nano backend/.env
```

Fill every required variable (see [Environment variables](#environment-variables) below).  
Then validate:

```bash
node scripts/validate-env.js
```

### 3. TLS certificates

Place certificates where Nginx expects them (see `nginx/tikhat.conf`):

- `/etc/ssl/certs/tikhatpartner.pem`
- `/etc/ssl/private/tikhatpartner.key`

Or use Certbot:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tikhatpartner.online -d www.tikhatpartner.online
# Then update nginx/tikhat.conf paths to Certbot live certs if needed
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Deploy application

```bash
./scripts/deploy.sh
```

The deploy script will:

1. Pull latest code  
2. Install backend + frontend dependencies  
3. Validate env  
4. Run database migrations  
5. Build frontend web (`expo export --platform web`)  
6. Copy build to `/var/www/tikhat/`  
7. Restart PM2 cluster  
8. Health-check `GET /api/health`

### 5. Verify

```bash
curl -sS https://tikhatpartner.online/api/health
pm2 status
sudo nginx -t
```

---

## Environment variables

Create `backend/.env` (never commit this file):

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` or `development` |
| `PORT` | Yes | API port (default `5000`) |
| `DATABASE_URL` | Yes | `postgresql://user:pass@host:5432/tikhat_partner` |
| `JWT_SECRET` | Yes | Strong random secret (access tokens) |
| `JWT_REFRESH_SECRET` | Yes | Strong random secret (refresh tokens) |
| `RESEND_API_KEY` | Yes | Resend.com API key |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH` | Yes* | Path to service account JSON (preferred) |
| `GOOGLE_DRIVE_FOLDER_ID` | Yes* | Shared `TikhatPartnerBackups` folder ID |
| `GOOGLE_DRIVE_CLIENT_ID` | Alt* | Legacy OAuth client ID |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Alt* | Legacy OAuth client secret |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Alt* | Legacy OAuth refresh token |
| `BACKUP_ENCRYPTION_KEY` | Yes* | 32+ char key for backup encryption |
| `FRONTEND_URL` | Yes | `https://tikhatpartner.online` |
| `UPLOAD_PATH` | Yes | e.g. `./uploads` |
| `BACKUP_PATH` | Yes | e.g. `./backups` |
| `LOG_PATH` | Yes | e.g. `./logs` |
| `SUPER_ADMIN_EMAIL` | Seed | Used by `npm run seed` |
| `SUPER_ADMIN_PASSWORD` | Seed | Used by `npm run seed` |
| `SUPER_ADMIN_NAME` | Seed | Used by `npm run seed` |

\*Required in production (validated by `scripts/validate-env.js`). Prefer service account path; OAuth trio is an accepted alternative.

Frontend build (set before `expo export`):

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_API_URL` | API base URL, e.g. `https://tikhatpartner.online/api/v1` |

---

## Local development

```bash
# Backend
cd backend
cp .env.example .env   # if available
npm install
npm run migrate
npm run seed           # optional Super Admin
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
# Create .env with EXPO_PUBLIC_API_URL=http://localhost:5000/api/v1
npx expo start
```

---

## Nginx

Config file: `nginx/tikhat.conf`

- Frontend static files from `/var/www/tikhat/`
- `/api/` proxied to `http://127.0.0.1:5000`
- HTTP → HTTPS redirect
- Gzip enabled
- `client_max_body_size 5m` (matches upload limit)

```bash
sudo cp nginx/tikhat.conf /etc/nginx/sites-available/tikhat.conf
sudo ln -sfn /etc/nginx/sites-available/tikhat.conf /etc/nginx/sites-enabled/tikhat.conf
sudo nginx -t
sudo systemctl reload nginx
```

---

## PM2

Config: `backend/ecosystem.config.js` (ESM; `ecosystem.config.cjs` available as CommonJS fallback)

- `exec_mode: cluster`
- `instances: 2`
- Auto-restart + memory limit
- Logs: `backend/logs/pm2-*.log`
- Log rotation via `pm2-logrotate` (installed by `server-setup.sh`)

```bash
cd backend
pm2 start ecosystem.config.js --env production
# If PM2 cannot load ESM config:
# pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup   # enable on reboot (follow printed command)
```

---

## Backup setup guide

Daily backups run at **12:00 AM IST** via the backup cron.

### Local backups

1. Set `BACKUP_PATH` (e.g. `./backups`) and `BACKUP_ENCRYPTION_KEY` in `.env`
2. Ensure `pg_dump` is on `PATH` (PostgreSQL client tools)
3. Local encrypted archives are retained for 30 days under `BACKUP_PATH`

### Google Drive backups

1. Create a Google Cloud project and enable **Google Drive API**
2. Create OAuth credentials (Desktop / Web) and obtain a refresh token
3. Set in `.env`:
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`
   - `GOOGLE_DRIVE_REFRESH_TOKEN`
   - `GOOGLE_DRIVE_FOLDER_ID` (shared folder the app can write to)
4. Restart PM2 after updating env
5. Verify with the setup script from Task 27.3 (`scripts/setup-gdrive.js`) once available

### Manual restore

See `backend/scripts/restore.sh` and related recovery docs when restoring from a local or Drive backup.

---

## Useful commands

```bash
# Validate env
node scripts/validate-env.js

# Performance observation (Task 28.3)
cd backend && node scripts/performance-check.js

# Deploy
./scripts/deploy.sh

# Migrations only
cd backend && npm run migrate

# Tests
cd backend && npm test

# PM2
pm2 status
pm2 logs tikhat-backend
pm2 restart tikhat-backend

# Health (with server running via PM2 / npm start)
curl -sS http://127.0.0.1:5000/api/health
```

---

## Security notes

- Never commit `.env`, certificates, or Google credentials
- All financial routes require auth; admin routes require role middleware
- File uploads are MIME + size checked server-side (max 5MB)
- Production API errors never return stack traces

---

## License

Proprietary — Tikhat Foods. All rights reserved.
