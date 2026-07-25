# PROJECT_PHASES.md
# Tikhat Partner App — Complete Phase & Micro Task Breakdown
# Version: 1.0
# This file contains every Cursor prompt in exact sequence.
# Never skip a task. Never combine two tasks into one prompt.
# Complete each task fully before moving to the next.

---

## PHASE OVERVIEW

| Phase | Name | Tasks | Description |
|-------|------|-------|-------------|
| 1 | Project Foundation | 6 | Folder structure, dependencies, config |
| 2 | Database Schema | 8 | All tables, indexes, migrations |
| 3 | Backend Core | 6 | Server, middleware, utilities |
| 4 | Authentication System | 6 | Register, login, OTP, JWT |
| 5 | Investor — Capital Module | 6 | Capital add, withdraw, admin approval |
| 6 | Revenue Engine | 7 | ROI calculation, cron, distribution |
| 7 | Withdrawal System | 5 | Full withdrawal lifecycle |
| 8 | Support Ticket System | 5 | Ticket CRUD, conversation, escalation |
| 9 | Email System | 6 | Resend integration, all templates |
| 10 | Backdate Management | 5 | Backdated entries, recalculation |
| 11 | Admin Panel — Core | 6 | Dashboard, user management |
| 12 | Admin Panel — Finance | 6 | Capital + revenue admin features |
| 13 | Reports & Export | 5 | PDF, Excel, statements |
| 14 | Backup System | 4 | pg_dump, Google Drive, crons |
| 15 | Frontend — Foundation | 6 | Expo setup, theme, navigation |
| 16 | Frontend — Auth Screens | 5 | Login, register, OTP screens |
| 17 | Frontend — Partner Dashboard | 6 | Dashboard, cards, charts |
| 18 | Frontend — Revenue Screen | 4 | Revenue transactions, filters |
| 19 | Frontend — Fund Screen | 5 | Capital, add/withdraw forms |
| 20 | Frontend — Profile Screen | 5 | Profile, KYC, edit flow |
| 21 | Frontend — Support Screen | 4 | Tickets, conversation |
| 22 | Frontend — Admin Panel | 8 | All admin screens |
| 23 | Notifications | 4 | In-app notifications, bell |
| 24 | Dark Mode | 3 | Theme switching |
| 25 | Animations & Polish | 4 | Transitions, skeletons, micro-animations |
| 26 | Security Hardening | 4 | Rate limiting, audit, final checks |
| 27 | Deployment Setup | 5 | Server, Nginx, PM2, SSL |
| 28 | Testing & QA | 4 | End-to-end testing, bug fixes |

---

---

# PHASE 1: PROJECT FOUNDATION

---

## TASK 1.1 — Initialize Backend Project

**Goal:**
Set up the Node.js + Express backend project with correct folder structure and all dependencies installed.

**Context:**
- This is the very first task of the project
- Backend runs on Node.js 20 LTS with Express.js
- All file paths must exactly match PROJECT_INSTRUCTIONS.md Section 3
- Read PROJECT_INSTRUCTIONS.md Section 2.2 for all backend dependencies

**Files to Create:**
- `backend/package.json`
- `backend/server.js`
- `backend/src/app.js`
- `backend/.env.example`
- `backend/.gitignore`
- `backend/src/db/connection.js`
- `backend/src/utils/logger.js`

**Files to Modify:**
- None (first task)

**Acceptance Criteria:**
- [ ] `package.json` contains all dependencies from PROJECT_INSTRUCTIONS.md Section 2.2
- [ ] ES Modules configured (`"type": "module"` in package.json)
- [ ] Express app created in `src/app.js` with Helmet, CORS, JSON parser
- [ ] Server starts on PORT from .env with `node backend/server.js`
- [ ] PostgreSQL connection pool created in `src/db/connection.js`
- [ ] Winston logger configured in `src/utils/logger.js` with daily rotate file
- [ ] `.env.example` contains all required environment variable keys (no values)
- [ ] `.gitignore` includes: node_modules, .env, uploads/, backups/, logs/
- [ ] CORS configured for tikhatpartner.online only (read from env)

**Testing Checklist:**
- [ ] Run `node backend/server.js` — server starts without errors
- [ ] GET `http://localhost:5000/api/health` returns `{ success: true, message: "Server running" }`
- [ ] Logger creates log files in `backend/logs/` folder
- [ ] DB connection pool connects to PostgreSQL (if DB exists)

**Things Cursor Must NOT Modify:**
- Nothing (first task)

---

## TASK 1.2 — Initialize Frontend Project

**Goal:**
Set up the React Native Expo project with Expo Router, correct folder structure, and all dependencies.

**Context:**
- Use Expo SDK 51+ with Expo Router v3
- TypeScript must be enabled
- All file paths must match PROJECT_INSTRUCTIONS.md Section 3
- Read PROJECT_INSTRUCTIONS.md Section 2.1 for all frontend dependencies

**Files to Create:**
- `frontend/package.json`
- `frontend/app.json`
- `frontend/tsconfig.json`
- `frontend/babel.config.js`
- `frontend/app/_layout.tsx`
- `frontend/.gitignore`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Expo project initialized with TypeScript template
- [ ] All dependencies from PROJECT_INSTRUCTIONS.md Section 2.1 installed
- [ ] Expo Router v3 configured as navigation system
- [ ] TypeScript strict mode enabled in tsconfig.json
- [ ] `app/_layout.tsx` sets up root layout with SafeAreaProvider and GestureHandlerRootView
- [ ] `.gitignore` includes: node_modules, .expo, dist/

**Testing Checklist:**
- [ ] Run `npx expo start` — app starts without errors
- [ ] App opens on Expo Go (mobile) or web browser
- [ ] No TypeScript errors on startup

**Things Cursor Must NOT Modify:**
- Nothing (first task)

---

## TASK 1.3 — Theme & Design System

**Goal:**
Create the complete design system (colors, typography, spacing, components base) that will be used across the entire frontend.

