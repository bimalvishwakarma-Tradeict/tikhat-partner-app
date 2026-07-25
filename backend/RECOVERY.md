# Tikhat Partner — Backup Recovery Guide

This document explains how to restore the PostgreSQL database from a local or Google Drive backup, and how to deploy the backend on a new Ubuntu server.

---

## 1. Backup layout

Daily and manual backups are created by `src/services/backup.service.js`.

| Item | Value |
|------|--------|
| Local folder | `backend/backups/` (or `BACKUP_PATH`) |
| Filename | `tikhat_backup_YYYY-MM-DD_HH-mm.tar.gz` |
| Local retention | 30 days (older files auto-deleted) |
| Google Drive path | `/TikhatPartnerBackups/YYYY/MM/DD/` |
| Schedule | 12:00 AM IST daily (`backup.cron.js`) |

### Archive contents

| File | Description |
|------|-------------|
| `database.dump` | Unencrypted `pg_dump -Fc` custom-format dump (only when encryption key is missing) |
| `database.dump.enc` | AES-256-GCM encrypted dump (when `BACKUP_ENCRYPTION_KEY` is set) |
| `backup-meta.json` | Metadata: timestamp, trigger, encrypted flag, database name |

Encryption format for `.enc`: `iv (12 bytes) + ciphertext + authTag (16 bytes)`.

---

## 2. Restore from a backup file

### Prerequisites

- Ubuntu 22.04+ (or compatible) with PostgreSQL 16 client tools **or** Docker access to the `postgres:16` container
- The backup `.tar.gz` file (from local disk or downloaded from Google Drive)
- `DATABASE_URL` for the **target** database
- `BACKUP_ENCRYPTION_KEY` if the archive contains `database.dump.enc`
- Safety gate: `CONFIRM_RESTORE=YES`

### Steps

1. Stop the API / PM2 process so nothing writes during restore:

```bash
pm2 stop tikhat-partner-api || true
```

2. Copy the backup onto the server (example from Google Drive download):

```bash
mkdir -p /var/backups/tikhat
# place tikhat_backup_YYYY-MM-DD_HH-mm.tar.gz in that folder
```

3. Run the restore script from the backend directory:

```bash
cd /opt/tikhat-partner/backend   # adjust to your deploy path

chmod +x scripts/restore.sh

export DATABASE_URL="postgresql://tikhat:YOUR_PASSWORD@127.0.0.1:5432/tikhat_partner"
export BACKUP_ENCRYPTION_KEY="your-production-encryption-key"
export CONFIRM_RESTORE=YES

# If pg_restore is not installed locally but Postgres runs in Docker:
export PG_RESTORE_DOCKER_CONTAINER=tikhat-db

./scripts/restore.sh /var/backups/tikhat/tikhat_backup_2026-07-23_00-00.tar.gz
```

4. On success the script prints table count verification, for example:

```text
==> Restore verified: 28 public tables present
OK: Database restored from tikhat_backup_2026-07-23_00-00.tar.gz
```

5. Restart the API:

```bash
pm2 start tikhat-partner-api
# or
pm2 restart tikhat-partner-api
```

6. Confirm health:

```bash
curl -s http://127.0.0.1:5000/api/health | jq
```

Expected shape:

```json
{
  "success": true,
  "message": "Server running",
  "server": "ok",
  "database": "ok",
  "crons": {
    "revenue": "active",
    "unlock": "active",
    "backup": "active",
    "summary": "active",
    "escalation": "active",
    "roiAlert": "active",
    "withdrawal": "active"
  }
}
```

### Manual restore (without the script)

```bash
tar -xzf tikhat_backup_YYYY-MM-DD_HH-mm.tar.gz -C /tmp/tikhat-restore
# decrypt database.dump.enc → database.dump if needed (AES-256-GCM)
export PGPASSWORD='...'
pg_restore -h 127.0.0.1 -U tikhat -d tikhat_partner \
  --clean --if-exists --no-owner --no-acl \
  /tmp/tikhat-restore/database.dump
```

---

