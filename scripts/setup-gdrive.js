#!/usr/bin/env node
/**
 * Google Drive setup verification (Task 27.3).
 *
 * Usage (from repo root):
 *   node scripts/setup-gdrive.js
 *   node scripts/setup-gdrive.js --upload-test
 *   node scripts/setup-gdrive.js --env-file backend/.env
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ENV = path.join(REPO_ROOT, 'backend', '.env');

function log(msg) {
  console.log(`[setup-gdrive] ${msg}`);
}

function fail(msg) {
  console.error(`[setup-gdrive] ERROR: ${msg}`);
  process.exit(1);
}

function resolveEnvFilePath() {
  const flagIndex = process.argv.indexOf('--env-file');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return path.resolve(process.argv[flagIndex + 1]);
  }
  return DEFAULT_ENV;
}

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getIstDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

async function main() {
  const envPath = resolveEnvFilePath();
  if (!fs.existsSync(envPath)) {
    fail(`Env file not found: ${envPath}`);
  }
  loadEnvFile(envPath);

  // Ensure relative service-account paths resolve from backend/
  process.chdir(path.join(REPO_ROOT, 'backend'));

  const gdriveUrl = pathToFileURL(
    path.join(REPO_ROOT, 'backend', 'src', 'services', 'gdrive.service.js')
  ).href;

  const gdrive = await import(gdriveUrl);

  if (!gdrive.isGdriveConfigured()) {
    fail(
      'Google Drive is not configured. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH (recommended) or OAuth credentials. See backend/GDRIVE_SETUP.md'
    );
  }

  const saPath = gdrive.getServiceAccountPath();
  if (saPath) {
    log(`Service account key: ${saPath}`);
    if (!fs.existsSync(saPath)) {
      fail(`Service account JSON not found at: ${saPath}`);
    }
  } else {
    log('Using OAuth client credentials (legacy mode)');
  }

  log('Verifying Drive API connection and folder access...');
  const result = await gdrive.verifyGdriveConnection();

  log('Connection OK');
  log(`  Auth mode:     ${result.authMode}`);
  log(`  Root folder:   ${result.rootFolderName} (${result.rootFolderId})`);
  if (result.serviceAccountEmail) {
    log(`  SA email:      ${result.serviceAccountEmail}`);
  }
  if (result.driveUserEmail) {
    log(`  Drive user:    ${result.driveUserEmail}`);
  }

  if (process.argv.includes('--upload-test')) {
    const parts = getIstDateParts();
    const tmpFile = path.join(
      os.tmpdir(),
      `tikhat_gdrive_test_${Date.now()}.txt`
    );
    fs.writeFileSync(
      tmpFile,
      `Tikhat Partner Google Drive test upload\nIST date: ${parts.year}-${parts.month}-${parts.day}\n`,
      'utf8'
    );

    log(
      `Uploading test file to /${gdrive.GDRIVE_ROOT_FOLDER}/${parts.year}/${parts.month}/${parts.day}/ ...`
    );
    const upload = await gdrive.uploadBackupToDrive(tmpFile, parts);
    fs.unlinkSync(tmpFile);

    log('Test upload OK');
    log(`  File ID:       ${upload.fileId}`);
    log(`  Folder path:   ${upload.folderPath}`);
    if (upload.webViewLink) {
      log(`  View link:     ${upload.webViewLink}`);
    }
  } else {
    log('Tip: re-run with --upload-test to upload a small verification file.');
  }

  log('Google Drive setup verification complete.');
}

main().catch((err) => {
  fail(err?.message || String(err));
});
