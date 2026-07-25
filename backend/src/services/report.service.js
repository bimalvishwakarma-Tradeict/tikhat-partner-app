import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { formatCurrency } from '../utils/formatCurrency.js';
import { formatDate } from '../utils/formatDate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BRAND_NAME = 'Tikhat Partner';
const COMPANY_NAME = 'Tikhat Foods';
const DOMAIN = 'tikhatpartner.online';

const CAPITAL_DONE = Object.freeze(['approved', 'completed', 'processed']);
const WITHDRAW_DONE = Object.freeze(['approved', 'processed', 'completed']);

const LOGO_CANDIDATES = [
  path.join(__dirname, '../../assets/logo.png'),
  path.join(__dirname, '../../assets/tikhat-partner-logo.png'),
  path.join(__dirname, '../../../frontend/assets/logo.png'),
];

/**
 * @param {unknown} value
 * @returns {number}
 */
function toWholeInt(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return n;
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
export function parseReportDate(value, fieldName) {
  if (value == null || value === '') {
    const err = new Error(`${fieldName} is required (YYYY-MM-DD)`);
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const err = new Error(`${fieldName} must be YYYY-MM-DD`);
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }
  return s;
}

/**
 * Indian FY: year Y → 01 Apr Y to 31 Mar Y+1
 * @param {unknown} yearValue
 * @returns {{ from: string, to: string, label: string, year: number }}
 */
export function getFinancialYearBounds(yearValue) {
  const year = Math.round(Number(yearValue));
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    const err = new Error('year must be a valid financial year start (e.g. 2024)');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }
  return {
    year,
    from: `${year}-04-01`,
    to: `${year + 1}-03-31`,
    label: `FY ${year}-${String(year + 1).slice(-2)}`,
  };
}

/**
 * @returns {string | null}
 */