## 3. Deploy on a new Ubuntu server

### 3.1 System packages

```bash
sudo apt update
sudo apt install -y curl git nginx build-essential
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 3.2 PostgreSQL 16

Option A — native install, or Option B — Docker:

```bash
docker run -d --name tikhat-db --restart unless-stopped \
  -e POSTGRES_USER=tikhat \
  -e POSTGRES_PASSWORD=CHANGE_ME \
  -e POSTGRES_DB=tikhat_partner \
  -p 5432:5432 \
  -v tikhat_pgdata:/var/lib/postgresql/data \
  postgres:16
```

Ensure `pg_dump` / `pg_restore` are available on the host **or** set:

```bash
PG_DUMP_DOCKER_CONTAINER=tikhat-db
PG_RESTORE_DOCKER_CONTAINER=tikhat-db
```

### 3.3 Application code

```bash
sudo mkdir -p /opt/tikhat-partner
sudo chown "$USER":"$USER" /opt/tikhat-partner
cd /opt/tikhat-partner
git clone <YOUR_REPO_URL> .
cd backend
npm ci --omit=dev
```

### 3.4 Environment

Create `backend/.env` with at least:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://tikhat:CHANGE_ME@127.0.0.1:5432/tikhat_partner
JWT_SECRET=...
JWT_REFRESH_SECRET=...
RESEND_API_KEY=...
FRONTEND_URL=https://tikhatpartner.online
UPLOAD_PATH=./uploads
BACKUP_PATH=./backups
LOG_PATH=./logs
BACKUP_ENCRYPTION_KEY=long-random-secret
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REFRESH_TOKEN=...
GOOGLE_DRIVE_FOLDER_ID=...   # optional root for TikhatPartnerBackups
SUPER_ADMIN_EMAIL=...
SUPER_ADMIN_PASSWORD=...
SUPER_ADMIN_NAME=Super Admin
```

### 3.5 Database schema + seed

```bash
npm run migrate
npm run seed
```

Or restore from a production backup (Section 2) instead of empty migrate/seed.

### 3.6 Directories & PM2

```bash
mkdir -p uploads backups logs
pm2 start server.js --name tikhat-partner-api
pm2 save
pm2 startup
```

### 3.7 Nginx + Cloudflare SSL

Point Nginx `proxy_pass` to `http://127.0.0.1:5000`. Terminate SSL at Cloudflare (Flexible/Full as per your setup). Ensure `trust proxy` remains enabled (already set in `src/app.js`).

### 3.8 Post-deploy checks

1. `GET /api/health` → `server`, `database`, and all 7 crons `active`
2. Super Admin login
3. Trigger manual backup: `POST /api/v1/admin/settings/backup`
4. Confirm file under `backups/` and Drive folder `/TikhatPartnerBackups/YYYY/MM/DD/`

---

## 4. Cron startup order

Registered in `server.js` via `registerAllCrons()`:

1. `unlock` — account auto-unlock (12:00 AM IST)
2. `backup` — database backup (12:00 AM IST)
3. `withdrawal` — pending withdrawal reminders
4. `revenue` — daily revenue credit (admin-configured time)
5. `roiAlert` — ROI term expiry alerts
6. `escalation` — support ticket escalation
7. `summary` — monthly summary emails (1st of month)

Email retry runs after these (delivery monitoring; not part of the health core-7 set).

---

## 5. Failure alerts

| Failure | Behaviour |
|---------|-----------|
| Local `pg_dump` / archive failure | Admin email: “Database backup failed” |
| Google Drive upload failure | Local file kept; separate admin email: “Google Drive backup upload failed” |

Check `email_logs` and `cron_job_logs` (`job_name = database_backup`) for history.

---

## 6. Security notes

- Never commit `.env`, Drive tokens, or `BACKUP_ENCRYPTION_KEY`
- Restrict filesystem permissions on `backups/` (`chmod 750`)
- Prefer encrypted archives in production (`BACKUP_ENCRYPTION_KEY` required)
- Treat Google Drive backups as permanent retention; local copies are short-term only