**Context:**
- Theme: White, Dark Blue (#0A1628), Golden (#C9A84C)
- UI Reference: Groww app style
- Both light and dark mode must be supported
- Read PROJECT_INSTRUCTIONS.md Section 7.8 for exact color values
- Read PROJECT_INSTRUCTIONS.md Section 12 for all UI rules

**Files to Create:**
- `frontend/theme/colors.ts`
- `frontend/theme/typography.ts`
- `frontend/theme/spacing.ts`
- `frontend/theme/index.ts`
- `frontend/constants/index.ts`
- `frontend/hooks/useTheme.ts`

**Files to Modify:**
- `frontend/app/_layout.tsx` — wrap with theme provider

**Acceptance Criteria:**
- [ ] All colors from PROJECT_INSTRUCTIONS.md Section 7.8 defined in `colors.ts`
- [ ] Light mode and dark mode color sets both defined
- [ ] Typography scale defined (Inter font family, all weights)
- [ ] Spacing scale defined (xs, sm, md, lg, xl, xxl)
- [ ] Border radius scale defined
- [ ] `useTheme()` hook returns current theme colors based on device mode
- [ ] All constants (app name, currency symbol, date format) in `constants/index.ts`
- [ ] No hardcoded colors anywhere — only theme references

**Testing Checklist:**
- [ ] Switch device to dark mode → app uses dark theme colors
- [ ] Switch device to light mode → app uses light theme colors
- [ ] All theme values accessible via useTheme() hook

**Things Cursor Must NOT Modify:**
- `frontend/package.json`
- `frontend/babel.config.js`

---

## TASK 1.4 — Utility Functions

**Goal:**
Create all shared utility functions for currency formatting, date formatting, transaction ID generation, and Indian number formatting.

**Context:**
- Currency: ₹ Indian format (₹1,00,000)
- Date: DD MMM YYYY (15 Jul 2024)
- All timezone conversions must use IST (Asia/Kolkata)
- Transaction ID format: TKT-CAP-DEP-2024-00001
- Read PROJECT_KNOWLEDGE.md Section 8 for Transaction ID formats

**Files to Create:**
- `backend/src/utils/formatCurrency.js`
- `backend/src/utils/formatDate.js`
- `backend/src/utils/generateTxnId.js`
- `backend/src/utils/indianNumber.js`
- `backend/src/utils/validators.js`
- `frontend/utils/formatCurrency.ts`
- `frontend/utils/formatDate.ts`
- `frontend/utils/indianNumber.ts`
- `frontend/utils/validators.ts`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `formatCurrency(50000)` returns `"₹50,000"` (Indian format)
- [ ] `formatCurrency(100000)` returns `"₹1,00,000"` (Indian lakh format)
- [ ] `formatDate(new Date())` returns `"15 Jul 2024"` format
- [ ] `formatTime(new Date())` returns `"6:00 PM"` format
- [ ] `generateTxnId('CAP-DEP')` returns `"TKT-CAP-DEP-2024-00001"` with auto-increment
- [ ] Transaction ID counter increments per type per year
- [ ] `indianNumber(1234567)` returns `"12,34,567"` (Indian numbering system)
- [ ] Validators for: email, Indian mobile (10 digit), PAN format (ABCDE1234F), Aadhar (12 digit)

**Testing Checklist:**
- [ ] Test formatCurrency with: 1000, 10000, 100000, 1000000
- [ ] Test formatDate with various dates
- [ ] Test generateTxnId for all 7 transaction types
- [ ] Test validators with valid and invalid inputs

**Things Cursor Must NOT Modify:**
- `backend/src/utils/logger.js`
- `backend/src/db/connection.js`

---

## TASK 1.5 — Backend Middleware Setup

**Goal:**
Create all Express middleware: authentication, role-based access control, rate limiting, file upload, input validation, and concurrent edit detection.

**Context:**
- JWT: access token (7 days) + refresh token (30 days)
- Roles: super_admin, admin, investor
- Rate limits defined in PROJECT_INSTRUCTIONS.md Section 6.4
- File upload rules in PROJECT_INSTRUCTIONS.md Section 11
- Read PROJECT_INSTRUCTIONS.md Section 6 completely

**Files to Create:**
- `backend/src/middleware/auth.middleware.js`
- `backend/src/middleware/role.middleware.js`
- `backend/src/middleware/rateLimit.middleware.js`
- `backend/src/middleware/upload.middleware.js`
- `backend/src/middleware/validate.middleware.js`
- `backend/src/middleware/concurrent.middleware.js`

**Files to Modify:**
- `backend/src/app.js` — register global middleware

**Acceptance Criteria:**
- [ ] `auth.middleware.js` verifies JWT, attaches user to req.user
- [ ] `auth.middleware.js` returns 401 if token missing/expired/invalid
- [ ] `role.middleware.js` accepts array of allowed roles, returns 403 if not matching
- [ ] `role.middleware.js` has: `requireInvestor`, `requireAdmin`, `requireSuperAdmin` helpers
- [ ] Rate limiting applied: login (10/15min), OTP (3/15min), registration (5/hr), general (100/15min)
- [ ] `upload.middleware.js` validates MIME type server-side (not just extension)
- [ ] `upload.middleware.js` rejects files > 5MB
- [ ] `upload.middleware.js` renames files to UUID-based names
- [ ] `concurrent.middleware.js` tracks active editors per investor record, returns list of other editors
- [ ] Input validation middleware using express-validator

**Testing Checklist:**
- [ ] Request without token → 401 response
- [ ] Request with expired token → 401 response
- [ ] Investor token on admin route → 403 response
- [ ] Upload file > 5MB → rejected with error
- [ ] Upload .exe file → rejected with FILE_TYPE_NOT_ALLOWED
- [ ] 11th login attempt in 15 min → 429 response

**Things Cursor Must NOT Modify:**
- `backend/src/utils/logger.js`
- `backend/src/db/connection.js`

---

## TASK 1.6 — Frontend Navigation Structure

**Goal:**
Set up the complete navigation structure with protected routes, role-based routing, and bottom tab navigation for investor panel.

**Context:**
- Expo Router v3 file-based routing
- Three route groups: (auth), (partner), (admin)
- Bottom navigation for investor: Dashboard, Revenue, Fund, Profile, Support
- Admin uses sidebar/top navigation
- Read PROJECT_INSTRUCTIONS.md Section 7.4 for navigation rules

**Files to Create:**
- `frontend/app/(auth)/_layout.tsx`
- `frontend/app/(partner)/_layout.tsx` — bottom tab navigator
- `frontend/app/(admin)/_layout.tsx` — admin layout
- `frontend/app/(auth)/index.tsx` — Homepage placeholder
- `frontend/app/(auth)/login.tsx` — Login placeholder
- `frontend/app/(auth)/register.tsx` — Register placeholder
- `frontend/app/(partner)/dashboard.tsx` — Dashboard placeholder
- `frontend/app/(partner)/revenue.tsx` — Revenue placeholder
- `frontend/app/(partner)/fund.tsx` — Fund placeholder
- `frontend/app/(partner)/profile.tsx` — Profile placeholder
- `frontend/app/(partner)/support.tsx` — Support placeholder
- `frontend/app/(admin)/dashboard.tsx` — Admin dashboard placeholder
- `frontend/store/authStore.ts` — Zustand auth store
- `frontend/hooks/useAuth.ts` — Auth hook

**Files to Modify:**
- `frontend/app/_layout.tsx` — add auth check at root

**Acceptance Criteria:**
- [ ] Unauthenticated user → redirected to (auth)/login
- [ ] Investor role → redirected to (partner)/dashboard
- [ ] Admin/Super Admin role → redirected to (admin)/dashboard
- [ ] Bottom tab navigation shows: Dashboard, Revenue, Fund, Profile, Support icons
- [ ] Active tab highlighted with Dark Blue + Golden indicator
- [ ] All placeholder screens show correct page title
- [ ] Auth store has: user, token, login(), logout(), isAuthenticated
- [ ] Logout clears token from SecureStore and redirects to login

**Testing Checklist:**
- [ ] Open app without login → lands on login page
- [ ] Navigate to /partner/dashboard without auth → redirects to login
- [ ] Navigate to /admin/dashboard as investor → redirects to partner dashboard
- [ ] Bottom tabs switch between screens without reload
- [ ] Logout → back to login screen

**Things Cursor Must NOT Modify:**
- `frontend/theme/` folder
- `frontend/constants/index.ts`

---

---

# PHASE 2: DATABASE SCHEMA

---

## TASK 2.1 — Users & Admin Tables

**Goal:**
Create database migrations for users (investors) and admin tables with all required fields, constraints, and indexes.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 4 for account lifecycle
- Read PROJECT_KNOWLEDGE.md Section 5 for profile fields
- All UUIDs, all timestamps in UTC
- Soft delete pattern (is_deleted flag)
- Read PROJECT_INSTRUCTIONS.md Section 4 for database rules

**Files to Create:**
- `database/migrations/001_create_users_table.sql`
- `database/migrations/002_create_admins_table.sql`
- `database/migrations/003_create_sessions_table.sql`
- `database/migrations/004_create_otp_table.sql`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `users` table fields: id (UUID PK), full_name, email (UNIQUE), password_hash, mobile, profile_photo_url, date_of_birth, address, pan_number, pan_front_url, pan_back_url, aadhar_number, aadhar_front_url, aadhar_back_url, bank_account_number, bank_ifsc, bank_account_name, bank_name, upi_id, status (enum: pending/active/paused/locked/self_deactivated/deleted), kyc_status (enum: pending/verified/rejected), joining_date, failed_login_attempts, is_deleted, banner_dismissed, created_at, updated_at
- [ ] `admins` table fields: id, full_name, email (UNIQUE), password_hash, mobile, role (enum: super_admin/admin), status (enum: active/suspended), created_by (FK admins.id), created_at, updated_at
- [ ] `sessions` table: id, user_id, user_type (investor/admin), device_type (mobile/web), token_hash, expires_at, created_at
- [ ] `otp_verifications` table: id, email, otp_hash, purpose (enum: login/register/reset_password/email_change), expires_at, is_used, created_at
- [ ] All indexes created per PROJECT_INSTRUCTIONS.md Section 13.3
- [ ] Foreign key constraints properly set
- [ ] CHECK constraints on enum fields
- [ ] Default values set where appropriate

**Testing Checklist:**
- [ ] Run all 4 migrations without errors
- [ ] Verify table structure with `\d tablename` in psql
- [ ] Test UNIQUE constraint on email (try inserting duplicate)
- [ ] Test enum constraint (try inserting invalid status)

**Things Cursor Must NOT Modify:**
- Any previously created migration files

---

## TASK 2.2 — KYC & Profile History Tables

**Goal:**
Create database migrations for KYC update requests and bank details history.

**Context:**
- Profile updates require admin approval (field by field)
- Old bank details must be retained permanently
- Read PROJECT_KNOWLEDGE.md Section 5 for complete KYC workflow

**Files to Create:**
- `database/migrations/005_create_profile_update_requests.sql`
- `database/migrations/006_create_bank_details_history.sql`
- `database/migrations/007_create_kyc_field_approvals.sql`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `profile_update_requests` table: id (TKT-PRF transaction ID), investor_id, field_name, old_value, new_value, status (enum: pending/approved/rejected), admin_id (who approved/rejected), rejection_reason, created_at, updated_at
- [ ] `bank_details_history` table: id, investor_id, bank_account_number, bank_ifsc, bank_account_name, bank_name, upi_id, changed_at, changed_by (investor/admin), admin_id
- [ ] `kyc_field_approvals` table: id, investor_id, field_name, status, admin_id, rejection_reason, reviewed_at, created_at
- [ ] Proper foreign keys to users table
- [ ] Index on investor_id for all tables

**Testing Checklist:**
- [ ] Run migrations without errors
- [ ] Verify foreign key enforcement
- [ ] Insert test profile update request and verify

**Things Cursor Must NOT Modify:**
- Migrations 001-004

---

## TASK 2.3 — Capital Transactions Table

**Goal:**
Create database migrations for capital accounts and all capital-related transactions.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 6 for complete capital management rules
- Every transaction gets a TKT-CAP-DEP or TKT-CAP-WDR ID
- Both original and approved amounts stored
- Soft delete only

**Files to Create:**
- `database/migrations/008_create_capital_transactions.sql`
- `database/migrations/009_create_withdrawal_requests.sql`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `capital_transactions` table: id (UUID), transaction_id (TKT-CAP-DEP-YYYY-XXXXX), investor_id, type (enum: deposit/withdrawal/admin_credit/admin_debit), amount, original_requested_amount, status (enum: submitted/under_review/approved/rejected/cancelled/processed/completed), utr_number, payment_screenshot_url, remark, admin_id, admin_remark, is_deleted, transfer_mode (enum: bank/upi), payment_date, payment_utr, created_at, updated_at
- [ ] `capital_withdrawal_requests` table: id, transaction_id, investor_id, amount, account_type (enum: capital/revenue), transfer_mode (enum: bank/upi), status, admin_id, admin_remark, payment_date, payment_utr, auto_cancelled_reason, created_at, updated_at
- [ ] `capital_lock_status` table: investor_id (PK), is_locked (boolean), locked_by (admin_id), locked_at, unlock_reason, created_at, updated_at
- [ ] Index on investor_id, status, created_at
- [ ] Index on transaction_id (for fast lookup)

**Testing Checklist:**
- [ ] Run migrations without errors
- [ ] Test capital transaction insertion
- [ ] Verify transaction_id UNIQUE constraint

**Things Cursor Must NOT Modify:**
- Migrations 001-007

---

## TASK 2.4 — Revenue & ROI Tables

**Goal:**
Create database migrations for ROI settings, revenue credits, and revenue distribution tracking.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 7 for complete revenue system
- Every investor has default ROI + optional term-based ROI
- Every daily credit is a separate transaction record
- Revenue balance cannot go negative

**Files to Create:**
- `database/migrations/010_create_roi_settings.sql`
- `database/migrations/011_create_revenue_credits.sql`
- `database/migrations/012_create_monthly_revenue_tracking.sql`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `roi_settings` table: id, investor_id, type (enum: default/term), roi_percentage (integer, stored as actual % e.g., 30 for 30%), start_date, end_date (nullable for default), created_by (admin_id), is_active, created_at, updated_at
- [ ] `revenue_credits` table: id, transaction_id (TKT-REV-CR-YYYY-XXXXX), investor_id, credit_date, amount, credit_type (enum: daily_auto/manual_credit/manual_debit/backdate), roi_percentage_applied, capital_at_time, is_reversed, reversed_by, reversed_at, reversal_reason, cron_job_id, is_deleted, created_at, updated_at
- [ ] `monthly_revenue_tracking` table: id, investor_id, year, month, expected_total, credited_total, days_credited, days_paused, days_remaining, status (enum: in_progress/completed), created_at, updated_at
- [ ] `revenue_credit_settings` table: investor_id (PK), credit_frequency (enum: daily/weekly/monthly), credit_time_hour (integer 0-23 IST), credit_time_minute (integer 0-59), withdrawal_frequency (integer, times per month), is_paused, paused_by, paused_at, created_at, updated_at
- [ ] `global_settings` table: id, key (UNIQUE), value, updated_by, updated_at
- [ ] Index on investor_id + credit_date (revenue_credits)
- [ ] Index on year + month + investor_id (monthly_revenue_tracking)

**Testing Checklist:**
- [ ] Run migrations without errors
- [ ] Insert ROI setting for test investor
- [ ] Insert revenue credit record
- [ ] Verify unique constraint on monthly tracking (one record per investor per month)

**Things Cursor Must NOT Modify:**
- Migrations 001-009

---

## TASK 2.5 — Support Ticket Tables

**Goal:**
Create database migrations for support ticket system with conversation threads and attachments.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 11 for ticket system rules
- Tickets have conversation threads (multiple messages)
- Multiple attachments per message
- Assignment to admins supported

**Files to Create:**
- `database/migrations/013_create_support_tickets.sql`
- `database/migrations/014_create_ticket_messages.sql`
- `database/migrations/015_create_ticket_attachments.sql`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `support_tickets` table: id, ticket_id (TKT-SUP-YYYY-XXXXX), investor_id, category (enum: capital/revenue/withdrawal/kyc_profile/technical/other), subject, status (enum: open/in_progress/resolved/closed), assigned_to (admin_id, nullable), escalated_to_super_admin (boolean), escalated_at, created_at, updated_at
- [ ] `ticket_messages` table: id, ticket_id, sender_type (enum: investor/admin), sender_id, message, created_at
- [ ] `ticket_attachments` table: id, message_id, ticket_id, file_url, file_name, file_type, file_size, created_at
- [ ] Index on ticket_id, investor_id, status, assigned_to
- [ ] Foreign keys properly set

**Testing Checklist:**
- [ ] Run migrations without errors
- [ ] Insert test ticket with message and attachment
- [ ] Verify cascade behavior on ticket delete

**Things Cursor Must NOT Modify:**
- Migrations 001-012

---

## TASK 2.6 — Notifications & Email Log Tables

**Goal:**
Create database migrations for in-app notifications, email logs, and admin activity logs.

**Context:**
- Every email sent must be logged
- Admin activity must be permanently logged
- In-app notifications per investor

**Files to Create:**
- `database/migrations/016_create_notifications.sql`
- `database/migrations/017_create_email_logs.sql`
- `database/migrations/018_create_admin_activity_logs.sql`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `notifications` table: id, investor_id, title, body, type (enum: transaction/request/support/system/custom), reference_id, reference_type, is_read, created_at
- [ ] `email_logs` table: id, recipient_email, recipient_type (investor/admin), template_name, subject, status (enum: queued/sent/failed/retrying), attempts, last_attempt_at, error_message, reference_id, created_at, updated_at
- [ ] `admin_activity_logs` table: id, admin_id, action, entity_type (investor/capital/revenue/support etc.), entity_id, old_value (JSONB), new_value (JSONB), ip_address, created_at
- [ ] `concurrent_edit_sessions` table: id, entity_type, entity_id, admin_id, admin_name, started_at, last_ping_at
- [ ] Index on investor_id + is_read (notifications)
- [ ] Index on admin_id + created_at (activity_logs)

**Testing Checklist:**
- [ ] Run migrations without errors
- [ ] Insert test notification and verify
- [ ] Insert test email log entry

**Things Cursor Must NOT Modify:**
- Migrations 001-015

---

## TASK 2.7 — Cron Job Logs & Backdate Tables

**Goal:**
Create database migrations for cron job execution logs and backdate management records.

**Context:**
- Every cron execution must be logged
- Backdate entries need Super Admin approval before committing
- Read PROJECT_KNOWLEDGE.md Section 14 for backdate rules

**Files to Create:**
- `database/migrations/019_create_cron_logs.sql`
- `database/migrations/020_create_backdate_requests.sql`
- `database/migrations/021_create_transaction_id_sequences.sql`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `cron_job_logs` table: id, job_name, started_at, completed_at, status (enum: running/success/partial/failed), processed_count, failed_count, total_amount, error_details (JSONB), created_at
- [ ] `backdate_requests` table: id, submitted_by (admin_id), approved_by (super_admin_id), investor_id, type (enum: single_revenue/bulk_revenue/capital/new_investor), start_date, end_date, roi_percentage, details (JSONB), status (enum: pending/approved/rejected/executed), send_email_to_investor, execution_log (JSONB), created_at, updated_at
- [ ] `transaction_id_sequences` table: id, type (UNIQUE), year (integer), last_sequence (integer), created_at, updated_at — for generating TKT-XXX-YYYY-XXXXX IDs
- [ ] Insert initial rows in transaction_id_sequences for all 7 types

**Testing Checklist:**
- [ ] Run migrations without errors
- [ ] Verify transaction_id_sequences has all 7 types pre-seeded
- [ ] Test sequence increment logic manually

**Things Cursor Must NOT Modify:**
- Migrations 001-018

---

## TASK 2.8 — Database Seed Data & Migration Runner

**Goal:**
Create the Super Admin seed data and a migration runner script that applies all migrations in order.

**Context:**
- One Super Admin must exist at startup
- Migration runner must be idempotent (safe to run multiple times)
- Global settings must have default values

**Files to Create:**
- `database/migrations/022_seed_super_admin.sql`
- `database/migrations/023_seed_global_settings.sql`
- `backend/scripts/migrate.js`
- `backend/scripts/seed.js`

**Files to Modify:**
- `backend/package.json` — add migrate and seed scripts

**Acceptance Criteria:**
- [ ] Migration runner applies migrations in numeric order (001, 002...)
- [ ] Migration runner tracks applied migrations in `schema_migrations` table
- [ ] Migration runner is idempotent — running twice doesn't cause errors
- [ ] Super Admin seeded: email from .env, password hashed with bcrypt
- [ ] Global settings seeded with defaults:
  - `revenue_credit_hour`: 18 (6 PM)
  - `revenue_credit_minute`: 0
  - `min_capital_deposit`: 10000
  - `max_capital_deposit`: 1000000
  - `min_withdrawal`: 1000
  - `upi_transfer_limit`: 100000
  - `maintenance_mode`: false
- [ ] `npm run migrate` command runs all pending migrations
- [ ] `npm run seed` command runs seed data

**Testing Checklist:**
- [ ] Run `npm run migrate` — all 23 migrations applied
- [ ] Run `npm run migrate` again — no errors (idempotent)
- [ ] Run `npm run seed` — Super Admin created in DB
- [ ] Verify Super Admin can be found in admins table
- [ ] Verify global_settings has all default values

**Things Cursor Must NOT Modify:**
- Any migration file 001-021
- `backend/src/app.js`

---

---

# PHASE 3: BACKEND CORE SERVICES

---

## TASK 3.1 — Transaction ID Service

**Goal:**
Build the transaction ID generation service that creates unique, sequential, year-resetting IDs for all 7 transaction types.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 8 for all ID formats
- IDs must be thread-safe (no duplicates even under concurrent requests)
- Year resets to 00001 each January 1st
- Must use database sequence (not in-memory counter)

**Files to Create:**
- `backend/src/services/transaction.service.js`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `generateTransactionId(type)` function accepts types: CAP-DEP, CAP-WDR, REV-CR, REV-WDR, ADM, SUP, PRF
- [ ] Returns format: `TKT-CAP-DEP-2024-00001`
- [ ] Uses database transaction to increment sequence atomically (no race conditions)
- [ ] Resets sequence to 1 on new year automatically
- [ ] If year changes during operation → uses new year
- [ ] Function is async, handles DB errors gracefully

**Testing Checklist:**
- [ ] Generate 5 consecutive CAP-DEP IDs → 00001, 00002, 00003, 00004, 00005
- [ ] Generate REV-CR ID → different series from CAP-DEP
- [ ] Simulate year change → next ID starts at 00001 with new year
- [ ] Concurrent generation (Promise.all 10 calls) → no duplicates

**Things Cursor Must NOT Modify:**
- Any migration files
- `backend/src/utils/logger.js`

---

## TASK 3.2 — ROI Calculation Service

**Goal:**
Build the core ROI calculation engine that handles all revenue calculation scenarios: pro-rated first month, mid-month capital changes, term-based ROI, random daily distribution.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 7 COMPLETELY before writing any code
- This is the most critical business logic in the entire app
- All amounts must be whole numbers (Math.round)
- Daily range: 90% to 110% of daily average
- Last day gets remaining amount (may be outside range)
- Paused days count as zero — not redistributed

**Files to Create:**
- `backend/src/services/roi.service.js`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `getActiveROI(investorId, date)` → returns ROI % for given investor on given date (term-based or default)
- [ ] `calculateMonthlyAmount(capital, roiPercent, daysInMonth)` → total monthly revenue
- [ ] `calculateProRatedAmount(capital, roiPercent, startDay, daysInMonth)` → first month pro-rated
- [ ] `calculateDailyAmounts(monthlyTotal, daysInMonth, creditedSoFar, remainingDays)` → generates random daily amount within 90-110% range
- [ ] `getDailyAmount(investorId, date)` → returns the scheduled amount for a specific date
- [ ] Last day calculation: `monthlyTotal - sum(all previous days this month)`
- [ ] All results are whole integers (Math.round applied everywhere)
- [ ] Function handles: 28, 29, 30, 31 day months correctly
- [ ] Function handles: capital changes mid-month (creates segments)
- [ ] Zero capital → zero revenue
- [ ] Paused investor → getDailyAmount returns 0 for paused days

**Testing Checklist:**
- [ ] Capital ₹10,000, ROI 30%, 30-day month → monthly = ₹3,000
- [ ] Daily range for above → min ₹90, max ₹110
- [ ] Generate 30 daily amounts → sum equals ₹3,000
- [ ] Last day amount fills remaining gap correctly
- [ ] Pro-rated: ₹10,000 at 30% in 30-day month, starting day 15 → ₹1,600
- [ ] Capital added mid-month: ₹10,000 + ₹5,000 on day 10 → correct split calculation
- [ ] 28-day February → works correctly
- [ ] 31-day month → works correctly

**Things Cursor Must NOT Modify:**
- `backend/src/services/transaction.service.js`
- Any migration files

---

## TASK 3.3 — Email Service & Templates

**Goal:**
Build the complete email service using Resend.com with all email templates using React Email, email queue, retry logic, and delivery logging.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 12 for all email triggers and rules
- Sender: Tikhat Partner <noreply@tikhatpartner.online>
- Language: English only
- All amounts in ₹ Indian format
- All dates in DD MMM YYYY format
- Logo placeholder (actual logo provided at deployment)
- Read PROJECT_INSTRUCTIONS.md Section 10 for email rules

**Files to Create:**
- `backend/src/services/email.service.js`
- `backend/emails/base.email.jsx`
- `backend/emails/approval.email.jsx`
- `backend/emails/rejection.email.jsx`
- `backend/emails/revenue-credit.email.jsx`
- `backend/emails/capital-transaction.email.jsx`
- `backend/emails/withdrawal.email.jsx`
- `backend/emails/support.email.jsx`
- `backend/emails/monthly-summary.email.jsx`
- `backend/emails/otp.email.jsx`
- `backend/emails/custom-notification.email.jsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `email.service.js` has `sendEmail(to, templateName, data)` function
- [ ] Email queued in `email_logs` table before sending
- [ ] Resend API called asynchronously (non-blocking)
- [ ] On failure: retry 3 times with 5-minute intervals
- [ ] After 3 failures: admin alerted via separate email
- [ ] Email log updated with: status, attempts, error message
- [ ] `base.email.jsx` has: logo placeholder, company name, professional header, footer with tikhatpartner.online
- [ ] All templates are mobile-responsive HTML emails
- [ ] OTP email: clean, urgent, shows OTP prominently with expiry time
- [ ] Revenue credit email: shows amount, date, running balance, transaction ID
- [ ] Capital transaction email: shows amount, type, status, transaction ID
- [ ] Withdrawal email: shows amount, transfer mode, status, UTR (if available)
- [ ] Monthly summary email: table with month's revenue, capital balance, withdrawals
- [ ] Support email: shows ticket ID, category, message preview
- [ ] All templates use ₹ Indian format for amounts
- [ ] All templates use DD MMM YYYY for dates

**Testing Checklist:**
- [ ] Send test OTP email → received with correct format
- [ ] Send test revenue credit email → amounts formatted correctly
- [ ] Simulate Resend API failure → retry logic triggers
- [ ] After 3 failures → admin alert email sent
- [ ] Email log in DB updated correctly after each attempt

**Things Cursor Must NOT Modify:**
- `backend/src/services/roi.service.js`
- `backend/src/services/transaction.service.js`

---

## TASK 3.4 — File Storage Service

**Goal:**
Build the file storage service for handling uploads, downloads, and secure file access with proper folder structure.

**Context:**
- Read PROJECT_INSTRUCTIONS.md Section 11 for file upload rules
- Files stored in /uploads with organized subfolder structure
- Never use original filename — always UUID-based rename
- Files served through authenticated API only
- Image compression for profile photos

**Files to Create:**
- `backend/src/services/storage.service.js`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `uploadFile(file, category)` → saves file to correct subfolder, returns file record
- [ ] Categories: kyc-pan-front, kyc-pan-back, kyc-aadhar-front, kyc-aadhar-back, profile-photo, payment-screenshot, support-attachment
- [ ] File renamed to: `{timestamp}-{uuid}.{ext}`
- [ ] File metadata saved in DB (url, original_name, mime_type, size)
- [ ] `getFileStream(fileId, userId)` → returns file stream after auth check
- [ ] `deleteFile(fileId)` → removes file from disk + DB record
- [ ] Profile photos compressed to max 800x800px using Sharp
- [ ] All other files stored as-is (no compression for documents)
- [ ] Folder structure matches PROJECT_INSTRUCTIONS.md Section 11.2

**Testing Checklist:**
- [ ] Upload JPG → saved with UUID name in correct folder
- [ ] Upload PDF → saved correctly
- [ ] Upload PNG > 5MB → rejected (middleware handles this)
- [ ] Upload .exe → rejected (middleware handles this)
- [ ] Profile photo upload → compressed to max 800x800
- [ ] getFileStream with wrong userId → returns 403

**Things Cursor Must NOT Modify:**
- Email service files
- ROI service file

---

## TASK 3.5 — Notification Service

**Goal:**
Build the in-app notification service that creates, stores, and delivers real-time notifications to investors and admin.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 13 for notification rules
- In-app notifications stored in DB
- Real-time delivery via Server-Sent Events (SSE) or polling
- Admin has notification center with pending approval counts

**Files to Create:**
- `backend/src/services/notification.service.js`
- `backend/src/routes/notification.routes.js`
- `backend/src/controllers/notification.controller.js`

**Files to Modify:**
- `backend/src/app.js` — register notification routes

**Acceptance Criteria:**
- [ ] `createNotification(investorId, title, body, type, referenceId)` → saves to DB
- [ ] `getNotifications(investorId, page)` → paginated list, unread first
- [ ] `markAsRead(notificationId, investorId)` → marks single notification read
- [ ] `markAllAsRead(investorId)` → marks all read
- [ ] `getUnreadCount(investorId)` → returns count for bell badge
- [ ] `getAdminSummary()` → pending approvals count, new tickets, new registrations
- [ ] GET `/api/v1/notifications` → investor's notifications (paginated)
- [ ] PATCH `/api/v1/notifications/:id/read` → mark single read
- [ ] PATCH `/api/v1/notifications/read-all` → mark all read
- [ ] GET `/api/v1/notifications/unread-count` → count for badge
- [ ] GET `/api/v1/admin/notifications/summary` → admin pending counts

**Testing Checklist:**
- [ ] Create notification → appears in GET list
- [ ] Mark as read → is_read changes to true
- [ ] Unread count → decrements after marking read
- [ ] Admin summary → returns correct pending counts

**Things Cursor Must NOT Modify:**
- Email service, ROI service, storage service

---

## TASK 3.6 — Audit Log Service

**Goal:**
Build the admin activity audit log service that records every admin action permanently with before/after values.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 22 and 23 for audit requirements
- Every admin action on investor data must be logged
- Logs permanent — 5+ years retention
- Include: who, what, which investor, old value, new value, timestamp, IP

**Files to Create:**
- `backend/src/services/audit.service.js`
- `backend/src/routes/audit.routes.js`
- `backend/src/controllers/audit.controller.js`

**Files to Modify:**
- `backend/src/app.js` — register audit routes
- `backend/src/middleware/auth.middleware.js` — attach IP to req

**Acceptance Criteria:**
- [ ] `logAction(adminId, action, entityType, entityId, oldValue, newValue, ipAddress)` → saves to DB
- [ ] `getActivityLogs(filters, pagination)` → filterable, paginated list
- [ ] Filters: by admin, by entity type, by date range, by action
- [ ] GET `/api/v1/admin/audit-logs` → activity logs (admin only)
- [ ] Logs never deletable via API (no delete route)
- [ ] IP address captured from every admin request
- [ ] action descriptions are human-readable: "Approved capital deposit of ₹50,000"

**Testing Checklist:**
- [ ] Log test action → appears in GET audit logs
- [ ] Filter by admin ID → returns only that admin's actions
- [ ] Filter by date range → returns correct results
- [ ] No DELETE route exists for audit logs
- [ ] IP address recorded correctly

**Things Cursor Must NOT Modify:**
- Notification service files
- Email service files

---

---

# PHASE 4: AUTHENTICATION SYSTEM

---

## TASK 4.1 — Investor Registration API

**Goal:**
Build the complete investor registration API with email OTP verification, duplicate checks, and admin notification.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 4.2 for registration flow
- Read PROJECT_KNOWLEDGE.md Section 25 for validation rules
- Fields: Full Name, Email, Password, Mobile Number
- Admin approval required after registration
- Duplicate email → blocked
- Rate limit: 5 registrations per hour per IP

**Files to Create:**
- `backend/src/controllers/auth.controller.js`
- `backend/src/routes/auth.routes.js`
- `backend/src/models/user.model.js`

**Files to Modify:**
- `backend/src/app.js` — register auth routes

**Acceptance Criteria:**
- [ ] POST `/api/v1/auth/register` accepts: full_name, email, password, mobile
- [ ] Validates: full_name (alphabets+spaces, min 3 chars), email (valid format), password (min 8 chars, uppercase+lowercase+number), mobile (10-digit Indian)
- [ ] Checks: email not already registered, email not in deleted accounts
- [ ] Password hashed with bcrypt (12 rounds)
- [ ] Investor created with status: pending
- [ ] Confirmation email sent to investor (async)
- [ ] Alert email sent to all admins (async)
- [ ] In-app notification created for admin notification center
- [ ] Returns: `{ success: true, message: "Registration successful. Please wait for admin approval." }`
- [ ] Rate limited: 5 per hour per IP
- [ ] Duplicate email → 409 with USER_EMAIL_EXISTS error

**Testing Checklist:**
- [ ] Valid registration → 201, investor in DB with pending status
- [ ] Duplicate email → 409 USER_EMAIL_EXISTS
- [ ] Invalid mobile (9 digits) → 400 validation error
- [ ] Weak password → 400 validation error
- [ ] 6th registration from same IP in 1 hour → 429
- [ ] Confirmation email triggered (check email_logs table)
- [ ] Admin notification created (check notifications table)

**Things Cursor Must NOT Modify:**
- Any service files (roi, email, storage, notification, audit, transaction)
- Any migration files

---

## TASK 4.2 — Investor Login & OTP API

**Goal:**
Build the complete investor login system with Email OTP verification, account lock mechanism, and JWT token management.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 3.1 for login flow
- Login: Email + Password → if valid → send OTP → verify OTP → issue JWT
- 5 failed attempts → account locked
- Locked account auto-unlocks at 12 AM IST
- Session: 1 mobile + 1 web simultaneous
- Rate limit: 10 login attempts per 15 minutes

**Files to Create:**
- `backend/src/services/auth.service.js`

**Files to Modify:**
- `backend/src/controllers/auth.controller.js` — add login, verify OTP, logout, refresh token functions
- `backend/src/routes/auth.routes.js` — add login routes

**Acceptance Criteria:**
- [ ] POST `/api/v1/auth/login` → validates email+password, sends OTP if valid
- [ ] If account pending → 403 with "Account pending admin approval"
- [ ] If account locked → 423 with "Account locked. Unlock via email OTP or wait till midnight."
- [ ] If account paused → allow login (paused allows login)
- [ ] If account deleted/self_deactivated → 403 with appropriate message
- [ ] Wrong password: increment failed_login_attempts, if reaches 5 → lock account
- [ ] OTP: 6-digit, expires 10 minutes, stored as bcrypt hash
- [ ] POST `/api/v1/auth/verify-otp` → verifies OTP, issues access + refresh tokens
- [ ] Access token: 7 days, Refresh token: 30 days
- [ ] New login invalidates previous session of same device type
- [ ] POST `/api/v1/auth/logout` → invalidates current session token
- [ ] POST `/api/v1/auth/refresh` → issues new access token using refresh token
- [ ] POST `/api/v1/auth/resend-otp` → resends OTP (rate limited: 3 per 15 min)
- [ ] Successful login → reset failed_login_attempts to 0

**Testing Checklist:**
- [ ] Valid credentials → OTP sent, email_logs updated
- [ ] Wrong password (5 times) → account locked on 5th
- [ ] Locked account login → 423 error
- [ ] Valid OTP → access + refresh tokens returned
- [ ] Expired OTP (wait 11 min) → OTP_EXPIRED error
- [ ] Used OTP reuse → OTP_INVALID error
- [ ] Logout → session invalidated, can't use old token
- [ ] Refresh token → new access token issued

**Things Cursor Must NOT Modify:**
- `backend/src/controllers/auth.controller.js` (registration part)
- Any service files from Phase 3

---

## TASK 4.3 — Password Reset & Email Change API

**Goal:**
Build password reset via Email OTP and email change request system with admin approval.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 3.4 for password reset
- Read PROJECT_KNOWLEDGE.md Section 5.6 for email change
- Password reset: Email OTP only (no security questions)
- Email change: requires admin approval
- Locked accounts can use password reset to unlock themselves

**Files to Modify:**
- `backend/src/controllers/auth.controller.js` — add reset password functions
- `backend/src/routes/auth.routes.js` — add reset routes

**Acceptance Criteria:**
- [ ] POST `/api/v1/auth/forgot-password` → sends OTP to email, creates otp_verification record with purpose: reset_password
- [ ] POST `/api/v1/auth/reset-password` → verifies OTP, updates password, unlocks account if locked, resets failed_login_attempts to 0
- [ ] POST `/api/v1/investor/profile/request-email-change` → creates profile_update_request for email field (requires auth)
- [ ] Email change request creates TKT-PRF transaction ID
- [ ] Admin notification created for email change request
- [ ] Investor notified by email when email change approved/rejected

**Testing Checklist:**
- [ ] Forgot password → OTP received
- [ ] Reset with valid OTP → password changed, can login with new password
- [ ] Reset with expired OTP → OTP_EXPIRED error
- [ ] Locked account reset → account unlocked after successful reset
- [ ] Email change request → profile_update_requests record created

**Things Cursor Must NOT Modify:**
- Login and registration functions already built

---

## TASK 4.4 — Admin Authentication API

**Goal:**
Build admin login system with Email OTP, Super Admin creation of new admins, and admin profile management.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 3.2 for admin login
- Admin login same flow as investor: Email+Password → OTP → JWT
- Super Admin creates new admins (not self-registration)
- Super Admin can suspend/delete admins
- Admin can change own password

**Files to Create:**
- `backend/src/controllers/admin.controller.js`
- `backend/src/routes/admin.routes.js`
- `backend/src/models/admin.model.js`

**Files to Modify:**
- `backend/src/app.js` — register admin routes

**Acceptance Criteria:**
- [ ] POST `/api/v1/auth/admin/login` → same OTP flow as investor login
- [ ] Suspended admin → 403 with "Account suspended"
- [ ] POST `/api/v1/admin/admins` (Super Admin only) → create new admin with: name, email, password, mobile, role
- [ ] New admin created → welcome email with login instructions
- [ ] GET `/api/v1/admin/admins` (Super Admin only) → list all admins
- [ ] PATCH `/api/v1/admin/admins/:id/suspend` (Super Admin only) → suspend admin
- [ ] PATCH `/api/v1/admin/admins/:id/unsuspend` (Super Admin only) → unsuspend
- [ ] DELETE `/api/v1/admin/admins/:id` (Super Admin only) → delete admin (soft delete)
- [ ] PATCH `/api/v1/admin/profile/password` → admin changes own password (requires current password)
- [ ] All admin actions logged in audit_activity_logs

**Testing Checklist:**
- [ ] Admin login → OTP flow works same as investor
- [ ] Suspended admin → 403 error
- [ ] Non-Super-Admin tries to create admin → 403
- [ ] Super Admin creates admin → admin in DB, welcome email sent
- [ ] Super Admin suspends admin → admin cannot login
- [ ] Admin changes own password → new password works

**Things Cursor Must NOT Modify:**
- Investor auth functions
- Any Phase 3 service files

---

## TASK 4.5 — Session Management & Security

**Goal:**
Implement complete session tracking (1 mobile + 1 web per user), IP-based suspicious activity detection, and account unlock automation.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 3.1 for session rules
- Read PROJECT_KNOWLEDGE.md Section 23 for security edge cases
- Concurrent session: new login on same device type kills old session
- Suspicious activity: multiple accounts from same IP → admin alert

**Files to Create:**
- `backend/src/services/session.service.js`

**Files to Modify:**
- `backend/src/services/auth.service.js` — integrate session management
- `backend/src/middleware/auth.middleware.js` — check session validity

**Acceptance Criteria:**
- [ ] Session tracked in DB: user_id, device_type (mobile/web), token_hash, is_active
- [ ] New login on mobile → previous mobile session invalidated
- [ ] New login on web → previous web session invalidated
- [ ] Mobile and web can be active simultaneously (1 each)
- [ ] Token validation checks session is still active in DB
- [ ] `detectSuspiciousIP(ip)` → if same IP registers 3+ accounts in 24hrs → admin alert
- [ ] Alert stored in admin notification center + email to Super Admin
- [ ] Suspicious activity logged in admin_activity_logs

**Testing Checklist:**
- [ ] Login on mobile twice → only latest mobile session valid
- [ ] Login on mobile + web → both sessions valid simultaneously
- [ ] Use old mobile token after new mobile login → 401 invalid session
- [ ] Register 3 accounts from same IP → admin alert triggered
- [ ] Concurrent edit detection works for admin panel

**Things Cursor Must NOT Modify:**
- Investor and admin auth controllers
- Registration functions

---

## TASK 4.6 — Account Unlock Cron & Rate Limit Cleanup

**Goal:**
Implement the automatic account unlock cron job that runs at 12 AM IST and cleans up expired OTPs and rate limit data.

**Context:**
- Account locked at 5 failed attempts
- Auto-unlock at 12:00 AM IST daily
- Expired OTPs cleaned from DB nightly

**Files to Create:**
- `backend/src/crons/unlock.cron.js`

**Files to Modify:**
- `backend/server.js` — register all crons on startup

**Acceptance Criteria:**
- [ ] Cron runs at 12:00 AM IST daily
- [ ] Finds all investors with status: locked AND locked_reason: failed_attempts
- [ ] Resets status to: active, resets failed_login_attempts to 0
- [ ] Cron execution logged in cron_job_logs
- [ ] Deletes OTP records older than 1 hour
- [ ] Cron failure → logged but does NOT alert admin (non-critical)

**Testing Checklist:**
- [ ] Set test investor to locked → cron runs → investor unlocked
- [ ] Cron log created with success status and count of unlocked accounts
- [ ] Old OTP records cleaned up

**Things Cursor Must NOT Modify:**
- Any auth controller functions
- Any Phase 3 service files

---

---

# PHASE 5: CAPITAL MODULE

---

## TASK 5.1 — Capital Add Request API

**Goal:**
Build the investor-facing capital deposit request API with all validations, file upload, duplicate UTR check, and admin notification.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 6.3 for complete flow
- Validates: min ₹10,000, max ₹10,00,000, UTR globally unique
- Payment screenshot required (file upload)
- Transaction ID generated on submission
- Admin notified via notification + email

**Files to Create:**
- `backend/src/controllers/capital.controller.js`
- `backend/src/routes/capital.routes.js`
- `backend/src/models/capital.model.js`

**Files to Modify:**
- `backend/src/app.js` — register capital routes

**Acceptance Criteria:**
- [ ] POST `/api/v1/investor/capital/deposit` → authenticated investor only
- [ ] Required fields: amount, transfer_date, utr_number, payment_screenshot (file), remark (optional)
- [ ] Validates: amount ≥ 10000, amount ≤ 1000000
- [ ] Checks: UTR not used by any investor (globally)
- [ ] Generates TKT-CAP-DEP-YYYY-XXXXX transaction ID
- [ ] Saves: capital_transaction record with status: submitted
- [ ] Investor notification created
- [ ] Admin notification + email triggered (async)
- [ ] Returns: `{ success: true, message: "Your request has been received. Your account will be updated within 24-48 hours upon verification. Thank you for your request.", transactionId: "TKT-CAP-DEP-2024-00001" }`
- [ ] GET `/api/v1/investor/capital/transactions` → investor's capital transactions (paginated)
- [ ] GET `/api/v1/investor/capital/balance` → current capital balance + pending withdrawal amount

**Testing Checklist:**
- [ ] Valid request → transaction created, TXN ID returned
- [ ] Amount < 10000 → 400 CAPITAL_BELOW_MINIMUM
- [ ] Amount > 1000000 → 400 CAPITAL_ABOVE_MAXIMUM
- [ ] Duplicate UTR → 409 USER_UTR_EXISTS
- [ ] No screenshot attached → 400 validation error
- [ ] Admin notification created (check DB)
- [ ] Capital balance returns correct amount

**Things Cursor Must NOT Modify:**
- Auth controllers and routes
- Any Phase 3 service files

---

## TASK 5.2 — Capital Withdrawal Request API

**Goal:**
Build the investor-facing capital/revenue withdrawal request API with all validations including lock check, frequency check, UPI limit, and balance check.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 6.4 for complete withdrawal flow
- Read PROJECT_KNOWLEDGE.md Section 6.5 for capital lock rules
- UPI: max ₹1,00,000 only
- Frequency checked against admin-set limit per investor
- Amount immediately deducted on submission
- Read PROJECT_KNOWLEDGE.md Section 10 for status lifecycle

**Files to Modify:**
- `backend/src/controllers/capital.controller.js` — add withdrawal functions
- `backend/src/routes/capital.routes.js` — add withdrawal routes
- `backend/src/models/capital.model.js` — add withdrawal model functions

**Acceptance Criteria:**
- [ ] POST `/api/v1/investor/capital/withdraw` → authenticated investor only
- [ ] Validates: amount ≥ 1000
- [ ] If account_type = capital AND capital locked → 400 CAPITAL_LOCKED with lock message
- [ ] Checks withdrawal frequency: count requests this month vs admin-set limit
- [ ] If frequency exceeded → 400 WITHDRAWAL_FREQUENCY_EXCEEDED with message
- [ ] If insufficient balance → 400 WITHDRAWAL_INSUFFICIENT_BALANCE
- [ ] If transfer_mode = upi AND amount > 100000 → 400 with UPI limit message
- [ ] Amount immediately deducted from balance (capital or revenue)
- [ ] Status set to: submitted
- [ ] "Pending withdrawal" amount tracked separately for display
- [ ] Generates TKT-CAP-WDR-YYYY-XXXXX ID
- [ ] PATCH `/api/v1/investor/capital/withdraw/:id/cancel` → investor cancels own pending request (only submitted/under_review status)
- [ ] Cancel → amount immediately restored to balance

**Testing Checklist:**
- [ ] Valid withdrawal → balance deducted immediately
- [ ] Capital locked → 400 error with lock message
- [ ] Amount < 1000 → 400 WITHDRAWAL_BELOW_MINIMUM
- [ ] UPI + amount > 100000 → 400 error
- [ ] Frequency exceeded → 400 error
- [ ] Insufficient balance → 400 error
- [ ] Cancel pending → balance restored immediately
- [ ] Can't cancel approved request → 400 error

**Things Cursor Must NOT Modify:**
- Capital deposit functions
- Auth middleware

---

## TASK 5.3 — Admin Capital Management API

**Goal:**
Build all admin-facing capital management APIs: view investor capital, approve/reject/modify deposit requests, manage withdrawal requests, set lock status, add/deduct capital directly.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 6.6 for admin capital powers
- Admin can modify amount at approval time (both original + approved amounts stored)
- Admin can bulk approve withdrawals
- All admin actions logged in audit log
- Email sent to investor on every capital action

**Files to Create:**
- `backend/src/controllers/adminCapital.controller.js`
- `backend/src/routes/adminCapital.routes.js`

**Files to Modify:**
- `backend/src/app.js` — register admin capital routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/capital/investors` → list all investors with capital summary
- [ ] GET `/api/v1/admin/capital/investor/:id` → single investor capital details + transactions
- [ ] GET `/api/v1/admin/capital/requests` → all pending deposit/withdrawal requests (filterable)
- [ ] PATCH `/api/v1/admin/capital/deposit/:id/approve` → approve deposit (with optional amount modification), capital credited
- [ ] PATCH `/api/v1/admin/capital/deposit/:id/reject` → reject with reason, investor notified
- [ ] PATCH `/api/v1/admin/capital/withdraw/:id/approve` → approve withdrawal (with optional payment details)
- [ ] PATCH `/api/v1/admin/capital/withdraw/:id/process` → mark as processed (payment initiated)
- [ ] PATCH `/api/v1/admin/capital/withdraw/:id/complete` → mark complete with UTR
- [ ] PATCH `/api/v1/admin/capital/withdraw/:id/reject` → reject with reason, amount restored
- [ ] POST `/api/v1/admin/capital/withdraw/bulk-approve` → bulk approve array of IDs
- [ ] POST `/api/v1/admin/capital/investor/:id/credit` → admin directly credits capital
- [ ] POST `/api/v1/admin/capital/investor/:id/debit` → admin directly debits capital (check balance)
- [ ] PATCH `/api/v1/admin/capital/investor/:id/lock` → lock capital withdrawals
- [ ] PATCH `/api/v1/admin/capital/investor/:id/unlock` → unlock capital withdrawals
- [ ] POST `/api/v1/admin/capital/investor/:id/undo` → undo last capital action (reversible)
- [ ] All actions → email to investor + audit log entry
- [ ] Auto-cancel pending withdrawal if capital locked: when locking capital → find all pending withdrawal requests from capital A/C → auto-cancel them → investor notified

**Testing Checklist:**
- [ ] Approve deposit with modified amount → both original + approved stored
- [ ] Approve withdrawal → status changes through lifecycle
- [ ] Bulk approve 3 withdrawals → all approved
- [ ] Lock capital → investor's pending capital withdrawal auto-cancelled
- [ ] Admin debit → balance cannot go negative (error if insufficient)
- [ ] Undo last action → previous state restored
- [ ] All actions appear in audit log

**Things Cursor Must NOT Modify:**
- Investor-facing capital APIs
- Auth middleware and routes

---

## TASK 5.4 — Capital Balance Calculation Service

**Goal:**
Build the capital balance calculation service that computes real-time capital balance, revenue balance, total balance, and pending withdrawal amounts.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 9 for exact balance formulas
- Capital Balance = Total Approved Deposits - Total Approved Capital Withdrawals
- Revenue Balance = Total Revenue Credited - Total Revenue Withdrawn
- Total Balance = Capital Balance + Revenue Balance
- Pending = amounts in submitted/under_review status

**Files to Create:**
- `backend/src/services/balance.service.js`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] `getCapitalBalance(investorId)` → current capital balance (integer)
- [ ] `getRevenueBalance(investorId)` → current revenue balance (integer)
- [ ] `getTotalBalance(investorId)` → capital + revenue
- [ ] `getPendingWithdrawal(investorId)` → total amount in pending withdrawal requests
- [ ] `getEffectiveROI(investorId)` → (total revenue earned / total capital) * 100
- [ ] All functions handle zero/null values gracefully
- [ ] All amounts as whole integers