function resolveLogoPath() {
  for (const candidate of LOGO_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Opening total balance (capital + revenue) before fromDate (IST date).
 * Mirrors balance.service capital + revenue formulas as-of day before `from`.
 * @param {string} investorId
 * @param {string} fromDate
 * @returns {Promise<number>}
 */
async function getOpeningTotalBalance(investorId, fromDate) {
  const [capCredits, capTxWdr, capWdrReq, revCredit, revWdr] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN type IN ('deposit', 'admin_credit') THEN amount
           WHEN type = 'admin_debit' THEN -amount
           ELSE 0
         END
       ), 0)::INTEGER AS net
       FROM capital_transactions
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])
         AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $3::date`,
      [investorId, ['approved', 'completed'], fromDate]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
       FROM capital_transactions
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND type = 'withdrawal'
         AND status = ANY($2::TEXT[])
         AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $3::date`,
      [investorId, [...WITHDRAW_DONE], fromDate]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
       FROM capital_withdrawal_requests
       WHERE investor_id = $1
         AND account_type = 'capital'
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])
         AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $3::date`,
      [investorId, [...WITHDRAW_DONE], fromDate]
    ),
    query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN credit_type IN ('daily_auto', 'manual_credit', 'backdate') THEN amount
           WHEN credit_type = 'manual_debit' THEN -amount
           ELSE 0
         END
       ), 0)::INTEGER AS net
       FROM revenue_credits
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND is_reversed = FALSE
         AND credit_date < $2::date`,
      [investorId, fromDate]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0)::INTEGER AS deducted
       FROM capital_withdrawal_requests
       WHERE investor_id = $1
         AND account_type = 'revenue'
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])
         AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) < $3::date`,
      [investorId, [...WITHDRAW_DONE], fromDate]
    ),
  ]);

  const capital =
    toWholeInt(capCredits.rows[0]?.net) -
    toWholeInt(capTxWdr.rows[0]?.deducted) -
    toWholeInt(capWdrReq.rows[0]?.deducted);

  const revenue =
    toWholeInt(revCredit.rows[0]?.net) - toWholeInt(revWdr.rows[0]?.deducted);

  return Math.max(0, Math.round(capital + revenue));
}

/**
 * Build statement rows for investor in [from, to].
 * @param {string} investorId
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {Promise<{ openingBalance: number, rows: object[], closingBalance: number }>}
 */
export async function buildInvestorStatement(investorId, fromDate, toDate) {
  const [capitalRows, revenueRows, withdrawRows] = await Promise.all([
    query(
      `SELECT
         transaction_id,
         type,
         amount,
         status,
         remark,
         COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) AS txn_date,
         created_at
       FROM capital_transactions
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])
         AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date)
             BETWEEN $3::date AND $4::date
       ORDER BY txn_date ASC, created_at ASC`,
      [investorId, [...CAPITAL_DONE], fromDate, toDate]
    ),
    query(
      `SELECT
         transaction_id,
         credit_type,
         amount,
         credit_date AS txn_date,
         created_at
       FROM revenue_credits
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND is_reversed = FALSE
         AND credit_date BETWEEN $2::date AND $3::date
       ORDER BY credit_date ASC, created_at ASC`,
      [investorId, fromDate, toDate]
    ),
    query(
      `SELECT
         transaction_id,
         account_type,
         amount,
         status,
         COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date) AS txn_date,
         created_at
       FROM capital_withdrawal_requests
       WHERE investor_id = $1
         AND is_deleted = FALSE
         AND status = ANY($2::TEXT[])
         AND COALESCE(payment_date, (created_at AT TIME ZONE 'Asia/Kolkata')::date)
             BETWEEN $3::date AND $4::date
       ORDER BY txn_date ASC, created_at ASC`,
      [investorId, [...WITHDRAW_DONE], fromDate, toDate]
    ),
  ]);

  /** @type {object[]} */
  const events = [];

  for (const row of capitalRows.rows) {
    const isCredit = row.type === 'deposit' || row.type === 'admin_credit';
    const isDebit = row.type === 'withdrawal' || row.type === 'admin_debit';
    events.push({
      date: row.txn_date,
      created_at: row.created_at,
      description: `Capital ${row.type.replace('_', ' ')} (${row.transaction_id})`,
      credit: isCredit ? toWholeInt(row.amount) : 0,
      debit: isDebit ? toWholeInt(row.amount) : 0,
      reference: row.transaction_id,
    });
  }

  for (const row of revenueRows.rows) {
    const isDebit = row.credit_type === 'manual_debit';
    events.push({
      date: row.txn_date,
      created_at: row.created_at,
      description: `Revenue ${row.credit_type.replace('_', ' ')} (${row.transaction_id})`,
      credit: isDebit ? 0 : toWholeInt(row.amount),
      debit: isDebit ? toWholeInt(row.amount) : 0,
      reference: row.transaction_id,
    });
  }

  for (const row of withdrawRows.rows) {
    // Capital withdrawals may also appear in capital_transactions — skip capital account
    // request rows if a matching capital_transactions withdrawal exists; include revenue.
    if (row.account_type === 'capital') {
      const dup = capitalRows.rows.some(
        (c) =>
          c.type === 'withdrawal' &&
          c.transaction_id === row.transaction_id
      );
      if (dup) continue;
    }
    events.push({
      date: row.txn_date,
      created_at: row.created_at,
      description: `${row.account_type === 'revenue' ? 'Revenue' : 'Capital'} withdrawal (${row.transaction_id})`,
      credit: 0,
      debit: toWholeInt(row.amount),
      reference: row.transaction_id,
    });
  }

  events.sort((a, b) => {
    const da = String(a.date);
    const db = String(b.date);
    if (da !== db) return da < db ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  let balance = await getOpeningTotalBalance(investorId, fromDate);
  const openingBalance = balance;

  const rows = events.map((e) => {
    balance = Math.round(balance + e.credit - e.debit);
    return {
      date: e.date,
      date_formatted: formatDate(e.date),
      description: e.description,
      credit: e.credit,
      debit: e.debit,
      balance,
      credit_formatted: e.credit ? formatCurrency(e.credit) : '—',
      debit_formatted: e.debit ? formatCurrency(e.debit) : '—',
      balance_formatted: formatCurrency(balance),
      reference: e.reference,
    };
  });

  return {
    openingBalance,
    openingBalanceFormatted: formatCurrency(openingBalance),
    rows,
    closingBalance: balance,
    closingBalanceFormatted: formatCurrency(balance),
  };
}

/**
 * Capital movements across all investors in range.
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {Promise<object[]>}
 */
export async function buildCapitalReportRows(fromDate, toDate) {
  const result = await query(
    `SELECT
       ct.transaction_id,
       ct.investor_id,
       u.full_name AS investor_name,
       u.email AS investor_email,
       ct.type,
       ct.amount,
       ct.status,
       COALESCE(ct.payment_date, (ct.created_at AT TIME ZONE 'Asia/Kolkata')::date) AS txn_date,
       ct.created_at
     FROM capital_transactions ct
     INNER JOIN users u ON u.id = ct.investor_id
     WHERE ct.is_deleted = FALSE
       AND COALESCE(ct.payment_date, (ct.created_at AT TIME ZONE 'Asia/Kolkata')::date)
           BETWEEN $1::date AND $2::date
     ORDER BY txn_date ASC, ct.created_at ASC`,
    [fromDate, toDate]
  );

  return result.rows.map((row) => ({
    date: row.txn_date,
    date_formatted: formatDate(row.txn_date),
    transaction_id: row.transaction_id,
    investor_name: row.investor_name,
    investor_email: row.investor_email,
    type: row.type,
    amount: toWholeInt(row.amount),
    amount_formatted: formatCurrency(toWholeInt(row.amount)),
    status: row.status,
  }));
}

/**
 * Revenue credits across all investors in range.
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {Promise<object[]>}
 */
export async function buildRevenueReportRows(fromDate, toDate) {
  const result = await query(
    `SELECT
       rc.transaction_id,
       rc.investor_id,
       u.full_name AS investor_name,
       u.email AS investor_email,
       rc.credit_type,
       rc.amount,
       rc.credit_date,
       rc.roi_percentage_applied,
       rc.created_at
     FROM revenue_credits rc
     INNER JOIN users u ON u.id = rc.investor_id
     WHERE rc.is_deleted = FALSE
       AND rc.is_reversed = FALSE
       AND rc.credit_date BETWEEN $1::date AND $2::date
     ORDER BY rc.credit_date ASC, rc.created_at ASC`,
    [fromDate, toDate]
  );

  return result.rows.map((row) => ({
    date: row.credit_date,
    date_formatted: formatDate(row.credit_date),
    transaction_id: row.transaction_id,
    investor_name: row.investor_name,
    investor_email: row.investor_email,
    credit_type: row.credit_type,
    amount: toWholeInt(row.amount),
    amount_formatted: formatCurrency(toWholeInt(row.amount)),
    roi_percentage_applied: row.roi_percentage_applied,
  }));
}

/**
 * @param {object} options
 * @returns {Promise<Buffer>}
 */
export async function generatePdfBuffer(options) {
  const {
    title,
    subtitle = '',
    investorName = null,
    fromDate,
    toDate,
    columns,
    rows,
    footerLeft = '',
    footerRight = '',
    summaryLines = [],
  } = options;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        info: {
          Title: title,
          Author: BRAND_NAME,
        },
      });

      /** @type {Buffer[]} */
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const logoPath = resolveLogoPath();
      if (logoPath) {
        try {
          doc.image(logoPath, 50, 40, { width: 48, height: 48 });
          doc.fontSize(16).fillColor('#0A1628').text(BRAND_NAME, 110, 45);
          doc.fontSize(10).fillColor('#6B7280').text(COMPANY_NAME, 110, 65);
          doc.text(DOMAIN, 110, 78);
        } catch {
          drawTextLetterhead(doc);
        }
      } else {
        drawTextLetterhead(doc);
      }

      doc.moveDown(2);
      doc.fontSize(14).fillColor('#0A1628').text(title, { align: 'left' });
      if (subtitle) {
        doc.fontSize(10).fillColor('#6B7280').text(subtitle);
      }
      if (investorName) {
        doc.fontSize(10).fillColor('#0A1628').text(`Partner: ${investorName}`);
      }
      if (fromDate && toDate) {
        doc
          .fontSize(10)
          .fillColor('#6B7280')
          .text(`Period: ${formatDate(fromDate)} — ${formatDate(toDate)}`);
      }

      doc.moveDown(0.5);
      for (const line of summaryLines) {
        doc.fontSize(10).fillColor('#0A1628').text(line);
      }

      doc.moveDown(1);
      drawTable(doc, columns, rows);

      const bottom = doc.page.height - 40;
      doc
        .fontSize(8)
        .fillColor('#6B7280')
        .text(footerLeft || `Generated ${formatDate(new Date())}`, 50, bottom, {
          width: 250,
          align: 'left',
        });
      doc.text(footerRight || DOMAIN, 300, bottom, {
        width: 245,
        align: 'right',
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * @param {import('pdfkit')} doc
 */
function drawTextLetterhead(doc) {
  doc.fontSize(18).fillColor('#0A1628').text(BRAND_NAME, 50, 45);
  doc.fontSize(11).fillColor('#C9A84C').text(COMPANY_NAME, 50, 68);
  doc.fontSize(9).fillColor('#6B7280').text(DOMAIN, 50, 84);
}

/**
 * Simple table renderer for PDF.
 * @param {import('pdfkit')} doc
 * @param {{ key: string, label: string, width: number }[]} columns
 * @param {object[]} rows
 */
function drawTable(doc, columns, rows) {
  const startX = 50;
  let y = doc.y;
  const rowHeight = 18;
  const pageBottom = doc.page.height - 60;

  doc.fontSize(9).fillColor('#0A1628');
  let x = startX;
  for (const col of columns) {
    doc.text(col.label, x, y, { width: col.width, continued: false });
    x += col.width;
  }
  y += rowHeight;
  doc
    .moveTo(startX, y - 4)
    .lineTo(startX + columns.reduce((s, c) => s + c.width, 0), y - 4)
    .strokeColor('#E5E7EB')
    .stroke();

  for (const row of rows) {
    if (y + rowHeight > pageBottom) {
      doc.addPage();
      y = 50;
      x = startX;
      doc.fontSize(9).fillColor('#0A1628');
      for (const col of columns) {
        doc.text(col.label, x, y, { width: col.width });
        x += col.width;
      }
      y += rowHeight;
    }

    x = startX;
    doc.fontSize(8).fillColor('#0A1628');
    for (const col of columns) {
      const value = row[col.key] == null ? '' : String(row[col.key]);
      doc.text(value, x, y, { width: col.width, ellipsis: true });
      x += col.width;
    }
    y += rowHeight;
  }
  doc.y = y + 10;
}

/**
 * @param {object} options
 * @returns {Promise<Buffer>}
 */
export async function generateExcelBuffer(options) {
  const {
    sheetName = 'Report',
    title,
    fromDate,
    toDate,
    columns,
    rows,
    meta = {},
  } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND_NAME;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));

  sheet.addRow([BRAND_NAME]);
  sheet.addRow([COMPANY_NAME]);
  sheet.addRow([DOMAIN]);
  sheet.addRow([title]);
  if (fromDate && toDate) {
    sheet.addRow([`Period: ${fromDate} to ${toDate}`]);
  }
  for (const [k, v] of Object.entries(meta)) {
    sheet.addRow([`${k}: ${v}`]);
  }
  sheet.addRow([]);

  sheet.addRow(columns.map((c) => c.label));
  const headerRow = sheet.lastRow;
  if (headerRow) {
    headerRow.font = { bold: true };
  }

  for (const row of rows) {
    sheet.addRow(columns.map((c) => row[c.key]));
  }

  columns.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = Math.max(12, Math.min(40, col.width / 6));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * @param {string} investorId
 * @returns {Promise<object | null>}
 */
export async function findInvestorForReport(investorId) {
  const result = await query(
    `SELECT id, full_name, email, mobile, status, joining_date, is_deleted
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [investorId]
  );
  return result.rows[0] || null;
}

export const REPORT_BRAND = Object.freeze({
  BRAND_NAME,
  COMPANY_NAME,
  DOMAIN,
});

logger.info('[Report] Service loaded', {
  logo: Boolean(resolveLogoPath()),
});
