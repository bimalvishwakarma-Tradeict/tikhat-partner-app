import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { logger } from '../utils/logger.js';

const ROOT_FOLDER_NAME = 'TikhatPartnerBackups';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

/** Files at or above this size use an explicit resumable upload session. */
const RESUMABLE_THRESHOLD_BYTES = 5 * 1024 * 1024;

/** @type {import('googleapis').drive_v3.Drive | null} */
let driveClientOverride = null;

/**
 * Inject a Drive client (tests / mocks). Pass null to clear.
 * @param {import('googleapis').drive_v3.Drive | null} client
 */
export function setDriveClient(client) {
  driveClientOverride = client;
}

/**
 * Absolute path to the service account JSON key file.
 * @returns {string | null}
 */
export function getServiceAccountPath() {
  const configured =
    process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    '';
  const trimmed = String(configured).trim();
  if (!trimmed) {
    return null;
  }
  return path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(process.cwd(), trimmed);
}

/**
 * @returns {boolean}
 */
export function isGdriveConfigured() {
  if (driveClientOverride) {
    return true;
  }

  const saPath = getServiceAccountPath();
  if (saPath && fs.existsSync(saPath)) {
    return true;
  }

  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
      process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
      process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  );
}

/**
 * @returns {Promise<{
 *   drive: import('googleapis').drive_v3.Drive,
 *   auth: { request: Function } | null
 * }>}
 */
async function createDriveSession() {
  if (driveClientOverride) {
    return { drive: driveClientOverride, auth: null };
  }

  if (!isGdriveConfigured()) {
    throw new Error(
      'Google Drive is not configured. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH to your service account JSON, or configure OAuth client id/secret/refresh token.'
    );
  }

  const saPath = getServiceAccountPath();
  if (saPath && fs.existsSync(saPath)) {
    const googleAuth = new google.auth.GoogleAuth({
      keyFile: saPath,
      scopes: [DRIVE_SCOPE],
    });
    const auth = await googleAuth.getClient();
    return {
      drive: google.drive({ version: 'v3', auth }),
      auth: /** @type {{ request: Function }} */ (auth),
    };
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
  oauth2.setCredentials({
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  });

  return {
    drive: google.drive({ version: 'v3', auth: oauth2 }),
    auth: oauth2,
  };
}

/**
 * Find a child folder by name under a parent, or create it.
 * @param {import('googleapis').drive_v3.Drive} drive
 * @param {string} name
 * @param {string | null} parentId
 * @returns {Promise<string>}
 */
async function ensureFolder(drive, name, parentId = null) {
  const escaped = String(name).replace(/'/g, "\\'");
  const parentClause = parentId
    ? `'${parentId}' in parents`
    : `'root' in parents`;

  const list = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${escaped}' and ${parentClause} and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    corpora: 'allDrives',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 10,
  });

  if (list.data.files?.length) {
    return /** @type {string} */ (list.data.files[0].id);
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  return /** @type {string} */ (created.data.id);
}

/**
 * Resolve /TikhatPartnerBackups/YYYY/MM/DD/ folder id.
 * @param {import('googleapis').drive_v3.Drive} drive
 * @param {{ year: string, month: string, day: string }} parts
 * @returns {Promise<{ dayFolderId: string, rootFolderId: string }>}
 */
async function ensureDateFolder(drive, { year, month, day }) {
  let rootId = process.env.GOOGLE_DRIVE_FOLDER_ID
    ? String(process.env.GOOGLE_DRIVE_FOLDER_ID).trim()
    : '';

  if (!rootId) {
    rootId = await ensureFolder(drive, ROOT_FOLDER_NAME, null);
  }

  const yearId = await ensureFolder(drive, year, rootId);
  const monthId = await ensureFolder(drive, month, yearId);
  const dayId = await ensureFolder(drive, day, monthId);

  return { dayFolderId: dayId, rootFolderId: rootId };
}

/**
 * Explicit Drive resumable upload (not single-shot multipart).
 * @param {{ request: Function }} auth
 * @param {object} params
 * @returns {Promise<{ id: string, webViewLink?: string | null }>}
 */
async function uploadFileResumable(auth, params) {
  const {
    fileName,
    folderId,
    localFilePath,
    fileSize,
    mimeType = 'application/gzip',
  } = params;

  const initRes = await auth.request({
    method: 'POST',
    url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id%2CwebViewLink%2CwebContentLink',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(fileSize),
    },
    data: {
      name: fileName,
      parents: [folderId],
    },
  });

  const headers = initRes.headers || {};
  const uploadUrl =
    headers.location || headers.Location || headers.LOCATION || null;

  if (!uploadUrl) {
    throw new Error('Google Drive resumable upload session URL missing');
  }

  const putRes = await auth.request({
    method: 'PUT',
    url: uploadUrl,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(fileSize),
    },
    body: fs.createReadStream(localFilePath),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const data = putRes.data || {};
  if (!data.id) {
    throw new Error('Google Drive resumable upload did not return a file id');
  }

  return {
    id: data.id,
    webViewLink: data.webViewLink || null,
  };
}

/**
 * @param {import('googleapis').drive_v3.Drive} drive
 * @param {{ request: Function } | null} auth
 * @param {object} params
 * @returns {Promise<{ id: string, webViewLink?: string | null }>}
 */
async function uploadFile(drive, auth, params) {
  const {
    fileName,
    folderId,
    localFilePath,
    fileSize,
    mimeType = 'application/gzip',
  } = params;

  if (fileSize >= RESUMABLE_THRESHOLD_BYTES) {
    if (!auth || typeof auth.request !== 'function') {
      throw new Error(
        'Resumable Google Drive upload requires an authenticated request client'
      );
    }
    logger.info('[GDrive] Using resumable upload', { fileName, fileSize });
    return uploadFileResumable(auth, {
      fileName,
      folderId,
      localFilePath,
      fileSize,
      mimeType,
    });
  }

  // Small files: googleapis stream upload (also resumable under the hood)
  const response = await drive.files.create(
    {
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: fs.createReadStream(localFilePath),
      },
      fields: 'id, webViewLink, webContentLink',
      supportsAllDrives: true,
    },
    {
      onUploadProgress: (evt) => {
        if (evt?.bytesRead != null) {
          logger.debug('[GDrive] Upload progress', {
            fileName,
            bytesRead: evt.bytesRead,
            fileSize,
          });
        }
      },
    }
  );

  return {
    id: /** @type {string} */ (response.data.id),
    webViewLink: response.data.webViewLink || null,
  };
}