**Testing Checklist:**
- [ ] New investor → all balances = 0
- [ ] After deposit approval → capital balance increases
- [ ] After revenue credit → revenue balance increases
- [ ] Pending withdrawal → shown separately, deducted from displayed balance
- [ ] Effective ROI → correct percentage

**Things Cursor Must NOT Modify:**
- Capital controller and routes
- ROI service

---

## TASK 5.5 — Capital Withdrawal Frequency Checker

**Goal:**
Build the frequency checking service that enforces admin-set withdrawal frequency limits per investor.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 6.1 for frequency rules
- Admin sets withdrawal frequency per investor (e.g., 2 times per month)
- System blocks if limit exceeded
- Separate tracking for capital and revenue withdrawals

**Files to Modify:**
- `backend/src/services/balance.service.js` — add frequency check functions

**Acceptance Criteria:**
- [ ] `getWithdrawalFrequencyLimit(investorId)` → returns admin-set limit (times per month)
- [ ] `getWithdrawalCountThisMonth(investorId, accountType)` → returns count this month
- [ ] `canWithdraw(investorId, accountType)` → returns { allowed: bool, remaining: int, message: string }
- [ ] Counts only: submitted, under_review, approved, processed, completed (not cancelled/rejected)
- [ ] Month = current calendar month (1st to last day)

**Testing Checklist:**
- [ ] Limit = 2, count = 0 → can withdraw (2 remaining)
- [ ] Limit = 2, count = 2 → cannot withdraw (0 remaining)
- [ ] Rejected withdrawal → doesn't count toward limit
- [ ] New month starts → count resets

**Things Cursor Must NOT Modify:**
- Capital controller
- Existing balance service functions

---

## TASK 5.6 — 48-Hour Pending Withdrawal Reminder Cron

**Goal:**
Build the cron job that checks for withdrawal requests pending more than 48 hours and sends admin reminders.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 17 for cron schedule
- Check all submitted/under_review withdrawal requests older than 48 hours
- Send reminder to admins via notification + email
- Run as part of the daily cron schedule (real-time check via scheduler)

**Files to Create:**
- `backend/src/crons/withdrawal.cron.js`

**Files to Modify:**
- `backend/server.js` — register withdrawal cron

**Acceptance Criteria:**
- [ ] Cron checks every hour for withdrawal requests > 48 hours old with status submitted/under_review
- [ ] Sends admin notification + email for each overdue request
- [ ] Notification includes: investor name, amount, request date, transaction ID
- [ ] Does NOT send duplicate reminders for same request (track last_reminded_at)
- [ ] Adds `last_reminded_at` field tracking to withdrawal requests
- [ ] Cron execution logged

**Testing Checklist:**
- [ ] Create withdrawal request → set created_at to 49 hours ago → cron triggers reminder
- [ ] Reminder sent → last_reminded_at updated
- [ ] Second cron run on same request → no duplicate reminder (within same 24-hour window)

**Things Cursor Must NOT Modify:**
- Capital controller and routes
- Balance service

---

---

# PHASE 6: REVENUE ENGINE

---

## TASK 6.1 — ROI Settings Management API

**Goal:**
Build admin APIs to set, view, and manage ROI settings (default and term-based) for each investor.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 7.1 for ROI system
- Every investor has one default ROI (always active)
- Term-based ROI has start + end date (overrides default for that period)
- No gaps allowed — default fills any gaps
- ROI term expiry alert sent 1 day before end

**Files to Create:**
- `backend/src/controllers/revenue.controller.js`
- `backend/src/routes/revenue.routes.js`
- `backend/src/models/revenue.model.js`

**Files to Modify:**
- `backend/src/app.js` — register revenue routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/revenue/investor/:id/roi` → get all ROI settings for investor
- [ ] POST `/api/v1/admin/revenue/investor/:id/roi/default` → set default ROI percentage
- [ ] POST `/api/v1/admin/revenue/investor/:id/roi/term` → add term-based ROI (start_date, end_date, percentage)
- [ ] DELETE `/api/v1/admin/revenue/investor/:id/roi/term/:termId` → remove a term
- [ ] GET `/api/v1/admin/revenue/investor/:id/roi/active?date=2024-07-15` → returns active ROI for given date
- [ ] PATCH `/api/v1/admin/revenue/settings/:id` → update credit frequency, withdrawal frequency, pause/resume
- [ ] All actions logged in audit log
- [ ] ROI term expiry tomorrow → admin notification + email (via cron, registered separately)

**Testing Checklist:**
- [ ] Set default ROI 30% → active when no term applies
- [ ] Add term ROI 35% for July → July uses 35%
- [ ] Get active ROI for July date → returns 35%
- [ ] Get active ROI for August date (no term) → returns 30% (default)
- [ ] Delete term → July reverts to default 30%

**Things Cursor Must NOT Modify:**
- Capital module files
- Auth files

---

## TASK 6.2 — Daily Revenue Credit Cron

**Goal:**
Build the core daily revenue credit cron job that runs at the admin-configured time, calculates and credits revenue for all active investors.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 7.4 for credit system
- Read PROJECT_INSTRUCTIONS.md Section 9 for cron job rules
- This is the most critical automated job in the system
- Time read from global_settings table (not hardcoded)
- Skip: paused, deleted, pending, self_deactivated investors
- Each investor processed independently (one failure doesn't stop others)
- Retry failed investors once after 5 minutes

**Files to Create:**
- `backend/src/crons/revenue.cron.js`

**Files to Modify:**
- `backend/server.js` — register revenue cron (dynamic time from DB)

**Acceptance Criteria:**
- [ ] Cron time loaded from global_settings at startup (not hardcoded)
- [ ] If global credit time changes → cron reschedules automatically (check every 5 min for setting changes)
- [ ] Gets list of all active, non-paused investors
- [ ] For each investor: calls roi.service.getDailyAmount(investorId, today)
- [ ] If amount > 0: creates revenue_credit record with TKT-REV-CR ID
- [ ] Updates monthly_revenue_tracking (credited_total, days_credited)
- [ ] Checks idempotency: if already credited today → skip
- [ ] Investor notification + email sent after each credit (async)
- [ ] Failed investor: retry once after 5 minutes
- [ ] After retry failure: log + admin email alert with investor details
- [ ] End of month last day: remaining amount credited (may differ from range)
- [ ] Cron log: total investors, total amount, success count, fail count
- [ ] Timezone: all operations in IST

**Testing Checklist:**
- [ ] Run cron manually → all active investors get credited
- [ ] Paused investor → skipped
- [ ] Already credited today → not double credited (idempotency)
- [ ] Daily amount within 90-110% range (except last day)
- [ ] Monthly total does not exceed ROI amount
- [ ] Cron log in DB with correct counts
- [ ] Email triggered for each credited investor

**Things Cursor Must NOT Modify:**
- ROI service logic
- Capital module

---

## TASK 6.3 — Revenue Transactions API (Investor)

**Goal:**
Build investor-facing revenue APIs for viewing daily credits, monthly totals, overall totals, and filtering by month/year.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 20.3 for Revenue page structure
- Show: date, description, credit, debit, balance
- Monthly total, overall total, total withdrawn

**Files to Modify:**
- `backend/src/controllers/revenue.controller.js` — add investor revenue functions
- `backend/src/routes/revenue.routes.js` — add investor routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/investor/revenue/transactions` → paginated revenue transactions (infinite scroll support via cursor)
- [ ] Query params: month, year for filtering
- [ ] Response includes: transaction_id, date, description, credit_amount, debit_amount, type
- [ ] GET `/api/v1/investor/revenue/summary` → monthly_total, overall_total, total_withdrawn, revenue_balance
- [ ] GET `/api/v1/investor/revenue/monthly?month=7&year=2024` → specific month's transactions + total

**Testing Checklist:**
- [ ] Create test revenue credits → appear in transaction list
- [ ] Filter by month → only that month's transactions returned
- [ ] Summary totals → mathematically correct
- [ ] Pagination works (web: page-based, mobile: cursor-based)

**Things Cursor Must NOT Modify:**
- Revenue cron
- Admin ROI APIs

---

## TASK 6.4 — Admin Revenue Management API

**Goal:**
Build admin APIs for viewing investor revenue, manually adding/deducting revenue, editing/reversing entries, and pause/resume controls.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 7.8 for admin revenue powers
- Manual entries get TKT-ADM transaction IDs
- Reverse creates a counter-entry (not delete)
- Revenue balance cannot go negative on manual deduction

**Files to Modify:**
- `backend/src/controllers/revenue.controller.js` — add admin revenue functions
- `backend/src/routes/revenue.routes.js` — add admin routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/revenue/investor/:id/transactions` → all revenue transactions for investor
- [ ] GET `/api/v1/admin/revenue/investor/:id/summary` → revenue summary with ROI info
- [ ] POST `/api/v1/admin/revenue/investor/:id/credit` → manually credit revenue (date, amount, remark)
- [ ] POST `/api/v1/admin/revenue/investor/:id/debit` → manually debit revenue (check: balance won't go negative)
- [ ] PATCH `/api/v1/admin/revenue/entry/:id/reverse` → reverse a specific entry (creates counter-entry, marks original reversed)
- [ ] PATCH `/api/v1/admin/revenue/investor/:id/pause` → pause daily credit
- [ ] PATCH `/api/v1/admin/revenue/investor/:id/resume` → resume daily credit
- [ ] All manual entries get TKT-ADM transaction ID
- [ ] Investor email sent on all manual credit/debit
- [ ] All actions logged in audit log

**Testing Checklist:**
- [ ] Manual credit → balance increases, email sent
- [ ] Manual debit → balance decreases
- [ ] Manual debit exceeding balance → 400 error
- [ ] Reverse entry → original marked reversed, counter-entry created, balance adjusted
- [ ] Pause → cron skips investor next day
- [ ] Resume → cron includes investor next day

**Things Cursor Must NOT Modify:**
- Cron files
- ROI service
- Investor revenue APIs

---

## TASK 6.5 — Monthly Revenue Tracking & End-of-Month Logic

**Goal:**
Build the monthly revenue tracking system that monitors credited amounts vs expected totals and handles end-of-month remaining amount credits.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 7.9 for end-of-month rules
- Last day of month: remaining amount credited regardless of range
- New month: fresh tracking record created
- Monthly tracking used by cron to calculate daily amounts

**Files to Modify:**
- `backend/src/services/roi.service.js` — add monthly tracking functions
- `backend/src/crons/revenue.cron.js` — integrate monthly tracking

**Acceptance Criteria:**
- [ ] `getMonthlyTracking(investorId, year, month)` → returns or creates tracking record
- [ ] `updateMonthlyTracking(investorId, year, month, amount)` → updates credited_total, days_credited
- [ ] `isLastDayOfMonth(date)` → checks if given date is last day
- [ ] On last day: daily amount = monthly_total - credited_so_far (any amount)
- [ ] On month change: new tracking record created automatically
- [ ] `getMonthlyExpected(investorId, year, month)` → calculates expected monthly ROI total
- [ ] Handles pro-rated months (investor joined mid-month)

**Testing Checklist:**
- [ ] Track 30 daily credits → day 30 = remaining amount
- [ ] Sum of 30 days = monthly ROI total exactly
- [ ] New month → fresh tracking starts at 0
- [ ] Pro-rated month → expected total is proportional

**Things Cursor Must NOT Modify:**
- Revenue cron (day-to-day logic)
- Admin revenue APIs

---

## TASK 6.6 — ROI Term Expiry Alert Cron

**Goal:**
Build the cron job that checks for ROI terms expiring tomorrow and sends admin alerts.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 17 for cron details
- Alert sent 1 day before term end date
- Alert to admin notification center + email

**Files to Create:**
- `backend/src/crons/roiAlert.cron.js`

**Files to Modify:**
- `backend/server.js` — register ROI alert cron

**Acceptance Criteria:**
- [ ] Cron runs at 12:00 AM IST daily
- [ ] Finds all ROI terms where end_date = tomorrow
- [ ] For each: sends admin notification + email with investor name, current rate, expiry date
- [ ] Message: "ROI term for [Investor Name] expires tomorrow ([Date]). Default ROI will apply unless renewed."
- [ ] Cron logged in cron_job_logs

**Testing Checklist:**
- [ ] Create term ending tomorrow → cron sends alert
- [ ] Create term ending in 2 days → no alert
- [ ] Term already ended → no alert

**Things Cursor Must NOT Modify:**
- Revenue cron
- Monthly tracking functions

---

## TASK 6.7 — Revenue Credit Settings API

**Goal:**
Build admin APIs to manage global revenue credit time and per-investor credit/withdrawal frequency settings.

**Context:**
- Global credit time: Super Admin sets, affects all investors
- Per-investor: credit frequency (daily/weekly/monthly), withdrawal frequency
- Time change should reschedule cron dynamically

**Files to Create:**
- `backend/src/controllers/settings.controller.js`
- `backend/src/routes/settings.routes.js`

**Files to Modify:**
- `backend/src/app.js` — register settings routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/settings` → all global settings
- [ ] PATCH `/api/v1/admin/settings` (Super Admin only) → update any setting
- [ ] When revenue_credit_hour/minute updated → cron reschedules
- [ ] PATCH `/api/v1/admin/revenue/investor/:id/settings` → update per-investor settings
- [ ] Settings cached in memory after first load (refresh on change)
- [ ] GET `/api/v1/admin/settings/maintenance` → get maintenance mode status
- [ ] PATCH `/api/v1/admin/settings/maintenance` (Super Admin only) → toggle maintenance mode
- [ ] Maintenance mode ON → investor API returns 503 with maintenance message

