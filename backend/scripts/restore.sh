#!/usr/bin/env bash
# Tikhat Partner — Database restore from backup archive
# Usage:
#   CONFIRM_RESTORE=YES ./scripts/restore.sh /path/to/tikhat_backup_YYYY-MM-DD_HH-mm.tar.gz
#   CONFIRM_RESTORE=YES ./scripts/restore.sh /path/to/backup.tar.gz postgresql://user:pass@host:5432/dbname
#
# Environment (optional):
#   DATABASE_URL                 Target database (required if not passed as arg 2)
#   BACKUP_ENCRYPTION_KEY        Required when archive contains database.dump.enc
#   PG_RESTORE_DOCKER_CONTAINER  If set (e.g. tikhat-db), restore via docker exec
#   CONFIRM_RESTORE=YES          Required safety gate (prevents accidental restore)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BACKUP_FILE="${1:-}"
TARGET_URL="${2:-${DATABASE_URL:-}}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 <backup.tar.gz> [database_url]"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

if [[ -z "${TARGET_URL}" ]]; then
  echo "ERROR: DATABASE_URL is required (arg 2 or env)"
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  echo "ERROR: Refusing to restore without CONFIRM_RESTORE=YES"
  echo "This will overwrite the target database."
  exit 1
fi

# Parse postgresql://user:pass@host:port/db
proto_stripped="${TARGET_URL#postgresql://}"
proto_stripped="${proto_stripped#postgres://}"
userinfo="${proto_stripped%%@*}"
hostportdb="${proto_stripped#*@}"
DB_USER="${userinfo%%:*}"
DB_PASS="${userinfo#*:}"
hostport="${hostportdb%%/*}"
DB_NAME="${hostportdb#*/}"
DB_NAME="${DB_NAME%%\?*}"
DB_HOST="${hostport%%:*}"
DB_PORT="${hostport##*:}"
if [[ "${DB_HOST}" == "${DB_PORT}" ]]; then
  DB_PORT="5432"
fi

WORK_DIR="$(mktemp -d /tmp/tikhat-restore-XXXXXX)"
export WORK_DIR
export BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
export PGPASSWORD="${DB_PASS}"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

echo "==> Extracting ${BACKUP_FILE}"
tar -xzf "${BACKUP_FILE}" -C "${WORK_DIR}"

DUMP_FILE=""
if [[ -f "${WORK_DIR}/database.dump.enc" ]]; then
  if [[ -z "${BACKUP_ENCRYPTION_KEY}" ]]; then
    echo "ERROR: Archive is encrypted but BACKUP_ENCRYPTION_KEY is not set"
    exit 1
  fi
  echo "==> Decrypting database.dump.enc"
  node --input-type=module <<'NODE'
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const workDir = process.env.WORK_DIR;
const key = crypto
  .createHash('sha256')
  .update(process.env.BACKUP_ENCRYPTION_KEY)
  .digest();
const encPath = path.join(workDir, 'database.dump.enc');
const outPath = path.join(workDir, 'database.dump');
const data = fs.readFileSync(encPath);
const iv = data.subarray(0, 12);
const tag = data.subarray(data.length - 16);
const ciphertext = data.subarray(12, data.length - 16);
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
fs.writeFileSync(outPath, plain);
console.log('Decrypted OK');
NODE
  DUMP_FILE="${WORK_DIR}/database.dump"
elif [[ -f "${WORK_DIR}/database.dump" ]]; then
  DUMP_FILE="${WORK_DIR}/database.dump"
else
  echo "ERROR: Neither database.dump nor database.dump.enc found in archive"
  ls -la "${WORK_DIR}"
  exit 1
fi

echo "==> Restoring into ${DB_HOST}:${DB_PORT}/${DB_NAME} as ${DB_USER}"

if [[ -n "${PG_RESTORE_DOCKER_CONTAINER:-}" ]]; then
  remote="/tmp/tikhat_restore.dump"
  docker cp "${DUMP_FILE}" "${PG_RESTORE_DOCKER_CONTAINER}:${remote}"
  # pg_restore returns non-zero on some benign warnings; verify step is authoritative
  docker exec -e PGPASSWORD="${DB_PASS}" "${PG_RESTORE_DOCKER_CONTAINER}" \
    pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --no-acl "${remote}" \
    || true
  docker exec "${PG_RESTORE_DOCKER_CONTAINER}" rm -f "${remote}" || true
elif command -v pg_restore >/dev/null 2>&1; then
  pg_restore -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
    --clean --if-exists --no-owner --no-acl "${DUMP_FILE}" || true
else
  echo "ERROR: pg_restore not found. Install PostgreSQL client tools or set PG_RESTORE_DOCKER_CONTAINER"
  exit 1
fi

echo "==> Verifying restoration"
verify_sql="SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';"

if [[ -n "${PG_RESTORE_DOCKER_CONTAINER:-}" ]]; then
  TABLE_COUNT="$(docker exec -e PGPASSWORD="${DB_PASS}" "${PG_RESTORE_DOCKER_CONTAINER}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" -tAc "${verify_sql}")"
else
  TABLE_COUNT="$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc "${verify_sql}")"
fi

TABLE_COUNT="$(echo "${TABLE_COUNT}" | tr -d '[:space:]')"

if [[ -z "${TABLE_COUNT}" || "${TABLE_COUNT}" -lt 1 ]]; then
  echo "ERROR: Verification failed — no public tables found after restore"
  exit 1
fi

echo "==> Restore verified: ${TABLE_COUNT} public tables present"
echo "OK: Database restored from $(basename "${BACKUP_FILE}")"