/**
 * Verify Drive API auth + folder access. Creates TikhatPartnerBackups if needed.
 * @returns {Promise<{
 *   ok: boolean,
 *   authMode: 'service_account' | 'oauth' | 'override',
 *   rootFolderId: string,
 *   rootFolderName: string,
 *   serviceAccountEmail: string | null,
 *   driveUserEmail: string | null
 * }>}
 */
export async function verifyGdriveConnection() {
  const { drive } = await createDriveSession();

  let authMode = /** @type {'service_account' | 'oauth' | 'override'} */ (
    'oauth'
  );
  let serviceAccountEmail = null;

  if (driveClientOverride) {
    authMode = 'override';
  } else {
    const saPath = getServiceAccountPath();
    if (saPath && fs.existsSync(saPath)) {
      authMode = 'service_account';
      try {
        const raw = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        serviceAccountEmail = raw.client_email || null;
      } catch {
        serviceAccountEmail = null;
      }
    }
  }

  const about = await drive.about.get({
    fields: 'user(displayName,emailAddress)',
  });

  logger.info('[GDrive] Connection verified', {
    authMode,
    user: about.data.user?.emailAddress || null,
  });

  let rootId = process.env.GOOGLE_DRIVE_FOLDER_ID
    ? String(process.env.GOOGLE_DRIVE_FOLDER_ID).trim()
    : '';

  if (!rootId) {
    rootId = await ensureFolder(drive, ROOT_FOLDER_NAME, null);
  } else {
    await drive.files.get({
      fileId: rootId,
      fields: 'id, name, mimeType',
      supportsAllDrives: true,
    });
  }

  return {
    ok: true,
    authMode,
    rootFolderId: rootId,
    rootFolderName: ROOT_FOLDER_NAME,
    serviceAccountEmail,
    driveUserEmail: about.data.user?.emailAddress || null,
  };
}

/**
 * Upload a local backup file to Google Drive under
 * /TikhatPartnerBackups/YYYY/MM/DD/
 *
 * Large files use resumable upload (not a single-shot multipart body).
 *
 * @param {string} localFilePath
 * @param {{ year: number|string, month: number|string, day: number|string }} dateParts
 * @returns {Promise<{ fileId: string, webViewLink: string|null, folderPath: string }>}
 */
export async function uploadBackupToDrive(localFilePath, dateParts) {
  const year = String(dateParts.year);
  const month = String(dateParts.month).padStart(2, '0');
  const day = String(dateParts.day).padStart(2, '0');
  const folderPath = `/${ROOT_FOLDER_NAME}/${year}/${month}/${day}/`;

  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Backup file not found: ${localFilePath}`);
  }

  const { drive, auth } = await createDriveSession();
  const { dayFolderId } = await ensureDateFolder(drive, { year, month, day });
  const fileName = path.basename(localFilePath);
  const fileSize = fs.statSync(localFilePath).size;
  const mimeType = fileName.endsWith('.gz')
    ? 'application/gzip'
    : 'application/octet-stream';

  const uploaded = await uploadFile(drive, auth, {
    fileName,
    folderId: dayFolderId,
    localFilePath,
    fileSize,
    mimeType,
  });

  const fileId = uploaded.id;
  let webViewLink = uploaded.webViewLink || null;

  if (!webViewLink && fileId) {
    webViewLink = `https://drive.google.com/file/d/${fileId}/view`;
  }

  logger.info('[GDrive] Backup uploaded', {
    fileName,
    folderPath,
    fileId,
    fileSize,
    resumable: fileSize >= RESUMABLE_THRESHOLD_BYTES,
  });

  return {
    fileId,
    webViewLink,
    folderPath,
  };
}

export const GDRIVE_ROOT_FOLDER = ROOT_FOLDER_NAME;