**Testing Checklist:**
- [ ] Change credit time from 6 PM to 8 PM → cron reschedules
- [ ] Enable maintenance mode → investor API returns 503
- [ ] Disable maintenance mode → investor API works normally
- [ ] Settings cached → fast repeated reads

**Things Cursor Must NOT Modify:**
- Revenue cron
- ROI management APIs

---

---

# PHASE 7: WITHDRAWAL SYSTEM

---

## TASK 7.1 — Revenue Withdrawal API (Investor)

**Goal:**
Build the investor-facing revenue withdrawal API with balance checks, frequency limits, and minimum amount validation.

**Context:**
- Revenue withdrawal works same as capital withdrawal but from revenue balance
- Revenue balance cannot go negative
- Same frequency limit applies (admin-set per investor)
- Read PROJECT_KNOWLEDGE.md Section 7.7

**Files to Modify:**
- `backend/src/controllers/capital.controller.js` — add revenue withdrawal functions
- `backend/src/routes/capital.routes.js` — add revenue withdrawal routes

**Acceptance Criteria:**
- [ ] POST `/api/v1/investor/revenue/withdraw` → authenticated investor only
- [ ] Validates: amount ≥ 1000
- [ ] Check revenue balance ≥ amount (after pending deductions)
- [ ] Check withdrawal frequency for revenue account
- [ ] If UPI + amount > 100000 → blocked
- [ ] Amount deducted immediately from revenue balance
- [ ] Generates TKT-REV-WDR-YYYY-XXXXX
- [ ] "Pending withdrawal" note shown below revenue balance

**Testing Checklist:**
- [ ] Valid revenue withdrawal → balance deducted
- [ ] Insufficient revenue balance → 400 error
- [ ] Frequency exceeded → 400 error
- [ ] Revenue balance goes exactly to 0 → allowed
- [ ] Revenue balance cannot go negative

**Things Cursor Must NOT Modify:**
- Capital withdrawal functions
- Revenue cron

---

## TASK 7.2 — Admin Withdrawal Management API

**Goal:**
Build admin APIs to view, process, approve, and complete all withdrawal requests across capital and revenue accounts.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 10 for status lifecycle
- Admin completes actual bank/UPI transfer outside the app
- Admin then records payment date + UTR in app
- Bulk approve supported

**Files to Create:**
- `backend/src/controllers/adminWithdrawal.controller.js`
- `backend/src/routes/adminWithdrawal.routes.js`

**Files to Modify:**
- `backend/src/app.js` — register admin withdrawal routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/withdrawals` → all withdrawal requests (filterable by status, account_type, date)
- [ ] GET `/api/v1/admin/withdrawals/pending` → only pending requests
- [ ] PATCH `/api/v1/admin/withdrawals/:id/review` → move to under_review
- [ ] PATCH `/api/v1/admin/withdrawals/:id/approve` → approve, investor notified
- [ ] PATCH `/api/v1/admin/withdrawals/:id/process` → mark processed (payment initiated externally)
- [ ] PATCH `/api/v1/admin/withdrawals/:id/complete` → complete with payment_date + payment_utr (both optional)
- [ ] PATCH `/api/v1/admin/withdrawals/:id/reject` → reject with remark, amount restored immediately
- [ ] POST `/api/v1/admin/withdrawals/bulk-approve` → bulk approve array of IDs
- [ ] Investor email sent at each status change
- [ ] Audit log created for each action
- [ ] Double-processing prevention: if 2 admins hit approve simultaneously → only first processed

**Testing Checklist:**
- [ ] Full lifecycle: submitted → review → approved → processed → completed
- [ ] Rejection → amount restored, investor email
- [ ] Bulk approve 5 withdrawals → all approved
- [ ] Double-approve prevention: same request approved twice → second fails gracefully

**Things Cursor Must NOT Modify:**
- Investor withdrawal APIs
- Capital APIs

---

## TASK 7.3 — Withdrawal Transaction History API

**Goal:**
Build investor-facing APIs for viewing complete withdrawal history across both capital and revenue accounts with filters.

**Files to Modify:**
- `backend/src/controllers/capital.controller.js` — add history functions
- `backend/src/routes/capital.routes.js` — add history routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/investor/withdrawals` → all withdrawals (capital + revenue combined, paginated)
- [ ] GET `/api/v1/investor/withdrawals?account_type=capital` → filter by account type
- [ ] GET `/api/v1/investor/withdrawals?status=completed` → filter by status
- [ ] Response: transaction_id, date, amount, account_type, transfer_mode, status, payment_utr
- [ ] GET `/api/v1/investor/withdrawals/summary` → total_withdrawn_capital, total_withdrawn_revenue, total_withdrawn_all

**Testing Checklist:**
- [ ] Both capital + revenue withdrawals appear in combined list
- [ ] Filter works correctly
- [ ] Summary totals correct

**Things Cursor Must NOT Modify:**
- Admin withdrawal APIs
- Revenue cron

---

## TASK 7.4 — Investor Dashboard Summary API

**Goal:**
Build the investor dashboard summary API that returns all data needed for the dashboard in a single optimized call.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 20.2 for dashboard structure
- Return: capital balance, revenue balance, total balance, effective ROI, joining date, recent transactions, chart data
- Single API call for entire dashboard (performance)

**Files to Create:**
- `backend/src/controllers/dashboard.controller.js`
- `backend/src/routes/dashboard.routes.js`

**Files to Modify:**
- `backend/src/app.js` — register dashboard routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/investor/dashboard` → all dashboard data in one response
- [ ] Returns: capital_balance, revenue_balance, total_balance, pending_withdrawal, effective_roi, joining_date
- [ ] Returns: last_5_capital_transactions, last_5_revenue_transactions
- [ ] Returns: monthly_revenue_chart (last 6 months data for chart)
- [ ] Returns: capital_growth_chart (capital balance over time)
- [ ] Returns: kyc_status, profile_completion_percentage, banner_dismissed
- [ ] Response cached for 5 minutes (React Query handles client-side)

**Testing Checklist:**
- [ ] Dashboard API returns all required fields
- [ ] Chart data has 6 months of history
- [ ] New investor (no transactions) → all zeroes, no errors
- [ ] KYC status correct

**Things Cursor Must NOT Modify:**
- Withdrawal APIs
- Revenue APIs

---

## TASK 7.5 — Admin Dashboard Summary API

**Goal:**
Build the admin dashboard summary API with investor stats, capital under management, today's revenue schedule, real-time activity feed, and financial summary.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 15 for admin dashboard content
- Real-time activity feed (last 20 activities)
- Today's revenue schedule preview
- Top investors list

**Files to Create:**
- `backend/src/controllers/adminDashboard.controller.js`
- `backend/src/routes/adminDashboard.routes.js`

**Files to Modify:**
- `backend/src/app.js` — register admin dashboard routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/dashboard` → complete admin dashboard data
- [ ] Returns: total_investors (active/paused/pending breakdown), total_capital, revenue_today, pending_approvals_count, active_tickets_count
- [ ] Returns: today_revenue_schedule { time, investor_count, total_amount }
- [ ] Returns: top_investors_by_capital (top 5), top_investors_by_roi (top 5)
- [ ] Returns: financial_summary { total_capital, monthly_revenue, monthly_withdrawals, net_liability }
- [ ] Returns: recent_activity (last 20 activities)
- [ ] GET `/api/v1/admin/dashboard?from=2024-06-01&to=2024-06-30` → date-range filtered stats

**Testing Checklist:**
- [ ] Dashboard returns all required sections
- [ ] Date range filter works
- [ ] Pending approvals count is accurate
- [ ] Financial summary totals are correct

**Things Cursor Must NOT Modify:**
- Investor dashboard API
- Admin withdrawal APIs

---

---

# PHASE 8: SUPPORT TICKET SYSTEM

---

## TASK 8.1 — Support Ticket CRUD API (Investor)

**Goal:**
Build investor-facing support ticket APIs: raise ticket, view tickets, view conversation thread, reply, reopen, and attach files.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 11 for complete ticket rules
- Multiple attachments per message
- Conversation thread between investor and admin
- Investor can reopen resolved tickets

**Files to Create:**
- `backend/src/controllers/support.controller.js`
- `backend/src/routes/support.routes.js`
- `backend/src/models/support.model.js`

**Files to Modify:**
- `backend/src/app.js` — register support routes

**Acceptance Criteria:**
- [ ] POST `/api/v1/investor/support/tickets` → create ticket (category, subject, message, attachments[])
- [ ] Ticket ID generated: TKT-SUP-YYYY-XXXXX
- [ ] Status: open
- [ ] Investor confirmation email sent
- [ ] Admin notification created
- [ ] GET `/api/v1/investor/support/tickets` → investor's tickets (filterable by status, category)
- [ ] GET `/api/v1/investor/support/tickets/:id` → ticket detail with full conversation thread
- [ ] POST `/api/v1/investor/support/tickets/:id/reply` → investor reply with optional attachments
- [ ] PATCH `/api/v1/investor/support/tickets/:id/reopen` → reopen resolved ticket (status: open again)
- [ ] Can only reopen resolved tickets (not closed)
- [ ] Multiple attachments per message (max 5MB each, JPG/PNG/PDF)

**Testing Checklist:**
- [ ] Create ticket → TKT-SUP ID generated, email sent
- [ ] Reply with attachment → attachment saved, accessible
- [ ] Reopen resolved ticket → status changes to open
- [ ] Cannot reopen closed ticket → 400 error
- [ ] Filter by status → correct results

**Things Cursor Must NOT Modify:**
- Capital and revenue APIs
- Auth files

---

## TASK 8.2 — Support Ticket Admin API

**Goal:**
Build admin-facing support ticket APIs: view all tickets, reply, change status, assign to admin, and filter/sort.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 11 for ticket rules
- Admin can assign to another admin
- 7+ day escalation handled by separate cron
- Filter: status, category, date, investor name, assigned admin

**Files to Modify:**
- `backend/src/controllers/support.controller.js` — add admin functions
- `backend/src/routes/support.routes.js` — add admin routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/support/tickets` → all tickets (filterable, sortable, paginated)
- [ ] Filters: status, category, investor_id, assigned_to, date_from, date_to
- [ ] Sort: by date, by status, by investor name, by category
- [ ] GET `/api/v1/admin/support/tickets/:id` → ticket detail with full conversation
- [ ] POST `/api/v1/admin/support/tickets/:id/reply` → admin reply with optional attachments
- [ ] Reply → investor email notification
- [ ] PATCH `/api/v1/admin/support/tickets/:id/status` → change status (in_progress/resolved/closed)
- [ ] On resolved/closed → investor email notification
- [ ] PATCH `/api/v1/admin/support/tickets/:id/assign` → assign to another admin
- [ ] Assigned admin notified via in-app notification
- [ ] Escalated tickets (7+ days) highlighted in list (is_escalated flag)

**Testing Checklist:**
- [ ] Admin reply → investor receives email
- [ ] Status change to resolved → investor email sent
- [ ] Assign to admin → that admin's notification created
- [ ] Filter combinations → correct results
- [ ] Escalated tickets highlighted

**Things Cursor Must NOT Modify:**
- Investor support APIs
- Capital/revenue APIs

---

## TASK 8.3 — Ticket Escalation Cron

**Goal:**
Build the cron job that runs at 12 AM IST daily, checks for tickets unresolved for 7+ days, and escalates to Super Admin.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 11 rule: 7+ days unresolved → escalate to Super Admin
- Super Admin exclusive permission to resolve escalated tickets
- Escalation: flag ticket + notify Super Admin

**Files to Create:**
- `backend/src/crons/escalation.cron.js`

**Files to Modify:**
- `backend/server.js` — register escalation cron

**Acceptance Criteria:**
- [ ] Cron runs at 12:00 AM IST daily
- [ ] Finds all tickets with status: open/in_progress AND created_at < 7 days ago AND escalated_to_super_admin = false
- [ ] Sets: escalated_to_super_admin = true, escalated_at = now
- [ ] Creates Super Admin notification for each escalated ticket
- [ ] Sends email to Super Admin with ticket details
- [ ] Does not re-escalate already escalated tickets
- [ ] Cron log created

**Testing Checklist:**
- [ ] Ticket 8 days old, open → escalated
- [ ] Ticket 8 days old, already escalated → not re-escalated
- [ ] Ticket 8 days old, closed → not escalated
- [ ] Super Admin notification created
- [ ] Cron log shows correct count

**Things Cursor Must NOT Modify:**
- Support ticket APIs
- Other cron files

---

## TASK 8.4 — Support Summary API

**Goal:**
Build admin support summary APIs for ticket statistics and investor support activity.

**Files to Modify:**
- `backend/src/controllers/support.controller.js` — add summary functions
- `backend/src/routes/support.routes.js` — add summary routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/support/summary` → total tickets, open count, in_progress count, resolved count, escalated count
- [ ] GET `/api/v1/admin/support/investor/:id/tickets` → all tickets from specific investor
- [ ] GET `/api/v1/admin/support/tickets/escalated` → only escalated tickets

**Testing Checklist:**
- [ ] Summary counts match actual ticket statuses
- [ ] Investor-specific tickets filtered correctly
- [ ] Escalated tickets list works

**Things Cursor Must NOT Modify:**
- Escalation cron
- Ticket CRUD APIs

---

## TASK 8.5 — Admin Notification Center API

**Goal:**
Build the admin notification center API with custom broadcast functionality (send to one/selected/all investors).

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 13 for notification rules
- Admin can compose and send custom notifications
- Target: one investor, selected investors (array), all investors
- Creates in-app notification + optional email

**Files to Modify:**
- `backend/src/controllers/notification.controller.js` — add admin functions
- `backend/src/routes/notification.routes.js` — add admin routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/notifications` → admin's own notifications (system alerts, pending approvals)
- [ ] GET `/api/v1/admin/notifications/pending-counts` → { capital_requests, withdrawal_requests, profile_updates, new_registrations, open_tickets }
- [ ] POST `/api/v1/admin/notifications/broadcast` → send custom notification
  - target_type: single/selected/all
  - target_ids: array of investor IDs (for single/selected)
  - title, body, send_email (boolean)
- [ ] Broadcast creates in-app notification for each target investor
- [ ] If send_email=true: sends email to each target investor
- [ ] Broadcast logged in admin_activity_logs

**Testing Checklist:**
- [ ] Broadcast to single investor → 1 notification created
- [ ] Broadcast to selected (3 investors) → 3 notifications created
- [ ] Broadcast to all → notification for every active investor
- [ ] send_email=true → email_logs entries created
- [ ] Pending counts → accurate numbers

**Things Cursor Must NOT Modify:**
- Ticket escalation cron
- Investor notification APIs

---

---

# PHASE 9: EMAIL SYSTEM (CRON JOBS)

---

## TASK 9.1 — Monthly Summary Email Cron

**Goal:**
Build the cron job that sends monthly investment summary emails to all investors on the 1st of each month.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 12.2 for monthly summary trigger
- Sent on 1st of month at 12:00 AM IST
- If server was down on 1st → sent when server recovers (same day)
- Contains: previous month revenue, capital balance, withdrawals
- Uses monthly-summary.email.jsx template

**Files to Create:**
- `backend/src/crons/summary.cron.js`

**Files to Modify:**
- `backend/server.js` — register summary cron

**Acceptance Criteria:**
- [ ] Cron runs at 12:00 AM IST on 1st of every month
- [ ] Gets all active investors
- [ ] For each investor: calculates previous month's stats
  - total revenue credited
  - total withdrawals
  - opening capital, closing capital
  - revenue balance
- [ ] Sends monthly-summary email to each investor
- [ ] Tracks sent status in email_logs (one per investor per month)
- [ ] Idempotent: if already sent this month → skips
- [ ] Cron log created

**Testing Checklist:**
- [ ] Run cron manually → emails sent to all active investors
- [ ] Run again → no duplicate emails (idempotency)
- [ ] Email contains correct previous month's data
- [ ] Paused investor → still receives summary (not excluded)
- [ ] Pending investor → excluded from summary

**Things Cursor Must NOT Modify:**
- Escalation cron
- Revenue cron

---

## TASK 9.2 — Email Retry Cron & Delivery Monitoring

**Goal:**
Build the email retry system that automatically retries failed emails and alerts admin after 3 failures.

**Context:**
- Read PROJECT_INSTRUCTIONS.md Section 10.2 for email retry rules
- Retry: 3 times with 5-minute intervals
- After 3 failures: admin alert
- Track all delivery attempts in email_logs

**Files to Modify:**
- `backend/src/services/email.service.js` — add retry logic
- `backend/server.js` — register email retry job

**Acceptance Criteria:**
- [ ] Email retry job runs every 5 minutes
- [ ] Finds all emails with status: failed AND attempts < 3
- [ ] Retries each failed email
- [ ] Updates attempt count and last_attempt_at
- [ ] On success: status → sent
- [ ] After 3rd failure: status → failed (permanent), admin alert email sent
- [ ] Admin alert: "Email delivery failed for [investor_name] - [template_name] after 3 attempts"
- [ ] Retry job itself logged

**Testing Checklist:**
- [ ] Simulate Resend API failure → email marked as failed, retry queued
- [ ] After 5 minutes → retry attempted
- [ ] After 3 failures → admin alert triggered
- [ ] Successful retry → status updated to sent

**Things Cursor Must NOT Modify:**
- Monthly summary cron
- Other cron files

---

## TASK 9.3 — Email Log API

**Goal:**
Build admin API to view email delivery logs with filtering and failed email management.

**Files to Modify:**
- `backend/src/controllers/settings.controller.js` — add email log functions
- `backend/src/routes/settings.routes.js` — add email log routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/email-logs` → all email logs (filterable by status, template, date, investor)
- [ ] GET `/api/v1/admin/email-logs/failed` → only failed emails
- [ ] POST `/api/v1/admin/email-logs/:id/retry` → manually retry a failed email
- [ ] Email log shows: recipient, template, status, attempts, last_attempt_at, error

**Testing Checklist:**
- [ ] Filter by failed status → only failed emails
- [ ] Manual retry → email resent
- [ ] Log shows attempt count correctly

**Things Cursor Must NOT Modify:**
- Email retry cron
- Other cron files

---

## TASK 9.4 — Terms, Privacy & System Pages API

**Goal:**
Build APIs for Terms & Conditions and Privacy Policy management by Super Admin, and public access for registration.

**Context:**
- Both documents editable from admin panel
- Shown during registration (mandatory acceptance)
- Stored in global_settings table

