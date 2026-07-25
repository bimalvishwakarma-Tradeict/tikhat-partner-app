# Google Drive Backup Setup (Service Account)

This guide configures automated Tikhat Partner backups to Google Drive using a **service account**.

Backup layout:

```
TikhatPartnerBackups/
  └── YYYY/
      └── MM/
          └── DD/
              └── tikhat_backup_....gz
```

---

## 1. Create a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create (or select) a project, e.g. `tikhat-partner-backups`
3. Note the project name for later

---

## 2. Enable the Google Drive API

1. Go to **APIs & Services → Library**
2. Search for **Google Drive API**
3. Click **Enable**

---

## 3. Create a service account

1. Go to **APIs & Services → Credentials**
2. Click **Create credentials → Service account**
3. Name: `tikhat-backup-sa` (any name)
4. Click **Create and continue**
5. Role (optional for Drive file access via shared folder): skip or use Viewer
6. Click **Done**

---

## 4. Create and download the JSON key

1. Open the service account you just created
2. Tab **Keys → Add key → Create new key**
3. Choose **JSON** → **Create**
4. Store the downloaded file securely on the server, for example:

```bash
sudo mkdir -p /etc/tikhat/secrets
sudo mv ~/Downloads/tikhat-*.json /etc/tikhat/secrets/gdrive-service-account.json
sudo chown root:root /etc/tikhat/secrets/gdrive-service-account.json
sudo chmod 600 /etc/tikhat/secrets/gdrive-service-account.json
```

**Never commit this JSON to git.**

Copy the service account email (looks like):

```text
tikhat-backup-sa@YOUR_PROJECT.iam.gserviceaccount.com
```

---

## 5. Create / share the backup folder

### Option A — Recommended (folder in your Google Drive)

1. In Google Drive (your user account), create a folder named **`TikhatPartnerBackups`**
2. Right-click → **Share**
3. Add the service account email as **Editor**
4. Copy the folder ID from the URL:

```text
https://drive.google.com/drive/folders/THIS_IS_THE_FOLDER_ID
```

### Option B — Let the API create the folder

If `GOOGLE_DRIVE_FOLDER_ID` is empty, the app creates `TikhatPartnerBackups` in the service account’s own Drive.  
You must then share that folder back to a human admin (harder to find). Prefer Option A.

---

## 6. Configure `backend/.env`

```env
# Preferred (Task 27.3) — absolute path to service account JSON
GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH=/etc/tikhat/secrets/gdrive-service-account.json

# Shared TikhatPartnerBackups folder ID (Option A)
GOOGLE_DRIVE_FOLDER_ID=THIS_IS_THE_FOLDER_ID

# Still used by backup encryption locally
BACKUP_ENCRYPTION_KEY=your-long-random-encryption-key
BACKUP_PATH=./backups
```

Optional aliases:

| Variable | Purpose |
|----------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Same as service account path (Google standard) |
| `GOOGLE_DRIVE_CLIENT_ID` / `SECRET` / `REFRESH_TOKEN` | Legacy OAuth mode (still supported) |

---

## 7. Verify the connection

From the repository root:

```bash
node scripts/setup-gdrive.js
```

Expected output includes:

- Auth mode: `service_account`
- Root folder: `TikhatPartnerBackups` + folder id

Upload a tiny test file into today’s IST date folder:

```bash
node scripts/setup-gdrive.js --upload-test
```

Then open Google Drive → `TikhatPartnerBackups/YYYY/MM/DD/` and confirm the test file.

---

## 8. Production checklist

- [ ] Drive API enabled
- [ ] Service account JSON on server with `chmod 600`
- [ ] `GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH` set
- [ ] Folder shared with service account as Editor
- [ ] `GOOGLE_DRIVE_FOLDER_ID` set to that folder
- [ ] `node scripts/setup-gdrive.js --upload-test` succeeds
- [ ] PM2 restarted after env changes: `pm2 restart tikhat-backend`

Daily backups (12:00 AM IST) will then upload large archives with **resumable upload** under the date folders.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Google Drive is not configured` | Set `GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH` and ensure the file exists |
| `File not found` / 404 on folder | Share `TikhatPartnerBackups` with the SA email; check `GOOGLE_DRIVE_FOLDER_ID` |
| `Insufficient Permission` | Re-share folder as **Editor**; confirm Drive API is enabled |
| Upload stalls on large files | Resumable upload is used automatically for files ≥ 5MB; check outbound HTTPS to `googleapis.com` |
| Works locally, fails on server | Confirm absolute path + file permissions for the JSON key |

---

## Security notes

- Treat the JSON key like a password
- Restrict filesystem permissions (`600`)
- Prefer a dedicated GCP project for backups only
- Rotate keys if the file may have been exposed
- Do not put the JSON inside the git repo or `/var/www`