**Files to Modify:**
- `backend/src/controllers/settings.controller.js` — add T&C and privacy functions
- `backend/src/routes/settings.routes.js` — add T&C routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/public/terms` → current T&C content (public, no auth)
- [ ] GET `/api/v1/public/privacy` → current Privacy Policy content (public, no auth)
- [ ] PATCH `/api/v1/admin/settings/terms` (Super Admin only) → update T&C content
- [ ] PATCH `/api/v1/admin/settings/privacy` (Super Admin only) → update Privacy Policy
- [ ] Version history: store previous versions in DB (last 5)
- [ ] GET `/api/v1/admin/settings/terms/history` → version history

**Testing Checklist:**
- [ ] Public T&C accessible without auth
- [ ] Non-Super-Admin cannot update T&C → 403
- [ ] Update T&C → new version saved, old version in history

**Things Cursor Must NOT Modify:**
- Email log API
- Other settings functions

---

## TASK 9.5 — Backup Service (Automated + Manual)

**Goal:**
Build the complete backup system: pg_dump backup, compression, Google Drive upload, and manual trigger.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 18 for backup rules
- Daily at 12 AM IST
- Compressed + encrypted local storage
- Auto-upload to Google Drive date-wise folders
- Admin can trigger manual backup

**Files to Create:**
- `backend/src/services/backup.service.js`
- `backend/src/services/gdrive.service.js`
- `backend/src/crons/backup.cron.js`

**Files to Modify:**
- `backend/server.js` — register backup cron
- `backend/src/controllers/settings.controller.js` — add manual backup trigger
- `backend/src/routes/settings.routes.js` — add backup route

**Acceptance Criteria:**
- [ ] `backup.service.js` runs pg_dump → creates .tar.gz file
- [ ] Backup named: `tikhat_backup_YYYY-MM-DD_HH-mm.tar.gz`
- [ ] Stored in `/backups/` folder
- [ ] Old backups (> 30 days) auto-deleted from local storage
- [ ] `gdrive.service.js` uploads to Google Drive folder: `/TikhatPartnerBackups/YYYY/MM/DD/`
- [ ] Backup cron runs at 12:00 AM IST daily
- [ ] On backup failure → admin email alert
- [ ] On Google Drive upload failure → admin email alert (separate from backup failure)
- [ ] POST `/api/v1/admin/settings/backup` (Super Admin only) → trigger manual backup
- [ ] Backup result returned: file size, local path, Drive URL, timestamp

**Testing Checklist:**
- [ ] Run backup → .tar.gz file created in /backups/
- [ ] File uploaded to Google Drive correct folder
- [ ] 31-day-old backup → automatically deleted
- [ ] Manual backup trigger → backup created immediately
- [ ] Backup failure → admin alert email sent

**Things Cursor Must NOT Modify:**
- Email service
- Other cron files

---

## TASK 9.6 — Backup Cron & Recovery Documentation

**Goal:**
Register all remaining crons, ensure cron startup order is correct, and create recovery documentation.

**Files to Modify:**
- `backend/server.js` — ensure all crons registered correctly
- Create `scripts/restore.sh` — backup restoration script
- Create `backend/RECOVERY.md` — recovery documentation

**Acceptance Criteria:**
- [ ] All 7 crons registered: revenue, unlock, backup, summary, escalation, roiAlert, withdrawal
- [ ] Crons start in correct order on server startup
- [ ] `restore.sh` script: takes backup file path, runs pg_restore, verifies restoration
- [ ] `RECOVERY.md` documents: steps to restore from backup, steps to deploy on new server
- [ ] Health check endpoint includes cron status: GET `/api/health` → `{ server: "ok", database: "ok", crons: { revenue: "active", backup: "active", ... } }`

**Testing Checklist:**
- [ ] Start server → all crons scheduled
- [ ] Health check → all crons shown as active
- [ ] Run restore script with test backup → database restored

**Things Cursor Must NOT Modify:**
- Individual cron files
- Backup service

---

---

# PHASE 10: BACKDATE MANAGEMENT

---

## TASK 10.1 — Backdate Revenue Entry API

**Goal:**
Build the backdate management APIs for submitting backdated revenue entries (single day and bulk period) with Super Admin approval workflow.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 14 for complete backdate rules
- Any admin can submit backdate request
- Super Admin must approve before execution
- Uses same random distribution algorithm as live revenue

**Files to Create:**
- `backend/src/controllers/backdate.controller.js`
- `backend/src/routes/backdate.routes.js`

**Files to Modify:**
- `backend/src/app.js` — register backdate routes

**Acceptance Criteria:**
- [ ] POST `/api/v1/admin/backdate/revenue/single` → single day revenue entry
  - Fields: investor_id, date, amount (optional), roi_percentage (optional), remark, send_email
  - If no amount/roi → uses default ROI for that date
- [ ] POST `/api/v1/admin/backdate/revenue/bulk` → bulk period entry
  - Fields: investor_id, start_date, end_date, roi_percentage (optional), remark, send_email
  - System distributes using same 90-110% random algorithm
  - Calculates expected total for period
- [ ] Both create backdate_request record with status: pending
- [ ] Super Admin notification created for approval
- [ ] GET `/api/v1/admin/backdate/requests` → all pending backdate requests (admin view)
- [ ] GET `/api/v1/admin/backdate/requests` (Super Admin) → can see all, others see own

**Testing Checklist:**
- [ ] Single day entry created → pending status
- [ ] Bulk period entry → preview shows distribution
- [ ] Super Admin notification created
- [ ] Non-admin cannot access backdate API → 403

**Things Cursor Must NOT Modify:**
- Live revenue cron
- ROI service

---

## TASK 10.2 — Backdate Approval & Execution API

**Goal:**
Build Super Admin APIs to approve/reject backdate requests and execute the actual backdated entries.

**Context:**
- Super Admin approves → system executes immediately
- Execution uses same ROI calculation engine
- All backdated entries get proper Transaction IDs
- Revenue tracking updated for backdated periods

**Files to Modify:**
- `backend/src/controllers/backdate.controller.js` — add approval functions
- `backend/src/routes/backdate.routes.js` — add approval routes

**Acceptance Criteria:**
- [ ] PATCH `/api/v1/admin/backdate/requests/:id/approve` (Super Admin only) → approve and execute
- [ ] PATCH `/api/v1/admin/backdate/requests/:id/reject` (Super Admin only) → reject with reason
- [ ] On approval → execute immediately:
  - For single: insert one revenue_credit record with backdated date
  - For bulk: insert records for each day in range using ROI distribution
  - All records get TKT-REV-CR IDs with actual backdated dates
  - Update monthly_revenue_tracking for affected months
- [ ] If send_email=true → email sent to investor for each credit
- [ ] Execution result stored in backdate_request.execution_log
- [ ] Submitting admin notified of approval/rejection

**Testing Checklist:**
- [ ] Approve single → one revenue record created with backdated date
- [ ] Approve bulk (30 days) → 30 revenue records created
- [ ] Monthly tracking updated for backdated months
- [ ] Email toggle respected (send vs no-send)
- [ ] Rejected request → no entries created

**Things Cursor Must NOT Modify:**
- Backdate submission API
- Live revenue cron

---

## TASK 10.3 — Backdate Capital Entry API

**Goal:**
Build APIs for backdated capital entries with automatic revenue recalculation from the backdate point.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 14.3 for backdate capital rules
- After capital added → system recalculates revenue from that date to present
- This can create many revenue records at once

**Files to Modify:**
- `backend/src/controllers/backdate.controller.js` — add capital backdate
- `backend/src/routes/backdate.routes.js` — add capital backdate routes

**Acceptance Criteria:**
- [ ] POST `/api/v1/admin/backdate/capital` → backdated capital entry
  - Fields: investor_id, amount, date, utr_number, remark, send_email, auto_calculate_revenue (boolean)
- [ ] Creates backdate_request with type: capital
- [ ] On Super Admin approval:
  - Capital transaction created with backdated date
  - If auto_calculate_revenue=true → recalculates revenue from capital date to today
  - Revenue records created for each day (using ROI service)
  - All records get proper Transaction IDs
- [ ] Preview endpoint: POST `/api/v1/admin/backdate/capital/preview` → shows estimated revenue that would be generated

**Testing Checklist:**
- [ ] Backdate capital Jan 1 with auto_calculate=true → revenue from Jan 1 to today generated
- [ ] Preview shows correct estimated amounts
- [ ] Monthly tracking updated for all affected months

**Things Cursor Must NOT Modify:**
- Revenue backdate APIs
- Live revenue cron

---

## TASK 10.4 — Backdate New Investor API

**Goal:**
Build the API for adding a new investor with a backdated joining date, with automatic revenue generation from joining date.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 14.4
- Admin creates investor with past joining date
- System auto-generates revenue from joining date to present
- Investor's "Account Created" shows backdated joining date

**Files to Modify:**
- `backend/src/controllers/backdate.controller.js` — add new investor backdate
- `backend/src/routes/backdate.routes.js` — add route

**Acceptance Criteria:**
- [ ] POST `/api/v1/admin/backdate/new-investor` → create investor with backdated joining date
  - Fields: all investor fields + joining_date (past date) + initial_capital + roi_percentage + send_email
- [ ] Creates backdate_request with type: new_investor
- [ ] On Super Admin approval:
  - Investor account created with joining_date as specified
  - Capital entry created with backdated date
  - Revenue generated from joining_date to today
  - Welcome email optionally sent (controlled by send_email)
- [ ] Preview: shows estimated total revenue to be generated

**Testing Checklist:**
- [ ] Backdate investor joining Jan 1 → joining_date shows Jan 1
- [ ] Revenue from Jan 1 to today auto-generated
- [ ] Investor can login after approval (status: active)
- [ ] send_email=false → no welcome email sent

**Things Cursor Must NOT Modify:**
- Other backdate APIs
- Regular investor registration

---

## TASK 10.5 — Backdate History & Audit API

**Goal:**
Build APIs for viewing backdate request history, execution logs, and filtering backdated transactions.

**Files to Modify:**
- `backend/src/controllers/backdate.controller.js` — add history functions
- `backend/src/routes/backdate.routes.js` — add history routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/backdate/history` → all completed/rejected backdate requests
- [ ] Filter: by investor, by type, by date range, by status
- [ ] GET `/api/v1/admin/backdate/requests/:id/log` → execution log for specific request
- [ ] Revenue transactions have is_backdated=true flag (visible in admin view)
- [ ] Admin can filter revenue transactions: `/api/v1/admin/revenue/investor/:id/transactions?backdated=true`

**Testing Checklist:**
- [ ] History shows completed requests with execution details
- [ ] Backdated revenue entries clearly marked in transaction list
- [ ] Filter by investor shows only their backdate requests

**Things Cursor Must NOT Modify:**
- Backdate CRUD APIs
- Live revenue APIs

---

---

# PHASE 11: ADMIN PANEL — USER MANAGEMENT

---

## TASK 11.1 — Investor Management API (Admin)

**Goal:**
Build all admin APIs for investor management: list, search, filter, view details, create, modify, pause, delete, and unlock investors.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 21.2 for user management
- Admin creates investor directly (not same as self-registration)
- Concurrent editing detection enabled
- All actions logged in audit log

**Files to Create:**
- `backend/src/controllers/userManagement.controller.js`
- `backend/src/routes/userManagement.routes.js`

**Files to Modify:**
- `backend/src/app.js` — register user management routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/investors` → investor list with search + filters
  - Search: by name, email, mobile
  - Filter: by status, kyc_status, joining_date range, capital_amount range
  - Sort: by name, joining_date, capital_amount, status
  - Paginated (20 per page)
- [ ] GET `/api/v1/admin/investors/:id` → full investor profile + capital summary + ROI info
- [ ] POST `/api/v1/admin/investors` → admin creates investor directly (full details, sets status to active)
- [ ] PATCH `/api/v1/admin/investors/:id` → update investor details
- [ ] PATCH `/api/v1/admin/investors/:id/approve` → approve pending registration
- [ ] PATCH `/api/v1/admin/investors/:id/reject` → reject registration with reason
- [ ] PATCH `/api/v1/admin/investors/:id/pause` → pause investor (revenue stopped)
- [ ] PATCH `/api/v1/admin/investors/:id/resume` → resume investor
- [ ] PATCH `/api/v1/admin/investors/:id/unlock` → unlock locked investor
- [ ] DELETE `/api/v1/admin/investors/:id` → soft delete (data retained, email blocked)
- [ ] PATCH `/api/v1/admin/investors/:id/joining-date` → modify joining date
- [ ] Concurrent edit: GET returns list of other admins currently viewing same investor
- [ ] All actions → audit log entry

**Testing Checklist:**
- [ ] Search by name → correct results
- [ ] Filter by status → only that status returned
- [ ] Approve investor → status changes to active, email sent
- [ ] Pause investor → revenue cron skips this investor
- [ ] Delete investor → soft deleted, email blocked for future registration
- [ ] Concurrent edit → other admin's name shown

**Things Cursor Must NOT Modify:**
- Auth APIs
- Capital and revenue APIs

---

## TASK 11.2 — Profile Update Approvals API (Admin)

**Goal:**
Build admin APIs for reviewing and approving/rejecting investor profile update requests field by field.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 5.5 for profile update workflow
- Field-by-field approval (not all-or-nothing)
- KYC fields locked after verification
- Each field has separate approval status

**Files to Modify:**
- `backend/src/controllers/userManagement.controller.js` — add profile approval functions
- `backend/src/routes/userManagement.routes.js` — add profile approval routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/profile-requests` → all pending profile update requests
  - Grouped by investor
  - Notification badge count for admin
- [ ] GET `/api/v1/admin/profile-requests/investor/:id` → all pending requests for specific investor
- [ ] PATCH `/api/v1/admin/profile-requests/:id/approve` → approve specific field update, field updated in DB
- [ ] PATCH `/api/v1/admin/profile-requests/:id/reject` → reject with reason, investor notified
- [ ] KYC field approvals update kyc_field_approvals table
- [ ] PAN/Aadhar approval → locks those fields (investor cannot change without admin)
- [ ] Bank detail approval → old details moved to bank_details_history
- [ ] Investor email sent on each field approval/rejection

**Testing Checklist:**
- [ ] Approve name change → investor's name updated in DB
- [ ] Reject address → investor gets email with rejection reason
- [ ] Approve PAN → PAN field locked, kyc_field_approvals updated
- [ ] Try to update locked PAN as investor → blocked
- [ ] Bank detail approval → old details in history table

**Things Cursor Must NOT Modify:**
- Investor management CRUD
- Capital/revenue APIs

---

## TASK 11.3 — KYC Management API (Admin)

**Goal:**
Build admin APIs for KYC document management including viewing uploaded documents, updating KYC status, and managing KYC-locked fields.

**Files to Modify:**
- `backend/src/controllers/userManagement.controller.js` — add KYC functions
- `backend/src/routes/userManagement.routes.js` — add KYC routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/investors/:id/kyc` → full KYC details with document URLs
- [ ] GET `/api/v1/admin/files/:fileId/download` → download KYC document (authenticated, admin only)
- [ ] PATCH `/api/v1/admin/investors/:id/kyc/status` → update overall KYC status (pending/verified/rejected)
- [ ] POST `/api/v1/admin/investors/:id/kyc/override` → admin overrides locked PAN/Aadhar value
- [ ] Override creates audit log with: old value, new value, admin who changed, reason

**Testing Checklist:**
- [ ] Admin downloads PAN front image → file served correctly
- [ ] Update KYC status → investor's kyc_status updated
- [ ] Override locked PAN → old + new value in audit log

**Things Cursor Must NOT Modify:**
- Profile approval APIs
- Other user management functions

---

---

# PHASE 12: ADMIN PANEL — FINANCE MANAGEMENT

---

## TASK 12.1 — Capital Management Dashboard API

**Goal:**
Build the admin capital management overview showing all investors' capital status, pending requests, and quick actions.

**Files to Modify:**
- `backend/src/controllers/adminCapital.controller.js` — add dashboard functions
- `backend/src/routes/adminCapital.routes.js` — add dashboard routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/capital/dashboard` → capital management overview
  - Total capital under management
  - Total pending deposit requests (count + amount)
  - Total pending withdrawal requests (count + amount)
  - Recent capital activity (last 10)
- [ ] GET `/api/v1/admin/capital/requests?status=submitted` → filtered requests
- [ ] GET `/api/v1/admin/capital/investors?sort=capital_desc` → investors sorted by capital
- [ ] GET `/api/v1/admin/capital/investor/:id/full` → complete capital history with all transactions

**Testing Checklist:**
- [ ] Dashboard totals are accurate
- [ ] Filter by pending → only pending requests
- [ ] Sort by capital → descending order

**Things Cursor Must NOT Modify:**
- Capital approval APIs
- Revenue management APIs

---

## TASK 12.2 — Revenue Management Dashboard API

**Goal:**
Build the admin revenue management overview showing ROI settings, revenue statistics, and investor revenue summaries.

**Files to Modify:**
- `backend/src/controllers/revenue.controller.js` — add dashboard functions
- `backend/src/routes/revenue.routes.js` — add dashboard routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/revenue/dashboard` → revenue overview
  - Total revenue credited today
  - Total revenue credited this month
  - Count of paused investors
  - Next scheduled credit time and count
- [ ] GET `/api/v1/admin/revenue/investors` → all investors with ROI% and revenue summary
- [ ] GET `/api/v1/admin/revenue/schedule/today` → today's credit schedule details
- [ ] GET `/api/v1/admin/cron-logs` → cron job execution history (paginated, filterable by job name)

**Testing Checklist:**
- [ ] Dashboard shows correct today's revenue
- [ ] Paused investor count accurate
- [ ] Cron logs show execution history

**Things Cursor Must NOT Modify:**
- ROI settings APIs
- Revenue credit cron

---

## TASK 12.3 — Reports Generation API

**Goal:**
Build admin report generation APIs for PDF and Excel exports of capital reports, revenue reports, and investor statements.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 19 for report rules
- PDF letterhead: Tikhat Partner logo, company name, domain
- Indian Financial Year: April - March
- Date range filters on all reports

**Files to Create:**
- `backend/src/services/report.service.js`
- `backend/src/controllers/report.controller.js`
- `backend/src/routes/report.routes.js`

**Files to Modify:**
- `backend/src/app.js` — register report routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/reports/investor/:id/statement?from=&to=` → investor transaction statement PDF
  - Letterhead: Tikhat Partner logo, company name, tikhatpartner.online
  - Table: date, description, credit, debit, balance
  - Footer: date generated, admin name
- [ ] GET `/api/v1/admin/reports/capital?from=&to=` → capital report PDF/Excel
- [ ] GET `/api/v1/admin/reports/revenue?from=&to=` → revenue report PDF/Excel
- [ ] GET `/api/v1/admin/reports/financial-year?year=2024` → FY April-March report
- [ ] All reports support: format=pdf or format=excel query param
- [ ] GET `/api/v1/investor/reports/statement?from=&to=` → investor downloads own statement

**Testing Checklist:**
- [ ] Generate investor statement PDF → opens correctly, letterhead visible
- [ ] Capital report Excel → correct columns and data
- [ ] FY 2024 report → April 2024 to March 2025
- [ ] Investor can download own statement
- [ ] Admin cannot access other investor's self-download endpoint

**Things Cursor Must NOT Modify:**
- Revenue cron
- Capital APIs

---

## TASK 12.4 — System Settings Management API

**Goal:**
Build complete system settings management including all global settings, maintenance mode, and Terms/Privacy management.

**Files to Modify:**
- `backend/src/controllers/settings.controller.js` — complete all settings functions
- `backend/src/routes/settings.routes.js` — add remaining routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/settings` → all settings (admin+)
- [ ] PATCH `/api/v1/admin/settings/global` (Super Admin only) → update any global setting
- [ ] PATCH `/api/v1/admin/settings/maintenance` (Super Admin only) → toggle maintenance
- [ ] GET `/api/v1/admin/settings/terms` → current T&C with version history
- [ ] PATCH `/api/v1/admin/settings/terms` (Super Admin only) → update T&C
- [ ] GET `/api/v1/admin/settings/privacy` → current privacy policy
- [ ] PATCH `/api/v1/admin/settings/privacy` (Super Admin only) → update privacy policy
- [ ] POST `/api/v1/admin/settings/backup` (Super Admin only) → manual backup trigger
- [ ] GET `/api/v1/admin/settings/backup/history` → list of backup files with dates

**Testing Checklist:**
- [ ] Non-Super-Admin cannot change global settings → 403
- [ ] Maintenance mode on → investor API returns 503
- [ ] T&C update → version history saves old version
- [ ] Manual backup → backup file created

**Things Cursor Must NOT Modify:**
- Email service
- Backup service

---

## TASK 12.5 — Admin Activity Log & Cron Log APIs

**Goal:**
Build admin APIs to view activity logs and cron job execution logs with comprehensive filtering.

**Files to Modify:**
- `backend/src/controllers/audit.controller.js` — add filtering functions
- `backend/src/routes/audit.routes.js` — add filter routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/admin/audit-logs` → all activity logs
  - Filter: by admin_id, by entity_type, by action, by date range
  - Sort: by date (newest first)
  - Paginated (50 per page)
- [ ] GET `/api/v1/admin/audit-logs/investor/:id` → all actions on specific investor
- [ ] GET `/api/v1/admin/cron-logs` → cron execution history
  - Filter: by job_name, by status, by date
- [ ] GET `/api/v1/admin/cron-logs/latest` → latest execution of each cron job

**Testing Checklist:**
- [ ] Filter audit logs by admin → only that admin's actions
- [ ] Filter cron logs by job name → only that job's logs
- [ ] Latest cron logs → one per job type (most recent)

**Things Cursor Must NOT Modify:**
- Audit service
- Cron files

---

## TASK 12.6 — Investor Profile API (Self)

**Goal:**
Build investor-facing profile management APIs for viewing profile, submitting update requests, and managing self-deactivation.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 5 for profile rules
- All changes require admin approval
- Email/mobile change separate form
- Self-deactivation: data retained, marked in admin

**Files to Create:**
- `backend/src/controllers/investorProfile.controller.js`
- `backend/src/routes/investorProfile.routes.js`

**Files to Modify:**
- `backend/src/app.js` — register investor profile routes

**Acceptance Criteria:**
- [ ] GET `/api/v1/investor/profile` → complete investor profile
- [ ] PATCH `/api/v1/investor/profile` → submit update request for any field(s)
  - Creates profile_update_request per changed field
  - Returns success message: "Your details will be updated within 24-48 hours after admin approval. Thank you for your request."
- [ ] POST `/api/v1/investor/profile/photo` → upload/update profile photo
- [ ] POST `/api/v1/investor/profile/documents` → upload KYC documents (PAN/Aadhar front/back)
- [ ] POST `/api/v1/investor/profile/request-email-change` → email change request form
- [ ] POST `/api/v1/investor/profile/request-mobile-change` → mobile change request form
- [ ] PATCH `/api/v1/investor/profile/dismiss-banner` → permanently dismiss profile completion banner
- [ ] POST `/api/v1/investor/profile/deactivate` → self-deactivation (with confirmation)
- [ ] GET `/api/v1/investor/profile/update-requests` → investor's pending update requests

**Testing Checklist:**
- [ ] Submit profile update → profile_update_request created
- [ ] Upload PAN front → file saved, URL stored
- [ ] Dismiss banner → banner_dismissed=true, not shown again
- [ ] Self-deactivate → status=self_deactivated, cannot login
- [ ] View update requests → pending requests listed

**Things Cursor Must NOT Modify:**
- Admin profile APIs
- Auth APIs

---

---

# PHASE 13: REPORTS & EXPORT (FRONTEND SKIPPED — BACKEND COMPLETE)

*(All report backend APIs completed in Phase 12. Frontend report screens covered in Phase 22.)*

---

# PHASE 14: BACKUP SYSTEM

*(Covered fully in Task 9.5 and 9.6)*

---

---

# PHASE 15: FRONTEND — FOUNDATION

---

## TASK 15.1 — API Service Layer

**Goal:**
Build the complete frontend API service layer that connects to the backend with Axios, handles auth tokens, request interceptors, and error handling.

**Context:**
- Base URL from environment variable
- Auth token automatically attached to all requests
- 401 → auto logout and redirect to login
- All API calls typed with TypeScript

**Files to Create:**
- `frontend/services/api.ts` — Axios instance with interceptors
- `frontend/services/auth.service.ts`
- `frontend/services/capital.service.ts`
- `frontend/services/revenue.service.ts`
- `frontend/services/support.service.ts`
- `frontend/services/profile.service.ts`
- `frontend/services/notification.service.ts`
- `frontend/services/admin.service.ts`
- `frontend/services/report.service.ts`
- `frontend/types/api.types.ts` — All API response types
- `frontend/types/models.types.ts` — All model types

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Axios instance with base URL from env
- [ ] Request interceptor: attach Bearer token from SecureStore/cookie
- [ ] Response interceptor: 401 → clear token, redirect to login
- [ ] Response interceptor: 503 maintenance → show maintenance screen
- [ ] All service functions typed with TypeScript
- [ ] Services use async/await, throw typed errors
- [ ] Types cover all API response shapes from backend

**Testing Checklist:**
- [ ] API call with valid token → request succeeds
- [ ] API call with expired token → logout triggered
- [ ] 503 response → maintenance screen shown
- [ ] TypeScript compilation → no type errors

**Things Cursor Must NOT Modify:**
- Theme files
- Navigation structure

---

## TASK 15.2 — Reusable UI Components Library

**Goal:**
Build the core reusable UI component library: Button, Card, Input, Badge, StatusChip, Modal, BottomSheet, Skeleton, Empty State, Toast.

**Context:**
- Read PROJECT_INSTRUCTIONS.md Section 12 for exact design specs
- All components use theme colors (no hardcoded colors)
- Animations using React Native Reanimated v3
- All components typed with TypeScript props

**Files to Create:**
- `frontend/components/ui/Button.tsx`
- `frontend/components/ui/Card.tsx`
- `frontend/components/ui/Input.tsx`
- `frontend/components/ui/Badge.tsx`
- `frontend/components/ui/StatusChip.tsx`
- `frontend/components/ui/Modal.tsx`
- `frontend/components/ui/BottomSheet.tsx`
- `frontend/components/ui/Skeleton.tsx`
- `frontend/components/ui/EmptyState.tsx`
- `frontend/components/ui/Toast.tsx`
- `frontend/components/ui/Avatar.tsx`
- `frontend/components/ui/Divider.tsx`
- `frontend/components/ui/LoadingOverlay.tsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Button: Primary, Secondary, Golden variants with loading state and press animation (scale 0.97)
- [ ] Card: White bg, 16px border radius, 8px shadow, 16px padding, optional golden accent line
- [ ] Input: Label above, focus ring (dark blue), error state (red border + error text below)
- [ ] StatusChip: Color-coded per status (submitted=amber, approved=green, rejected=red, completed=blue, cancelled=grey)
- [ ] Modal: Centered on web, bottom sheet on mobile
- [ ] BottomSheet: Slides up from bottom with handle, backdrop blur
- [ ] Skeleton: Shimmer animation (1.2s loop) matching content shape
- [ ] EmptyState: Icon + title + subtitle + optional CTA button
- [ ] Toast: 4 variants (success/error/warning/info), 3s auto-dismiss, top position
- [ ] All components support dark mode via useTheme()

**Testing Checklist:**
- [ ] Each component renders without errors
- [ ] Button loading state shows spinner, disables press
- [ ] StatusChip shows correct color for each status
- [ ] Skeleton shimmer animation plays correctly
- [ ] Toast auto-dismisses after 3 seconds
- [ ] Dark mode → all components use dark theme colors

**Things Cursor Must NOT Modify:**
- API service layer
- Navigation structure

---

## TASK 15.3 — Form Components & Validation

**Goal:**
Build reusable form components integrated with React Hook Form and Zod validation for all app forms.

**Context:**
- React Hook Form + Zod for all forms
- Validation rules from PROJECT_KNOWLEDGE.md Section 25
- Inline error display below each field
- File upload component for documents

**Files to Create:**
- `frontend/components/forms/FormInput.tsx`
- `frontend/components/forms/FormSelect.tsx`
- `frontend/components/forms/FormDatePicker.tsx`
- `frontend/components/forms/FormFilePicker.tsx`
- `frontend/components/forms/FormAmountInput.tsx`
- `frontend/components/forms/FormTextArea.tsx`
- `frontend/components/forms/FormCheckbox.tsx`
- `frontend/utils/validationSchemas.ts` — All Zod schemas

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] FormInput: controlled input with label, error display, theme styling
- [ ] FormAmountInput: shows ₹ prefix, Indian number formatting as user types
- [ ] FormFilePicker: opens document/image picker, shows selected file name, supports multiple files
- [ ] FormDatePicker: date picker with DD MMM YYYY display format
- [ ] FormSelect: dropdown/picker for options
- [ ] All forms: disable submit while submitting, show loading on submit button
- [ ] Zod schemas for: registration, login, OTP, capital add, capital withdraw, profile update, support ticket
- [ ] Validation errors: shown inline below field in red

**Testing Checklist:**
- [ ] FormAmountInput: type 100000 → displays ₹1,00,000
- [ ] Required field empty → red error shown
- [ ] Invalid email → inline error
- [ ] FormFilePicker → opens picker, shows selected file
- [ ] Submit while loading → button disabled

**Things Cursor Must NOT Modify:**
- UI components library
- API service layer

---

## TASK 15.4 — Transaction & Amount Display Components

**Goal:**
Build reusable transaction list items, balance cards, and amount display components used across the app.

**Files to Create:**
- `frontend/components/cards/BalanceCard.tsx`
- `frontend/components/cards/TransactionItem.tsx`
- `frontend/components/cards/SummaryCard.tsx`
- `frontend/components/cards/PortfolioCard.tsx`
- `frontend/components/common/AmountDisplay.tsx`
- `frontend/components/common/TransactionList.tsx`
- `frontend/components/common/ProfileBanner.tsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] BalanceCard: amount in bold large font (₹ Indian format), label, "View Transactions" link, pending withdrawal note (small font below)
- [ ] TransactionItem: date, description, credit (green) or debit (red), transaction ID (small, copyable)
- [ ] SummaryCard: label + value pairs, golden accent
- [ ] PortfolioCard: total invested, total earned, effective ROI%
- [ ] AmountDisplay: always ₹ Indian format, whole numbers only
- [ ] TransactionList: handles empty state, loading skeleton, infinite scroll (mobile) and pagination (web)
- [ ] ProfileBanner: red banner with "Complete your profile" message and arrow link, dismissible

**Testing Checklist:**
- [ ] BalanceCard shows ₹1,00,000 not ₹100,000
- [ ] TransactionItem credit → green amount, debit → red amount
- [ ] TransactionList empty → empty state shown
- [ ] TransactionList loading → skeleton shown
- [ ] ProfileBanner dismiss → banner hidden

**Things Cursor Must NOT Modify:**
- Form components
- UI component library

---

## TASK 15.5 — Chart Components

**Goal:**
Build reusable chart components for monthly revenue trend and capital growth visualization.

**Context:**
- Use Victory Native for charts
- Charts styled with theme colors (Dark Blue, Golden)
- Mobile-first: charts must render well on 375px width
- Two chart types: bar chart (monthly revenue) and line chart (capital growth)

**Files to Create:**
- `frontend/components/charts/MonthlyRevenueChart.tsx`
- `frontend/components/charts/CapitalGrowthChart.tsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] MonthlyRevenueChart: bar chart, last 6 months, amounts in ₹ Indian format on Y-axis, month labels on X-axis, Dark Blue bars with Golden highlight on current month
- [ ] CapitalGrowthChart: line chart, capital balance over time, Dark Blue line, golden data points
- [ ] Both charts: loading skeleton while data loads
- [ ] Both charts: empty state if no data
- [ ] Both charts: tap on bar/point shows tooltip with exact value
- [ ] Charts responsive to container width

**Testing Checklist:**
- [ ] Chart renders with 6 months data
- [ ] Empty data → empty state shown (not broken chart)
- [ ] Tap bar → tooltip shows correct value in ₹ format
- [ ] Chart fits within mobile screen width without overflow

**Things Cursor Must NOT Modify:**
- Balance card and transaction components
- Form components

---

## TASK 15.6 — Splash Screen & App Loading

**Goal:**
Build the branded splash screen and app loading state that appears while the app checks authentication status.

**Files to Create:**
- `frontend/app/splash.tsx` — or configure in app.json
- `frontend/components/common/AppLoader.tsx`

**Files to Modify:**
- `frontend/app/_layout.tsx` — integrate splash and auth check
- `frontend/app.json` — splash screen config

**Acceptance Criteria:**
- [ ] Splash screen: Tikhat Partner logo (placeholder) on dark blue background with golden accent
- [ ] Splash shown for minimum 2 seconds on app launch
- [ ] After splash: check auth token validity
- [ ] If valid token → navigate to appropriate panel (investor/admin)
- [ ] If no token → navigate to homepage
- [ ] Smooth fade transition from splash to first screen
- [ ] AppLoader: full-screen dark blue background with golden spinning indicator

**Testing Checklist:**
- [ ] App launch → splash screen shown
- [ ] After 2 seconds → transitions to correct screen
- [ ] Valid token stored → goes directly to dashboard
- [ ] No token → goes to homepage

**Things Cursor Must NOT Modify:**
- Theme files
- Navigation structure

---

---

# PHASE 16: FRONTEND — AUTH SCREENS

---

## TASK 16.1 — Homepage / Landing Screen

**Goal:**
Build the public homepage with business sections, login and register CTAs. Content sections are placeholder — actual content provided by client at deployment.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 20.1 for homepage structure
- Sections: business info, features, partner enrollment info, contact, about us
- Professional design like a financial company's partner page

**Files to Modify:**
- `frontend/app/(auth)/index.tsx` — complete homepage

**Acceptance Criteria:**
- [ ] Hero section: app name, tagline, Login + Register CTA buttons
- [ ] Features section: 3-4 feature cards with icons (placeholder content)
- [ ] How it works section: 3 steps (placeholder)
- [ ] Contact section: email, phone placeholders
- [ ] About section: placeholder text
- [ ] Footer: company name, domain, copyright
- [ ] Smooth scroll between sections
- [ ] Login button → /login
- [ ] Register button → /register
- [ ] All placeholder text clearly marked as [REPLACE WITH ACTUAL CONTENT]

**Testing Checklist:**
- [ ] Homepage renders on mobile (375px) without horizontal scroll
- [ ] All sections visible on scroll
- [ ] Login and Register buttons navigate correctly

**Things Cursor Must NOT Modify:**
- Theme files
- Navigation structure

---

## TASK 16.2 — Registration Screen

**Goal:**
Build the investor registration screen with form validation, T&C acceptance, and OTP verification flow.

**Context:**
- Fields: Full Name, Email, Password, Mobile Number
- Mandatory T&C + Privacy Policy checkbox
- After submit: success message (no OTP at registration — admin approves)
- Read PROJECT_KNOWLEDGE.md Section 4.2

**Files to Modify:**
- `frontend/app/(auth)/register.tsx` — complete registration screen

**Acceptance Criteria:**
- [ ] Form: Full Name, Email, Password (with show/hide toggle), Mobile Number
- [ ] T&C checkbox with links to T&C and Privacy Policy pages
- [ ] Real-time validation as user types
- [ ] Submit → loading state → success message: "Registration successful! Your account is under review. You'll receive an email once approved."
- [ ] Password strength indicator (weak/medium/strong)
- [ ] Already have account? Login link
- [ ] Keyboard-aware scrolling (form not hidden by keyboard)
- [ ] Error states: inline field errors from API

**Testing Checklist:**
- [ ] Empty form submit → all field errors shown
- [ ] Invalid email → error shown
- [ ] Weak password → strength indicator shows weak
- [ ] T&C unchecked → cannot submit
- [ ] Valid form → loading → success message
- [ ] Duplicate email → API error shown inline

**Things Cursor Must NOT Modify:**
- Homepage screen
- Theme files

---

## TASK 16.3 — Login Screen & OTP Verification

**Goal:**
Build the login screen with email + password, OTP verification step, and forgot password flow.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 3.1 for login flow
- Two-step: credentials → OTP → dashboard
- Account locked handling
- Maintenance mode handling

**Files to Modify:**
- `frontend/app/(auth)/login.tsx` — complete login screen
- `frontend/app/(auth)/forgot-password.tsx` — forgot password screen

**Acceptance Criteria:**
- [ ] Step 1: Email + Password form with show/hide password toggle
- [ ] Submit credentials → if valid → OTP sent → navigate to OTP step
- [ ] Step 2: OTP input (6 digits, auto-focus, auto-advance between digits)
- [ ] OTP: 10-minute timer shown, "Resend OTP" button (active after 60 seconds)
- [ ] Locked account → show specific message with "Reset Password" option
- [ ] Pending account → "Your account is pending approval"
- [ ] Maintenance mode → full-screen maintenance message
- [ ] Forgot Password: email input → OTP → new password + confirm
- [ ] Remember to handle: 5 failed attempts warning (show remaining attempts)
- [ ] Back button on OTP step → back to credentials

**Testing Checklist:**
- [ ] Valid credentials → OTP screen shown
- [ ] Valid OTP → navigate to correct dashboard (investor/admin)
- [ ] Wrong OTP → error shown, attempt count decremented
- [ ] OTP timer → countdown visible
- [ ] Resend OTP → available after 60 seconds
- [ ] Locked account → lockout message + reset option
- [ ] Forgot password flow → complete end to end

**Things Cursor Must NOT Modify:**
- Registration screen
- Navigation structure

---

## TASK 16.4 — Auth Store & Token Management

**Goal:**
Build the complete Zustand auth store with token persistence, user data management, and automatic token refresh.

**Files to Modify:**
- `frontend/store/authStore.ts` — complete auth store implementation
- `frontend/hooks/useAuth.ts` — complete auth hook

**Acceptance Criteria:**
- [ ] Store state: user (with role), accessToken, refreshToken, isAuthenticated, isLoading
- [ ] `login(tokens, user)` → saves tokens to SecureStore (mobile) / httpOnly flow (web), updates state
- [ ] `logout()` → clears tokens from SecureStore, clears state, navigates to login
- [ ] `refreshTokens()` → calls refresh API, updates access token
- [ ] Auto-refresh: when access token expires → automatically refresh using refresh token
- [ ] If refresh token also expired → force logout
- [ ] `useAuth()` hook exposes: user, isAuthenticated, isAdmin, isSuperAdmin, login, logout
- [ ] Persist auth state across app restarts (check SecureStore on app launch)

**Testing Checklist:**
- [ ] Login → tokens saved, user state set
- [ ] Close and reopen app → still logged in (token persisted)
- [ ] Expired access token → auto-refreshed silently
- [ ] Expired refresh token → logout triggered
- [ ] Logout → tokens cleared, redirected to login

**Things Cursor Must NOT Modify:**
- Login and registration screens
- API service layer

---

## TASK 16.5 — Terms & Privacy Policy Screens

**Goal:**
Build the Terms & Conditions and Privacy Policy screens that are accessible from registration and profile.

**Files to Create:**
- `frontend/app/(auth)/terms.tsx`
- `frontend/app/(auth)/privacy.tsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Terms screen: fetches content from `/api/v1/public/terms`, renders as scrollable text
- [ ] Privacy screen: fetches content from `/api/v1/public/privacy`
- [ ] Both screens: loading skeleton while fetching
- [ ] Both screens: error state with retry
- [ ] Back button to return to registration
- [ ] Content rendered with proper typography (headings, paragraphs)
- [ ] Last updated date shown

**Testing Checklist:**
- [ ] Terms content loads from API
- [ ] Back from terms → registration screen with checkbox remembered
- [ ] Network error → retry button shown

**Things Cursor Must NOT Modify:**
- Login and registration screens
- Auth store

---

---

# PHASE 17: FRONTEND — PARTNER DASHBOARD

---

## TASK 17.1 — Dashboard Screen

**Goal:**
Build the complete investor dashboard screen with balance cards, portfolio summary, charts, and recent transactions.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 20.2 for dashboard structure
- Single API call: GET /investor/dashboard
- Skeleton loader while loading
- Pull to refresh

**Files to Modify:**
- `frontend/app/(partner)/dashboard.tsx` — complete dashboard

**Acceptance Criteria:**
- [ ] Profile completion red banner (if banner_dismissed=false AND profile incomplete)
- [ ] Card 1: Capital Invested (with "View Transactions" link, pending withdrawal note)
- [ ] Card 2: Revenue Account Total (with "View Transactions" link, pending note)
- [ ] Card 3: Total Balance (Capital + Revenue)
- [ ] Portfolio Summary card: Total Invested, Total Earned, Effective ROI%
- [ ] Joining date: "Partner Since: 15 Jul 2024"
- [ ] Monthly Revenue Trend chart (last 6 months)
- [ ] Capital Growth chart
- [ ] Pull to refresh: reloads all dashboard data
- [ ] Skeleton loader: all cards shown as skeletons while loading
- [ ] "View Transactions" links navigate to respective pages

**Testing Checklist:**
- [ ] Dashboard loads with correct balances
- [ ] Pull to refresh → data reloaded
- [ ] Skeleton shown while loading
- [ ] New investor (no data) → all zeros, no errors
- [ ] Charts render correctly
- [ ] Profile banner shows for incomplete profile
- [ ] Banner dismissed → not shown again

**Things Cursor Must NOT Modify:**
- Auth screens
- UI component library

---

## TASK 17.2 — Notification Bell & Notification List Screen

**Goal:**
Build the notification bell icon in the header with unread count badge and the notification list screen.

**Files to Create:**
- `frontend/components/common/NotificationBell.tsx`
- `frontend/app/(partner)/notifications.tsx`

**Files to Modify:**
- `frontend/app/(partner)/_layout.tsx` — add notification bell to header

**Acceptance Criteria:**
- [ ] Bell icon in top-right header of all partner screens
- [ ] Red badge with unread count (hidden if 0)
- [ ] Badge shows "99+" if count > 99
- [ ] Tap bell → navigate to notifications list
- [ ] Notifications list: title, body, time, unread indicator (blue dot)
- [ ] Tap notification → mark as read + navigate to relevant screen
- [ ] "Mark all as read" button
- [ ] Pull to refresh notifications list
- [ ] Empty state: "No notifications yet"

**Testing Checklist:**
- [ ] 5 unread notifications → badge shows "5"
- [ ] Tap notification → marked as read, badge decrements
- [ ] Mark all as read → badge disappears
- [ ] Empty notifications → empty state shown

**Things Cursor Must NOT Modify:**
- Dashboard screen
- Bottom navigation

---

## TASK 17.3 — Dark Mode Toggle

**Goal:**
Build the dark mode toggle accessible from the dashboard or profile header, persisting across sessions.

**Files to Create:**
- `frontend/components/common/ThemeToggle.tsx`

**Files to Modify:**
- `frontend/store/authStore.ts` — add theme preference
- `frontend/app/(partner)/_layout.tsx` — add theme toggle to header
- `frontend/theme/index.ts` — dynamic theme based on preference

**Acceptance Criteria:**
- [ ] Sun/Moon icon toggle in header
- [ ] Toggle switches between light and dark mode instantly
- [ ] Preference saved to AsyncStorage (persists across sessions)
- [ ] All screens update colors immediately on toggle
- [ ] Dark mode colors from PROJECT_INSTRUCTIONS.md Section 7.8 darkMode section
- [ ] Status bar style updates (light content on dark bg, dark content on light bg)

**Testing Checklist:**
- [ ] Toggle dark mode → all colors switch
- [ ] Close and reopen app → previous theme preference retained
- [ ] All components use theme colors (no hardcoded colors visible)

**Things Cursor Must NOT Modify:**
- Dashboard screen
- Auth screens

---

---

# PHASE 18: FRONTEND — REVENUE SCREEN

---

## TASK 18.1 — Revenue Screen

**Goal:**
Build the complete revenue page showing daily transaction history, monthly totals, overall totals, and filters.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 20.3 for revenue page structure
- Infinite scroll on mobile, pagination on web
- Filter by month/year

**Files to Modify:**
- `frontend/app/(partner)/revenue.tsx` — complete revenue screen

**Acceptance Criteria:**
- [ ] Summary section: Monthly Total, Overall Total, Total Withdrawn
- [ ] Month/Year filter picker
- [ ] Transaction list: date, description, credit (green) or debit (red), transaction ID
- [ ] Each transaction: tap → shows full details in bottom sheet
- [ ] Mobile: infinite scroll
- [ ] Web: pagination (20 per page, prev/next)
- [ ] Loading skeleton for list
- [ ] Empty state for no transactions
- [ ] Pull to refresh

**Testing Checklist:**
- [ ] Revenue transactions listed correctly
- [ ] Credits shown in green, debits in red
- [ ] Filter by month → only that month's transactions
- [ ] Tap transaction → bottom sheet with full details
- [ ] Infinite scroll loads more on scroll

**Things Cursor Must NOT Modify:**
- Dashboard screen
- Other partner screens

---

## TASK 18.2 — Revenue Transaction Detail

**Goal:**
Build the transaction detail bottom sheet showing complete transaction information.

**Files to Create:**
- `frontend/components/modals/TransactionDetailModal.tsx`

**Files to Modify:**
- `frontend/app/(partner)/revenue.tsx` — integrate detail modal

**Acceptance Criteria:**
- [ ] Bottom sheet slides up on transaction tap
- [ ] Shows: transaction ID (copyable), date, time, type, amount, description, status
- [ ] Copy transaction ID button
- [ ] Close button or swipe down to dismiss
- [ ] Professional card design

**Testing Checklist:**
- [ ] Tap transaction → bottom sheet slides up
- [ ] Transaction ID copy → copies to clipboard
- [ ] Swipe down → dismisses

**Things Cursor Must NOT Modify:**
- Revenue screen list
- Dashboard screen

---

---

# PHASE 19: FRONTEND — FUND SCREEN

---

## TASK 19.1 — Fund Screen Main

**Goal:**
Build the main Fund page showing capital balance, lock status, transaction history, and Add/Withdraw buttons.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 20.4 for Fund page structure

**Files to Modify:**
- `frontend/app/(partner)/fund.tsx` — complete fund screen

**Acceptance Criteria:**
- [ ] Capital balance card with pending withdrawal note
- [ ] Lock status line: "Available for Withdrawal" (green) OR "Locked for Withdrawal" (red warning)
- [ ] Add Capital button (golden) + Withdraw button (secondary)
- [ ] Capital transaction history (infinite scroll mobile, paginated web)
- [ ] Transaction list: date, type, amount, status chip, UTR (if available)
- [ ] Pull to refresh
- [ ] Loading skeleton

**Testing Checklist:**
- [ ] Capital balance shows correctly
- [ ] Locked status → red warning shown
- [ ] Available status → green indicator shown
- [ ] Transactions listed with correct status chips

**Things Cursor Must NOT Modify:**
- Revenue screen
- Dashboard screen

---

## TASK 19.2 — Add Capital Form

**Goal:**
Build the Add Capital bottom sheet form with all fields, file upload, and submission flow.

**Files to Create:**
- `frontend/components/modals/AddCapitalModal.tsx`

**Files to Modify:**
- `frontend/app/(partner)/fund.tsx` — integrate add capital modal

**Acceptance Criteria:**
- [ ] Bottom sheet form: Amount, Date of Transfer, UTR/Transaction No., Remark (optional), Payment Screenshot
- [ ] Amount: min ₹10,000, max ₹10,00,000 validation
- [ ] File picker for payment screenshot (JPG/PNG/PDF, max 5MB)
- [ ] Submit → loading → success message: "Your request has been received. Your account will be updated within 24-48 hours upon verification. Thank you for your request."
- [ ] After success: form closes, fund screen refreshes
- [ ] API errors shown inline

**Testing Checklist:**
- [ ] Amount below 10000 → validation error
- [ ] No screenshot attached → validation error
- [ ] Valid form → submit → success message shown
- [ ] Success → fund screen refreshes with new pending transaction

**Things Cursor Must NOT Modify:**
- Fund screen main
- Revenue screen

---

## TASK 19.3 — Withdraw Form

**Goal:**
Build the withdrawal request bottom sheet form with account type selection, transfer mode, and UPI limit enforcement.

**Files to Create:**
- `frontend/components/modals/WithdrawModal.tsx`

**Files to Modify:**
- `frontend/app/(partner)/fund.tsx` — integrate withdraw modal

**Acceptance Criteria:**
- [ ] Bottom sheet form: Amount, Account (Capital A/C / Revenue A/C), Transfer Mode (Bank / UPI)
- [ ] If Capital A/C selected AND capital locked → show warning: "Your capital withdrawal is currently locked. Please contact support." (allow selection but warn, then block on submit)
- [ ] If amount > ₹1,00,000 → UPI option greyed out with tooltip: "UPI transfers limited to ₹1,00,000"
- [ ] Amount min ₹1,000 validation
- [ ] Insufficient balance → error after submit
- [ ] Frequency exceeded → error after submit
- [ ] Submit → loading → success message: "Your withdrawal request has been submitted. Processing within 24-48 hours. Thank you for your request."
- [ ] Cancel button

**Testing Checklist:**
- [ ] Capital locked → warning shown
- [ ] Amount > 100000 → UPI greyed out
- [ ] Amount < 1000 → validation error
- [ ] Valid withdraw → success message
- [ ] Frequency exceeded → clear error message

**Things Cursor Must NOT Modify:**
- Add capital form
- Fund screen main

---

## TASK 19.4 — Capital Transaction Detail & History

**Goal:**
Build capital transaction detail view and the complete history with filtering options.

**Files to Create:**
- `frontend/components/modals/CapitalTransactionDetail.tsx`

**Files to Modify:**
- `frontend/app/(partner)/fund.tsx` — integrate detail view and filters

**Acceptance Criteria:**
- [ ] Filter bar: All / Deposits / Withdrawals / Pending
- [ ] Each transaction: amount, type, date, status chip, UTR (if completed)
- [ ] Tap transaction → detail bottom sheet: transaction ID, amount, type, status timeline, UTR, remark
- [ ] Status timeline shows progress: Submitted → Under Review → Approved → Processed → Completed
- [ ] Investor can cancel own pending requests (Cancel button in detail view for submitted/under_review)
- [ ] Cancel confirmation dialog before cancelling

**Testing Checklist:**
- [ ] Filter to deposits → only deposits shown
- [ ] Tap completed transaction → UTR visible in detail
- [ ] Cancel pending → confirmation dialog → cancels → status updated
- [ ] Approved transaction → no cancel button

**Things Cursor Must NOT Modify:**
- Withdraw and add capital modals
- Fund screen main

---

## TASK 19.5 — Withdrawal History Screen

**Goal:**
Build a dedicated withdrawal history view accessible from the Fund page or Revenue page.

**Files to Create:**
- `frontend/app/(partner)/withdrawals.tsx`

**Files to Modify:**
- `frontend/app/(partner)/fund.tsx` — add link to withdrawal history

**Acceptance Criteria:**
- [ ] All withdrawal requests listed (capital + revenue combined)
- [ ] Filter: by account type, by status
- [ ] Each item: amount, account type, transfer mode, status chip, date
- [ ] Tap → detail with: transaction ID, status timeline, payment UTR (if completed)
- [ ] Pull to refresh

**Testing Checklist:**
- [ ] Capital + revenue withdrawals appear together
- [ ] Filter by account type → correct results
- [ ] Completed withdrawal → UTR shown in detail

**Things Cursor Must NOT Modify:**
- Fund screen main
- Revenue screen

---

---

# PHASE 20: FRONTEND — PROFILE SCREEN

---

## TASK 20.1 — Profile Screen Main

**Goal:**
Build the main profile screen showing all investor details with edit capability and KYC status.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 20.5 for profile page structure

**Files to Modify:**
- `frontend/app/(partner)/profile.tsx` — complete profile screen

**Acceptance Criteria:**
- [ ] Profile photo (with upload/change option)
- [ ] Personal details section: Name, DOB, Address
- [ ] Contact section: Mobile (with change request button), Email (with change request button)
- [ ] KYC section: PAN Number (masked: XXXXX1234F if verified, full if pending), KYC status badge
- [ ] KYC documents: PAN front/back, Aadhar front/back (thumbnails, tap to view full)
- [ ] Bank details section: Account number (masked), IFSC, Bank name
- [ ] UPI ID section
- [ ] Account Opening Date: "Partner Since: 15 Jul 2024"
- [ ] Edit button per section (not full form at once)
- [ ] Pending update requests shown with "Pending Approval" tag
- [ ] Self-deactivate account button (bottom, red, requires confirmation)

**Testing Checklist:**
- [ ] All profile sections visible
- [ ] Pending update shows "Pending Approval" tag
- [ ] KYC verified → fields shown with lock icon
- [ ] Tap KYC document thumbnail → full view
- [ ] Deactivate button → confirmation dialog

**Things Cursor Must NOT Modify:**
- Fund screen
- Revenue screen

---

## TASK 20.2 — Profile Edit Forms

**Goal:**
Build profile field edit forms that submit update requests for admin approval.

**Files to Create:**
- `frontend/components/modals/EditProfileModal.tsx`
- `frontend/components/modals/EditContactModal.tsx`

**Files to Modify:**
- `frontend/app/(partner)/profile.tsx` — integrate edit modals

**Acceptance Criteria:**
- [ ] Edit personal details: Name, DOB, Address fields
- [ ] Edit contact: Mobile change request form (OTP verification), Email change request form
- [ ] Submit → API call → success: "Your details will be updated within 24-48 hours after admin approval. Thank you for your request."
- [ ] Locked KYC fields (PAN/Aadhar) → shown as read-only with "Locked" badge, cannot edit
- [ ] Non-locked KYC fields (before verification) → editable
- [ ] Bank details edit form

**Testing Checklist:**
- [ ] Edit name → success message shown
- [ ] Locked PAN → edit button missing/disabled
- [ ] Submit mobile change → success message
- [ ] Admin notification created (check backend)

**Things Cursor Must NOT Modify:**
- Profile screen main
- Fund screen

---

## TASK 20.3 — KYC Document Upload

**Goal:**
Build the KYC document upload interface for PAN and Aadhar (front and back).

**Files to Create:**
- `frontend/components/modals/KYCUploadModal.tsx`

**Files to Modify:**
- `frontend/app/(partner)/profile.tsx` — integrate KYC upload

**Acceptance Criteria:**
- [ ] Upload section for: PAN front, PAN back, Aadhar front, Aadhar back
- [ ] Each: file picker button, preview thumbnail, upload status
- [ ] Accepted: JPG, PNG, PDF (max 5MB)
- [ ] Rejected files: error message with file type/size info
- [ ] Upload progress indicator
- [ ] After upload: creates profile update request for document field
- [ ] Profile photo upload: camera or gallery option
- [ ] Profile photo preview before saving

**Testing Checklist:**
- [ ] Select valid image → thumbnail preview shown
- [ ] Upload > 5MB → error message
- [ ] Upload .exe → error message
- [ ] Upload PDF → accepted
- [ ] Profile photo: crop/preview before save

**Things Cursor Must NOT Modify:**
- Profile edit forms
- Profile screen main

---

## TASK 20.4 — Profile Update Request History

**Goal:**
Build the profile update request history view showing all pending and completed update requests.

**Files to Create:**
- `frontend/components/modals/UpdateRequestsModal.tsx`

**Files to Modify:**
- `frontend/app/(partner)/profile.tsx` — add update requests button

**Acceptance Criteria:**
- [ ] List of all profile update requests
- [ ] Each: field name, old value, new value, status chip, date submitted
- [ ] Pending requests: highlighted with amber indicator
- [ ] Approved requests: green
- [ ] Rejected requests: red with rejection reason shown

**Testing Checklist:**
- [ ] All update requests listed
- [ ] Rejected request → rejection reason visible
- [ ] Pending requests highlighted

**Things Cursor Must NOT Modify:**
- KYC upload
- Profile edit forms

---

## TASK 20.5 — Account Settings & Self-Deactivation

**Goal:**
Build account settings (password change, session management) and self-deactivation flow.

**Files to Create:**
- `frontend/app/(partner)/account-settings.tsx`

**Files to Modify:**
- `frontend/app/(partner)/profile.tsx` — add account settings link

**Acceptance Criteria:**
- [ ] Change password form: current password, new password, confirm password
- [ ] Password strength indicator
- [ ] Active sessions display (mobile + web)
- [ ] Self-deactivate: "Deactivate Account" button → confirmation dialog: "Are you sure? Your account will be deactivated. Contact support to reactivate." → deactivation API call → logout
- [ ] Logout button

**Testing Checklist:**
- [ ] Change password → can login with new password
- [ ] Self-deactivate → confirmation shown → deactivated → logged out
- [ ] Deactivated account → cannot login (pending admin reactivation)

**Things Cursor Must NOT Modify:**
- Profile update requests
- KYC upload

---

---

# PHASE 21: FRONTEND — SUPPORT SCREEN

---

## TASK 21.1 — Support Screen & Ticket List

**Goal:**
Build the support page with ticket list, filtering, and raise new ticket button.

**Context:**
- Read PROJECT_KNOWLEDGE.md Section 20.6 for support page

**Files to Modify:**
- `frontend/app/(partner)/support.tsx` — complete support screen

**Acceptance Criteria:**
- [ ] "Raise New Ticket" button (prominent, golden)
- [ ] Ticket list: ticket ID, category badge, subject, status chip, date, last update
- [ ] Filter tabs: All / Open / In Progress / Resolved / Closed
- [ ] Each ticket → tap → navigate to ticket detail
- [ ] Pull to refresh
- [ ] Empty state: "No tickets yet. Raise a ticket to get help."

**Testing Checklist:**
- [ ] Tickets listed correctly
- [ ] Filter by Open → only open tickets
- [ ] Tap ticket → detail screen
- [ ] Empty state shown when no tickets

**Things Cursor Must NOT Modify:**
- Profile screen
- Fund screen

---

## TASK 21.2 — Raise Ticket Form

**Goal:**
Build the new support ticket form with category selection, message, and attachment upload.

**Files to Create:**
- `frontend/components/modals/RaiseTicketModal.tsx`

**Files to Modify:**
- `frontend/app/(partner)/support.tsx` — integrate raise ticket

**Acceptance Criteria:**
- [ ] Category picker: Capital Related, Revenue Related, Withdrawal Related, KYC/Profile Related, Technical Issue, Other
- [ ] Subject field
- [ ] Message textarea (min 20 characters)
- [ ] Attachment picker: multiple files (JPG/PNG/PDF, 5MB each, max 5 attachments)
- [ ] Attachment previews shown below textarea
- [ ] Remove attachment option per file
- [ ] Submit → loading → success: "Your ticket [TKT-SUP-2024-XXXXX] has been submitted. We'll respond within 24-48 hours."
- [ ] Ticket ID shown prominently in success message

**Testing Checklist:**
- [ ] Empty subject → validation error
- [ ] Short message → validation error
- [ ] Valid form → ticket created, ID shown
- [ ] Attachment upload → preview shown
- [ ] Remove attachment → removed from list

**Things Cursor Must NOT Modify:**
- Support ticket list
- Profile screen

---

## TASK 21.3 — Ticket Detail & Conversation Screen

**Goal:**
Build the ticket detail screen showing conversation thread with reply capability and reopen option.

**Files to Create:**
- `frontend/app/(partner)/support/[ticketId].tsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Ticket header: ID, category, status chip, assigned admin (if assigned)
- [ ] Conversation thread: messages in chat-bubble style (investor right, admin left)
- [ ] Each message: sender name, time, message text, attachments (downloadable)
- [ ] Reply box at bottom: textarea + attachment picker + send button
- [ ] Keyboard-aware: reply box moves above keyboard
- [ ] Resolved ticket: show "Reopen Ticket" button
- [ ] Closed ticket: no reply option, show "Ticket Closed" banner
- [ ] Attachment in message: tap → view/download

**Testing Checklist:**
- [ ] Conversation thread loads correctly
- [ ] Send reply → new message appears at bottom
- [ ] Attachment in reply → uploaded and shown
- [ ] Resolved ticket → reopen button visible
- [ ] Reopen → status changes to open
- [ ] Closed ticket → no reply box

**Things Cursor Must NOT Modify:**
- Raise ticket form
- Support ticket list

---

## TASK 21.4 — Support Attachment Viewer

**Goal:**
Build the attachment viewer for images and PDF documents within the support ticket conversation.

**Files to Create:**
- `frontend/components/modals/AttachmentViewer.tsx`

**Files to Modify:**
- `frontend/app/(partner)/support/[ticketId].tsx` — integrate viewer

**Acceptance Criteria:**
- [ ] Image attachments: full-screen viewer with pinch-to-zoom
- [ ] PDF attachments: open in device PDF viewer or in-app WebView
- [ ] Download button for all attachment types
- [ ] Multiple attachments: swipeable gallery
- [ ] Loading indicator while attachment loads
- [ ] Error state: "Could not load attachment"

**Testing Checklist:**
- [ ] Image tap → full screen viewer
- [ ] Pinch to zoom → works
- [ ] Download → file saved to device
- [ ] PDF → opens correctly

**Things Cursor Must NOT Modify:**
- Ticket conversation screen
- Support ticket list

---

---

# PHASE 22: FRONTEND — ADMIN PANEL

---

## TASK 22.1 — Admin Layout & Navigation

**Goal:**
Build the admin panel layout with navigation structure, notification center access, and role indicators.

**Files to Modify:**
- `frontend/app/(admin)/_layout.tsx` — complete admin layout

**Files to Create:**
- `frontend/app/(admin)/dashboard.tsx` — placeholder complete
- `frontend/components/admin/AdminSidebar.tsx` or `AdminBottomNav.tsx`

**Acceptance Criteria:**
- [ ] Mobile: bottom navigation or side drawer for admin menus
- [ ] Admin menu items: Dashboard, Users, Capital, Revenue, Backdate, Support, Notifications, Reports, Logs, Settings
- [ ] Super Admin sees: all menus + Admin Management
- [ ] Regular Admin: all menus except Admin Management
- [ ] Notification bell with pending approval count badge
- [ ] Admin name and role shown in header
- [ ] Logout option

**Testing Checklist:**
- [ ] Super Admin sees Admin Management menu
- [ ] Regular Admin does not see Admin Management
- [ ] Notification badge shows pending count
- [ ] All menus navigate correctly

**Things Cursor Must NOT Modify:**
- Partner panel layout
- Auth screens

---

## TASK 22.2 — Admin Dashboard Screen

**Goal:**
Build the admin dashboard with stats cards, today's revenue schedule, real-time activity feed, top investors, and financial summary.

**Files to Modify:**
- `frontend/app/(admin)/dashboard.tsx` — complete admin dashboard

**Acceptance Criteria:**
- [ ] Stats cards: Total Partners, Total Capital, Today's Revenue, Pending Approvals, Active Tickets
- [ ] Today's schedule card: "6:00 PM — 47 partners — ₹X,XX,XXX total"
- [ ] Real-time activity feed: last 20 activities (auto-refresh every 30 seconds)
- [ ] Top 5 investors by capital (list with amounts)
- [ ] Top 5 investors by ROI earned
- [ ] Financial summary: total capital, monthly revenue, monthly withdrawals, net liability
- [ ] Date range filter for stats
- [ ] Pull to refresh all data

**Testing Checklist:**
- [ ] Stats show correct numbers
- [ ] Activity feed updates every 30 seconds
- [ ] Date range filter changes stats
- [ ] Pull to refresh → data reloaded

**Things Cursor Must NOT Modify:**
- Admin layout
- Partner dashboard

---

## TASK 22.3 — User Management Screen (Admin)

**Goal:**
Build the admin user management screen with investor list, search, filters, and quick actions.

**Files to Create:**
- `frontend/app/(admin)/users/index.tsx`
- `frontend/app/(admin)/users/[investorId].tsx` — investor detail

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Investor list with search bar (name, email, mobile)
- [ ] Filter chips: All / Active / Pending / Paused / Locked / Self-Deactivated
- [ ] Each investor row: name, email, capital amount, status chip, KYC status, joining date
- [ ] Locked investors: "Locked" badge with reason
- [ ] Tap investor → full detail page
- [ ] Detail page: all profile info + KYC status + capital summary + ROI info + action buttons
- [ ] Action buttons: Approve, Reject, Pause, Resume, Unlock, Delete
- [ ] Pending profile update requests shown with notification count
- [ ] Concurrent edit warning: "[Admin Name] is also viewing this investor"
- [ ] Modify joining date option (with date picker)

**Testing Checklist:**
- [ ] Search by name → correct results
- [ ] Filter by pending → only pending investors
- [ ] Approve investor → status changes
- [ ] Concurrent edit warning shown when another admin is viewing same investor

**Things Cursor Must NOT Modify:**
- Admin dashboard
- Partner panel screens

---

## TASK 22.4 — Capital Management Screen (Admin)

**Goal:**
Build the admin capital management screen with deposit/withdrawal request queues and approval workflows.

**Files to Create:**
- `frontend/app/(admin)/capital/index.tsx`
- `frontend/app/(admin)/capital/requests.tsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Capital overview: total capital, pending deposits (count+amount), pending withdrawals (count+amount)
- [ ] Two tabs: Deposit Requests / Withdrawal Requests
- [ ] Each deposit request: investor name, amount, UTR, date, screenshot download button, approve/reject actions
- [ ] Approve deposit: amount editable before confirming (shows original amount, allows modification)
- [ ] Each withdrawal request: investor name, amount, account type, transfer mode, bank/UPI details, approve/reject/complete
- [ ] Bulk select + bulk approve for withdrawal requests
- [ ] Complete withdrawal: enter payment date + UTR (optional)
- [ ] Capital lock/unlock toggle per investor (accessible from request detail)
- [ ] Admin direct credit/debit form per investor

**Testing Checklist:**
- [ ] Deposit request → download screenshot → approve with modified amount
- [ ] Withdrawal bulk approve → all selected approved
- [ ] Complete withdrawal → enter UTR → status: completed
- [ ] Capital lock toggle → investor's pending withdrawal auto-cancelled

**Things Cursor Must NOT Modify:**
- User management screen
- Admin dashboard

---

## TASK 22.5 — Revenue Management Screen (Admin)

**Goal:**
Build the admin revenue management screen with ROI settings, per-investor controls, and manual revenue operations.

**Files to Create:**
- `frontend/app/(admin)/revenue/index.tsx`
- `frontend/app/(admin)/revenue/[investorId].tsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Revenue overview: today's credit total, this month's total, paused count, next scheduled time
- [ ] Investor list with: name, default ROI%, current term ROI%, last credit date, last credit amount, pause status
- [ ] Tap investor → revenue detail:
  - Default ROI setting (editable)
  - Term-based ROI list (add/delete terms)
  - Credit frequency + time setting
  - Withdrawal frequency setting
  - Pause/Resume toggle
  - Revenue transaction history
  - Manual credit/debit button
  - Edit/reverse specific entry option
- [ ] ROI term form: start date, end date, percentage
- [ ] Manual credit/debit form: date, amount, remark
- [ ] All changes confirm before saving

**Testing Checklist:**
- [ ] Change default ROI → updates immediately
- [ ] Add ROI term → term appears in list
- [ ] Pause investor → cron skips (verify in next cron log)
- [ ] Manual credit → appears in transaction history
- [ ] Reverse entry → balance adjusted

**Things Cursor Must NOT Modify:**
- Capital management screen
- User management screen

---

## TASK 22.6 — Backdate Management Screen (Admin)

**Goal:**
Build the backdate management screen for submitting backdated entries and Super Admin approval queue.

**Files to Create:**
- `frontend/app/(admin)/backdate/index.tsx`
- `frontend/app/(admin)/backdate/requests.tsx` — Super Admin approval queue

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Three backdate types: Single Revenue / Bulk Revenue / Capital Entry / New Investor
- [ ] Investor picker (search and select)
- [ ] Single revenue form: date, amount (optional), ROI (optional), remark, email toggle
- [ ] Bulk revenue form: start date, end date, ROI (optional), remark, email toggle, preview button
- [ ] Preview: shows distribution of amounts per day (scrollable list)
- [ ] Capital entry form: amount, date, UTR, remark, auto-calculate revenue toggle, email toggle
- [ ] New investor form: all investor fields + joining date + initial capital + ROI + email toggle
- [ ] Submit → success: "Backdate request submitted for Super Admin approval"
- [ ] Super Admin: approval queue with pending requests list, approve/reject with reason
- [ ] Execution log view for completed requests

**Testing Checklist:**
- [ ] Submit bulk revenue → preview shows day-wise amounts
- [ ] Submit → pending in Super Admin queue
- [ ] Super Admin approves → execution log shows results
- [ ] Regular admin cannot see approval actions (Super Admin only)

**Things Cursor Must NOT Modify:**
- Revenue management screen
- Capital management screen

---

## TASK 22.7 — Support Management Screen (Admin)

**Goal:**
Build the admin support ticket management screen with ticket queue, assignment, and resolution workflow.

**Files to Create:**
- `frontend/app/(admin)/support/index.tsx`
- `frontend/app/(admin)/support/[ticketId].tsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Ticket list with: ticket ID, investor name, category badge, subject, status, assigned admin, date, last update
- [ ] Filter: by status, category, investor, assigned admin, date range
- [ ] Sort: by date (newest), by status, by investor
- [ ] Escalated tickets (7+ days): red highlight / "ESCALATED" badge
- [ ] Ticket detail: full conversation thread, admin reply form, status change dropdown, assign to admin dropdown
- [ ] Reply: text + attachments
- [ ] Mark as resolved/closed
- [ ] Escalated tickets: Super Admin can mark as resolved (others cannot)

**Testing Checklist:**
- [ ] Filter by open → only open tickets
- [ ] Escalated ticket → red highlight visible
- [ ] Admin reply → message appears in thread
- [ ] Assign to another admin → that admin notified
- [ ] Close ticket → status updated, investor email sent

**Things Cursor Must NOT Modify:**
- Backdate screen
- Revenue management

---

## TASK 22.8 — Reports, Logs & Settings Screens (Admin)

**Goal:**
Build the admin reports, activity logs, cron logs, and system settings screens.

**Files to Create:**
- `frontend/app/(admin)/reports/index.tsx`
- `frontend/app/(admin)/logs/index.tsx`
- `frontend/app/(admin)/settings/index.tsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Reports: generate investor statement, capital report, revenue report — date range picker, format selector (PDF/Excel), download button
- [ ] Activity Logs: filterable list with admin name, action, investor affected, timestamp
- [ ] Cron Logs: list of cron executions with job name, time, status, count, amount
- [ ] Settings screen (Super Admin):
  - Global credit time picker
  - Capital min/max inputs
  - UPI limit input
  - Withdrawal frequency default
  - Maintenance mode toggle
  - Manual backup button
  - T&C editor (rich text or textarea)
  - Privacy Policy editor
  - Admin management (list of admins, create/suspend/delete)
- [ ] Admin management: create admin form, suspend/unsuspend toggle, delete with confirmation

**Testing Checklist:**
- [ ] Generate PDF report → downloads correctly
- [ ] Activity log filter → correct results
- [ ] Toggle maintenance mode → investor API returns 503
- [ ] Create new admin → admin can login
- [ ] Suspend admin → admin cannot login

**Things Cursor Must NOT Modify:**
- Support management screen
- Backdate screen

---

---

# PHASE 23: NOTIFICATIONS (In-App)

---

## TASK 23.1 — Admin Notification Center Screen

**Goal:**
Build the admin notification center with pending approval counts, system alerts, and custom broadcast composer.

**Files to Create:**
- `frontend/app/(admin)/notifications/index.tsx`

**Files to Modify:**
- None

**Acceptance Criteria:**
- [ ] Pending counts section: capital requests, withdrawal requests, profile updates, new registrations, open tickets — each with count and "View" button
- [ ] System alerts section: email failures, backup failures, cron failures
- [ ] Recent notifications list
- [ ] Custom broadcast section:
  - Target: Single Investor / Selected Investors / All Investors
  - Single: investor search + select
  - Selected: multi-select investor list
  - All: checkbox
  - Title + Body textarea
  - Send Email toggle
  - Preview + Send button
- [ ] Broadcast confirmation dialog

**Testing Checklist:**
- [ ] Pending counts accurate
- [ ] Broadcast to single investor → notification created
- [ ] Broadcast with email → email_logs entry created
- [ ] Select multiple investors → all receive notification

**Things Cursor Must NOT Modify:**
- Reports and settings screens
- Support management

---

---

# PHASE 24: DARK MODE

*(Covered in Task 17.3 — already included in Phase 17)*

---

---

# PHASE 25: ANIMATIONS & POLISH

---

## TASK 25.1 — Page Transition Animations

**Goal:**
Add smooth page transition animations across the entire app for all navigation actions.

**Files to Modify:**
- `frontend/app/(partner)/_layout.tsx` — add transition config
- `frontend/app/(admin)/_layout.tsx` — add transition config
- `frontend/app/(auth)/_layout.tsx` — add transition config

**Acceptance Criteria:**
- [ ] Screen transitions: smooth slide animation (300ms)
- [ ] Modal presentation: slide up from bottom
- [ ] Bottom sheet: spring animation with rubber-band effect
- [ ] Auth screens: fade transition
- [ ] Back navigation: slide back to right

**Testing Checklist:**
- [ ] Navigate between tabs → smooth, no jank
- [ ] Open modal → slides up smoothly
- [ ] Back navigation → smooth slide back

**Things Cursor Must NOT Modify:**
- Screen content
- API service layer

---

## TASK 25.2 — Micro-Animations & Loading Polish

**Goal:**
Add micro-animations to buttons, cards, list items, and status indicators for a premium feel.

**Files to Modify:**
- `frontend/components/ui/Button.tsx` — press animation
- `frontend/components/cards/BalanceCard.tsx` — mount animation
- `frontend/components/cards/TransactionItem.tsx` — list item animation

**Acceptance Criteria:**
- [ ] Button press: scale(0.97) animation (100ms)
- [ ] Cards: fade + scale on mount (300ms)
- [ ] Transaction list items: staggered fade in on load (50ms delay between items)
- [ ] Balance amount: number counting animation on first load
- [ ] Status chip: pulse animation for pending status
- [ ] Loading spinner: smooth rotation

**Testing Checklist:**
- [ ] Press button → subtle scale animation
- [ ] Dashboard loads → cards fade in sequentially
- [ ] Balance number → counts up to value
- [ ] Pending chip → pulsing animation

**Things Cursor Must NOT Modify:**
- Screen layouts
- Business logic

---

## TASK 25.3 — Offline State & Error Polish

**Goal:**
Add offline state detection, error boundaries, and connection recovery handling.

**Files to Create:**
- `frontend/components/common/OfflineBanner.tsx`
- `frontend/components/common/ErrorBoundary.tsx`

**Files to Modify:**
- `frontend/app/_layout.tsx` — integrate offline detection and error boundary

**Acceptance Criteria:**
- [ ] Offline banner: appears at top when no internet connection (red banner "No internet connection")
- [ ] Banner dismisses automatically when connection restored
- [ ] Error boundary: catches React errors, shows "Something went wrong" screen with retry
- [ ] Last synced data shown while offline (React Query cache)
- [ ] Cached data shows "Last updated X minutes ago" label when offline

**Testing Checklist:**
- [ ] Disable network → offline banner appears
- [ ] Re-enable network → banner disappears
- [ ] Cached data visible while offline
- [ ] JavaScript error caught by boundary → error screen shown

**Things Cursor Must NOT Modify:**
- Page transition animations
- Screen layouts

---

## TASK 25.4 — Final UI Polish Pass

**Goal:**
Final polish: consistent spacing, shadow depths, typography hierarchy, and visual refinements across all screens.

**Files to Modify:**
- Various screen files — spacing and visual adjustments only

**Acceptance Criteria:**
- [ ] Consistent 16px horizontal padding on all screens
- [ ] Consistent 16px gap between cards
- [ ] Typography hierarchy: titles 18px Bold, subtitles 14px SemiBold, body 14px Regular, captions 12px Regular
- [ ] Card shadows: consistent across all cards
- [ ] Status colors: consistent across all screens
- [ ] Golden accents: used consistently on primary CTAs and key values
- [ ] No pixel overflow or cut-off content on 375px width
- [ ] All amounts: ₹ Indian format, no decimals

**Testing Checklist:**
- [ ] Scroll through all screens on 375px device → no overflow
- [ ] All ₹ amounts formatted correctly (Indian format, no decimals)
- [ ] Consistent spacing visible across all screens
- [ ] Golden color used for: primary amounts, active tab, key CTAs

**Things Cursor Must NOT Modify:**
- Business logic
- API service layer
- Component core functionality

---

---

# PHASE 26: SECURITY HARDENING

---

## TASK 26.1 — API Security Audit

**Goal:**
Audit and harden all API endpoints for: missing auth middleware, role checks, input validation, and SQL injection prevention.

**Files to Modify:**
- Various route files — add missing middleware
- Various controller files — add missing validation

**Acceptance Criteria:**
- [ ] Every route has auth middleware (except public routes: health, T&C, privacy, register, login)
- [ ] Every admin route has role middleware
- [ ] Super Admin routes have requireSuperAdmin middleware
- [ ] All inputs validated server-side with express-validator
- [ ] No raw string concatenation in any SQL query
- [ ] File upload routes: MIME type + size checked
- [ ] Audit log entry for all admin mutations (no missing logs)
- [ ] Rate limiting on all sensitive endpoints

**Testing Checklist:**
- [ ] Attempt each investor route without token → 401
- [ ] Attempt each admin route with investor token → 403
- [ ] Attempt Super Admin route with regular admin token → 403
- [ ] SQL injection attempt in search params → properly handled

**Things Cursor Must NOT Modify:**
- Business logic in services
- Frontend code

---

## TASK 26.2 — Concurrent Operation Safety

**Goal:**
Add database-level locks and idempotency keys for all concurrent operation risks.

**Files to Modify:**
- Various controller files — add transaction locks where needed

**Acceptance Criteria:**
- [ ] Withdrawal approval: `SELECT FOR UPDATE` lock to prevent double-processing
- [ ] Transaction ID generation: atomic sequence increment
- [ ] Revenue credit: idempotency check (already credited today = skip)
- [ ] Capital balance deduction: check balance atomically in same DB transaction
- [ ] Admin concurrent edit: lock warning system functional

**Testing Checklist:**
- [ ] Simulate 2 simultaneous withdrawal approvals → only one processed
- [ ] Revenue cron run twice simultaneously → no double credits
- [ ] Concurrent capital balance deduction → no negative balance possible

**Things Cursor Must NOT Modify:**
- Frontend code
- Email service

---

## TASK 26.3 — Data Privacy & Sensitive Data Handling

**Goal:**
Ensure all sensitive data (PAN, Aadhar, bank details) is handled securely in responses and logs.

**Files to Modify:**
- Various controller files — mask sensitive data in responses/logs
- `backend/src/utils/logger.js` — ensure no sensitive data logged

**Acceptance Criteria:**
- [ ] PAN/Aadhar numbers never appear in server logs
- [ ] Bank account numbers masked in API responses (last 4 digits only) except admin panel
- [ ] Admin panel: full PAN/Aadhar shown (as per requirement)
- [ ] Passwords never appear anywhere in logs or responses
- [ ] File upload paths not exposed directly in API responses
- [ ] Error messages never include internal system details in production

**Testing Checklist:**
- [ ] Check server logs after investor login → no PAN/Aadhar in logs
- [ ] Investor profile API response → bank account masked
- [ ] Admin investor detail API → full numbers shown
- [ ] 500 error response → no stack trace visible

**Things Cursor Must NOT Modify:**
- Business logic
- Frontend code

---

## TASK 26.4 — Rate Limiting & Spam Prevention Final Check

**Goal:**
Verify and test all rate limits, spam prevention, and brute force protection mechanisms.

**Files to Modify:**
- `backend/src/middleware/rateLimit.middleware.js` — verify all limits configured

**Acceptance Criteria:**
- [ ] Login rate limit: 10 attempts per 15 minutes per IP → verified
- [ ] OTP request limit: 3 per 15 minutes per email → verified
- [ ] Registration limit: 5 per hour per IP → verified
- [ ] General API limit: 100 per 15 minutes per IP → verified
- [ ] File upload: max 5MB enforced server-side → verified
- [ ] Duplicate UTR check: globally across all investors → verified
- [ ] Duplicate PAN/Aadhar: system-wide check → verified
- [ ] Deleted email blocked from re-registration → verified

**Testing Checklist:**
- [ ] 11th login attempt in 15 min → 429 rate limit response
- [ ] 4th OTP request in 15 min → 429 rate limit response
- [ ] Upload 6MB file → rejected with FILE_TOO_LARGE error
- [ ] Register with deleted investor's email → blocked

**Things Cursor Must NOT Modify:**
- Business logic
- Frontend code

---

---

# PHASE 27: DEPLOYMENT SETUP

---

## TASK 27.1 — Server Configuration Scripts

**Goal:**
Create all server setup scripts for Ubuntu 24.04: Node.js installation, PostgreSQL setup, Nginx configuration, PM2 setup.

**Files to Create:**
- `scripts/server-setup.sh` — complete server setup script
- `nginx/tikhat.conf` — Nginx configuration
- `backend/ecosystem.config.js` — PM2 configuration

**Files to Modify:**
- `README.md` — complete deployment guide

**Acceptance Criteria:**
- [ ] `server-setup.sh` installs: Node.js 20 LTS, PostgreSQL 16, Nginx, PM2 globally
- [ ] Nginx config: frontend served from /var/www/tikhat/, API proxied to port 5000
- [ ] Nginx: HTTP → HTTPS redirect
- [ ] Nginx: gzip compression enabled
- [ ] PM2: cluster mode with 2 instances, auto-restart, log rotation
- [ ] PM2 starts on server reboot (`pm2 startup`)
- [ ] README has: prerequisites, step-by-step deployment, environment variables list, backup setup guide

**Testing Checklist:**
- [ ] Run setup script on fresh Ubuntu 24.04 → all tools installed
- [ ] Nginx config syntax valid: `nginx -t`
- [ ] PM2 config valid: `pm2 start ecosystem.config.js --dry-run`

**Things Cursor Must NOT Modify:**
- Application code
- Database migrations

---

## TASK 27.2 — Environment Configuration & Build

**Goal:**
Create production build scripts, environment variable validation, and deployment checklist.

**Files to Create:**
- `scripts/deploy.sh` — full deployment script
- `scripts/validate-env.js` — validates all required env variables are set
- `frontend/app.config.ts` — Expo config with environment variables

**Files to Modify:**
- `backend/server.js` — add env validation on startup

**Acceptance Criteria:**
- [ ] `validate-env.js` checks all required env variables exist before server starts
- [ ] Missing env variable → clear error message with variable name
- [ ] `deploy.sh`: pull latest code, install dependencies, run migrations, build frontend, restart PM2
- [ ] Frontend build for web: `expo export --platform web`
- [ ] Frontend build output copied to Nginx web root
- [ ] Health check after deploy: verify API responds

**Testing Checklist:**
- [ ] Remove one env variable → clear error on startup
- [ ] Run deploy script → all steps complete without error
- [ ] After deploy → health check endpoint responds

**Things Cursor Must NOT Modify:**
- Server setup scripts
- Nginx config

---

## TASK 27.3 — Google Drive Backup Configuration

**Goal:**
Set up and configure the Google Drive API connection for automated backups with service account.

**Files to Create:**
- `scripts/setup-gdrive.js` — Google Drive setup verification script
- `backend/GDRIVE_SETUP.md` — Google Drive setup guide

**Files to Modify:**
- `backend/src/services/gdrive.service.js` — complete Google Drive integration

**Acceptance Criteria:**
- [ ] Service account JSON credentials stored securely (path in .env)
- [ ] `setup-gdrive.js` verifies Drive API connection and folder access
- [ ] Backup folder created if not exists: `TikhatPartnerBackups`
- [ ] Date-wise subfolder created automatically: `YYYY/MM/DD`
- [ ] Upload large backup files with resumable upload (not single shot)
- [ ] `GDRIVE_SETUP.md` step-by-step guide for creating service account

**Testing Checklist:**
- [ ] Run setup script → Drive connection verified
- [ ] Upload test file → appears in correct Drive folder
- [ ] Large file (100MB+) → uploads completely

**Things Cursor Must NOT Modify:**
- Backup service
- Deploy scripts

---

## TASK 27.4 — Cloudflare & Domain Configuration

**Goal:**
Document and configure Cloudflare DNS settings, SSL, and security rules for tikhatpartner.online.

**Files to Create:**
- `CLOUDFLARE_SETUP.md` — complete Cloudflare configuration guide

**Files to Modify:**
- `nginx/tikhat.conf` — update for Cloudflare real IP forwarding

**Acceptance Criteria:**
- [ ] Nginx configured to get real IP from Cloudflare (not Cloudflare proxy IP)
- [ ] `CLOUDFLARE_SETUP.md` includes: DNS records (A, CNAME), SSL mode (Full Strict), security rules (bot protection, rate limiting at Cloudflare level)
- [ ] Rate limiting in app uses real client IP (not Cloudflare IP)
- [ ] Firewall rules: only Cloudflare IPs can access port 80/443 (direct server access blocked)

**Testing Checklist:**
- [ ] Access via domain → SSL certificate valid (Cloudflare)
- [ ] Server logs show real visitor IP (not 103.x.x.x Cloudflare IP)

**Things Cursor Must NOT Modify:**
- Deploy scripts
- Application code

---

## TASK 27.5 — Mobile App Build Configuration

**Goal:**
Configure Expo for building Android APK/AAB and iOS IPA builds.

**Files to Create:**
- `frontend/eas.json` — EAS Build configuration
- `MOBILE_BUILD.md` — Mobile build guide

**Files to Modify:**
- `frontend/app.json` — complete app configuration

**Acceptance Criteria:**
- [ ] `eas.json` configured for: development, preview, production builds
- [ ] Android: APK for testing, AAB for Play Store
- [ ] iOS: IPA for distribution (requires Apple Developer account)
- [ ] App version and build number configured
- [ ] Bundle identifier: `online.tikhatpartner.app`
- [ ] App icons and splash screens configured (placeholder assets)
- [ ] `MOBILE_BUILD.md` step-by-step guide for building and distributing

**Testing Checklist:**
- [ ] `eas build --platform android --profile preview` → APK generated
- [ ] APK installs on Android device
- [ ] App runs without errors on mobile

**Things Cursor Must NOT Modify:**
- Frontend application code
- Backend code

---

---

# PHASE 28: TESTING & QA

---

## TASK 28.1 — Backend API Testing

**Goal:**
Create API tests for all critical business logic endpoints using a testing framework.

**Files to Create:**
- `backend/tests/auth.test.js`
- `backend/tests/capital.test.js`
- `backend/tests/revenue.test.js`
- `backend/tests/roi.test.js`

**Acceptance Criteria:**
- [ ] Auth tests: register, login, OTP, logout, refresh, forgot password
- [ ] Capital tests: deposit, withdraw, approve, reject, balance calculation
- [ ] Revenue tests: ROI calculation, daily amounts, monthly total, pro-rated
- [ ] ROI unit tests: all calculation scenarios from PROJECT_KNOWLEDGE.md Section 7.2

**Testing Checklist:**
- [ ] `npm test` → all tests pass
- [ ] ROI calculations verified against manual calculations
- [ ] Capital balance always non-negative

**Things Cursor Must NOT Modify:**
- Application code
- Migration files

---

## TASK 28.2 — End-to-End Flow Verification

**Goal:**
Verify complete end-to-end flows: investor lifecycle, capital lifecycle, revenue lifecycle, support lifecycle.

**Files to Create:**
- `TESTING_CHECKLIST.md` — Complete manual testing checklist

**Acceptance Criteria:**
- [ ] Investor flow: register → admin approve → login → add capital → revenue credits → withdraw → support ticket
- [ ] Capital flow: deposit request → admin approve with modified amount → balance updated → withdraw → admin complete with UTR
- [ ] Revenue flow: ROI set → daily cron runs → credit appears → monthly total correct → withdraw revenue
- [ ] Support flow: raise ticket → admin reply → investor reply → admin resolve → investor reopen → admin close
- [ ] Backdate flow: admin submits → Super Admin approves → entries created → investor sees backdated transactions
- [ ] All email triggers verified (check Resend dashboard)

**Testing Checklist:**
- [ ] Complete investor lifecycle without errors
- [ ] All email templates received correctly
- [ ] All transaction IDs generated correctly
- [ ] Balance calculations correct throughout

**Things Cursor Must NOT Modify:**
- Application code

---

## TASK 28.3 — Performance & Load Check

**Goal:**
Basic performance verification: API response times, database query performance, and mobile app render performance.

**Acceptance Criteria:**
- [ ] Dashboard API response: < 500ms
- [ ] Transaction list (paginated): < 300ms
- [ ] Revenue cron (100 investors): completes in < 60 seconds
- [ ] Mobile app: first load < 3 seconds on 4G
- [ ] No N+1 query problems in investor list
- [ ] Database indexes verified (EXPLAIN ANALYZE on main queries)

**Testing Checklist:**
- [ ] Dashboard API timed with 100 test investors → < 500ms
- [ ] Revenue cron with 100 investors → completes under 60 seconds

**Things Cursor Must NOT Modify:**
- Application code (observation only)

---

## TASK 28.4 — Final Bug Fix & Production Readiness

**Goal:**
Fix all identified bugs from testing phases, remove all development artifacts, and prepare for production.

**Acceptance Criteria:**
- [ ] No `console.log` in production code (replace with logger)
- [ ] No TODO comments in code
- [ ] No hardcoded URLs, colors, or amounts
- [ ] All placeholder content marked [REPLACE WITH ACTUAL CONTENT]
- [ ] `.env.example` up to date with all variables
- [ ] README complete with all setup steps
- [ ] All identified bugs from Tasks 28.1 and 28.2 fixed
- [ ] Health check endpoint shows all systems operational

**Testing Checklist:**
- [ ] Grep codebase for `console.log` → zero results in src/
- [ ] Grep for `TODO` → zero results
- [ ] Health check → all systems green
- [ ] Complete investor flow works end-to-end on production server

**Things Cursor Must NOT Modify:**
- Working features
- Migration files

---

---

# QUICK REFERENCE: TASK COMPLETION TRACKER

Copy this section and check off tasks as Cursor completes them:

## Phase 1: Foundation
- [ ] 1.1 Backend Init
- [ ] 1.2 Frontend Init
- [ ] 1.3 Theme & Design System
- [ ] 1.4 Utility Functions
- [ ] 1.5 Middleware Setup
- [ ] 1.6 Navigation Structure

## Phase 2: Database
- [ ] 2.1 Users & Admin Tables
- [ ] 2.2 KYC & Profile History
- [ ] 2.3 Capital Tables
- [ ] 2.4 Revenue & ROI Tables
- [ ] 2.5 Support Tables
- [ ] 2.6 Notifications & Email Logs
- [ ] 2.7 Cron & Backdate Tables
- [ ] 2.8 Seeds & Migration Runner

## Phase 3: Backend Core
- [ ] 3.1 Transaction ID Service
- [ ] 3.2 ROI Calculation Service
- [ ] 3.3 Email Service & Templates
- [ ] 3.4 File Storage Service
- [ ] 3.5 Notification Service
- [ ] 3.6 Audit Log Service

## Phase 4: Authentication
- [ ] 4.1 Investor Registration API
- [ ] 4.2 Investor Login & OTP API
- [ ] 4.3 Password Reset & Email Change
- [ ] 4.4 Admin Authentication API
- [ ] 4.5 Session Management
- [ ] 4.6 Account Unlock Cron

## Phase 5: Capital Module
- [ ] 5.1 Capital Add Request API
- [ ] 5.2 Capital Withdrawal API
- [ ] 5.3 Admin Capital Management
- [ ] 5.4 Balance Calculation Service
- [ ] 5.5 Withdrawal Frequency Checker
- [ ] 5.6 48-Hour Reminder Cron

## Phase 6: Revenue Engine
- [ ] 6.1 ROI Settings API
- [ ] 6.2 Daily Revenue Credit Cron
- [ ] 6.3 Revenue Transactions API
- [ ] 6.4 Admin Revenue Management
- [ ] 6.5 Monthly Revenue Tracking
- [ ] 6.6 ROI Expiry Alert Cron
- [ ] 6.7 Revenue Credit Settings API

## Phase 7: Withdrawal System
- [ ] 7.1 Revenue Withdrawal API
- [ ] 7.2 Admin Withdrawal Management
- [ ] 7.3 Withdrawal History API
- [ ] 7.4 Investor Dashboard API
- [ ] 7.5 Admin Dashboard API

## Phase 8: Support System
- [ ] 8.1 Support Ticket API (Investor)
- [ ] 8.2 Support Ticket API (Admin)
- [ ] 8.3 Ticket Escalation Cron
- [ ] 8.4 Support Summary API
- [ ] 8.5 Notification Center API

## Phase 9: Email & Automation
- [ ] 9.1 Monthly Summary Email Cron
- [ ] 9.2 Email Retry Cron
- [ ] 9.3 Email Log API
- [ ] 9.4 Terms & Privacy API
- [ ] 9.5 Backup Service
- [ ] 9.6 All Crons Registration

## Phase 10: Backdate Management
- [ ] 10.1 Backdate Revenue Entry API
- [ ] 10.2 Backdate Approval & Execution
- [ ] 10.3 Backdate Capital Entry API
- [ ] 10.4 Backdate New Investor API
- [ ] 10.5 Backdate History API

## Phase 11: Admin User Management
- [ ] 11.1 Investor Management API
- [ ] 11.2 Profile Update Approvals API
- [ ] 11.3 KYC Management API

## Phase 12: Admin Finance
- [ ] 12.1 Capital Dashboard API
- [ ] 12.2 Revenue Dashboard API
- [ ] 12.3 Reports Generation API
- [ ] 12.4 System Settings API
- [ ] 12.5 Audit & Cron Log APIs
- [ ] 12.6 Investor Profile Self API

## Phase 15: Frontend Foundation
- [ ] 15.1 API Service Layer
- [ ] 15.2 UI Components Library
- [ ] 15.3 Form Components
- [ ] 15.4 Transaction Display Components
- [ ] 15.5 Chart Components
- [ ] 15.6 Splash Screen

## Phase 16: Auth Screens
- [ ] 16.1 Homepage Screen
- [ ] 16.2 Registration Screen
- [ ] 16.3 Login Screen & OTP
- [ ] 16.4 Auth Store & Token Management
- [ ] 16.5 Terms & Privacy Screens

## Phase 17: Partner Dashboard
- [ ] 17.1 Dashboard Screen
- [ ] 17.2 Notification Bell
- [ ] 17.3 Dark Mode Toggle

## Phase 18: Revenue Screen
- [ ] 18.1 Revenue Screen
- [ ] 18.2 Transaction Detail

## Phase 19: Fund Screen
- [ ] 19.1 Fund Screen Main
- [ ] 19.2 Add Capital Form
- [ ] 19.3 Withdraw Form
- [ ] 19.4 Capital Transaction Detail
- [ ] 19.5 Withdrawal History

## Phase 20: Profile Screen
- [ ] 20.1 Profile Screen Main
- [ ] 20.2 Profile Edit Forms
- [ ] 20.3 KYC Document Upload
- [ ] 20.4 Update Request History
- [ ] 20.5 Account Settings

## Phase 21: Support Screen
- [ ] 21.1 Support Screen & List
- [ ] 21.2 Raise Ticket Form
- [ ] 21.3 Ticket Detail & Conversation
- [ ] 21.4 Attachment Viewer

## Phase 22: Admin Panel
- [ ] 22.1 Admin Layout & Navigation
- [ ] 22.2 Admin Dashboard Screen
- [ ] 22.3 User Management Screen
- [ ] 22.4 Capital Management Screen
- [ ] 22.5 Revenue Management Screen
- [ ] 22.6 Backdate Management Screen
- [ ] 22.7 Support Management Screen
- [ ] 22.8 Reports, Logs & Settings

## Phase 23: Notifications
- [ ] 23.1 Admin Notification Center

## Phase 25: Animations
- [ ] 25.1 Page Transitions
- [ ] 25.2 Micro-Animations
- [ ] 25.3 Offline State
- [ ] 25.4 Final UI Polish

## Phase 26: Security
- [ ] 26.1 API Security Audit
- [ ] 26.2 Concurrent Operation Safety
- [ ] 26.3 Data Privacy Hardening
- [ ] 26.4 Rate Limiting Final Check

## Phase 27: Deployment
- [ ] 27.1 Server Configuration Scripts
- [ ] 27.2 Build Configuration
- [ ] 27.3 Google Drive Backup
- [ ] 27.4 Cloudflare Configuration
- [ ] 27.5 Mobile App Build

## Phase 28: Testing
- [ ] 28.1 Backend API Tests
- [ ] 28.2 End-to-End Verification
- [ ] 28.3 Performance Check
- [ ] 28.4 Final Bug Fix

---

**TOTAL TASKS: 107**
**Estimated Time: 15-20 minutes per task in Cursor**
**Estimated Total: ~30-35 hours of Cursor work**

---

*End of PROJECT_PHASES.md*
*Use this file as the master task tracker.*
*Complete each task fully before moving to the next.*
*Never skip a task or combine two tasks into one Cursor prompt.*
