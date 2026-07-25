# PROJECT_INSTRUCTIONS.md
# Tikhat Partner App — Cursor Coding Instructions & Rules
# Version: 1.0
# CURSOR MUST READ THIS FILE BEFORE WRITING ANY CODE.
# These rules are non-negotiable. Never violate them.

---

## SECTION 1: GOLDEN RULES (Never Break These)

1. **Never modify files that are not listed in the current prompt's "Files to Modify" section.**
2. **Never simplify a requirement.** If something seems complex, implement it fully.
3. **Never skip acceptance criteria.** Every item must be implemented.
4. **Never use placeholder code like `// TODO` or `// implement later`.** Every function must be complete.
5. **Never hardcode sensitive values.** All secrets go in `.env` file.
6. **Never mix frontend and backend logic.** Keep them strictly separated.
7. **Never create a new file if it already exists.** Modify the existing one.
8. **Never delete existing working code** unless the prompt explicitly says to.
9. **Always refer to PROJECT_KNOWLEDGE.md** before implementing any business logic.
10. **One prompt = one responsibility.** Do not implement extra features not asked for.

---

## SECTION 2: TECHNOLOGY STACK

### 2.1 Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| React Native | Latest Stable | Mobile + Web from single codebase |
| Expo | SDK 51+ | Framework for React Native |
| Expo Router | v3+ | File-based navigation |
| React Query (TanStack) | v5 | Data fetching, caching, sync |
| Zustand | Latest | Global state management |
| React Native Reanimated | v3 | Animations and transitions |
| React Native Gesture Handler | Latest | Touch gestures |
| Axios | Latest | HTTP client |
| React Native Paper | Latest | UI component base |
| Victory Native | Latest | Charts and graphs |
| Expo SecureStore | Latest | Secure token storage (mobile) |
| AsyncStorage | Latest | Non-sensitive local storage |
| React Hook Form | Latest | Form management |
| Zod | Latest | Form validation schemas |
| date-fns | Latest | Date formatting and calculations |
| React Native Safe Area Context | Latest | Safe area handling |
| Expo Image Picker | Latest | Profile photo + document upload |
| Expo Document Picker | Latest | PDF upload support |
| React Native Toast Message | Latest | Toast notifications |

### 2.2 Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20 LTS | Runtime |
| Express.js | v4 | Web framework |
| PostgreSQL | 16 | Primary database |
| node-postgres (pg) | Latest | PostgreSQL client |
| node-cron | Latest | Scheduled jobs |
| JSON Web Token (jsonwebtoken) | Latest | Authentication |
| bcryptjs | Latest | Password hashing |
| Multer | Latest | File upload handling |
| Sharp | Latest | Image compression |
| Resend | Latest | Email service |
| React Email | Latest | Email templates |
| googleapis | Latest | Google Drive backup |
| Helmet | Latest | HTTP security headers |
| express-rate-limit | Latest | Rate limiting |
| cors | Latest | CORS configuration |
| dotenv | Latest | Environment variables |
| express-validator | Latest | Input validation |
| winston | Latest | Logging |
| node-schedule | Latest | Advanced scheduling |
| archiver | Latest | Backup compression |

### 2.3 DevOps & Infrastructure
| Technology | Purpose |
|-----------|---------|
| PM2 | Process manager (auto-restart) |
| Nginx | Reverse proxy + static file serving |
| Ubuntu 24.04 | Server OS |
| Cloudflare | SSL + DNS |
| pg_dump | PostgreSQL backup |
| Google Drive API | Backup storage |

---

## SECTION 3: PROJECT FOLDER STRUCTURE

```
tikhat-partner-app/
│
├── frontend/                          # React Native Expo App
│   ├── app/                           # Expo Router pages
│   │   ├── (auth)/                    # Public routes (login, register)
│   │   │   ├── index.tsx              # Homepage / Landing
│   │   │   ├── login.tsx              # Login page
│   │   │   ├── register.tsx           # Registration page
│   │   │   └── forgot-password.tsx    # Forgot password
│   │   ├── (partner)/                 # Investor routes (protected)
│   │   │   ├── _layout.tsx            # Bottom tab layout
│   │   │   ├── dashboard.tsx          # Dashboard
│   │   │   ├── revenue.tsx            # Revenue page
│   │   │   ├── fund.tsx               # Fund page
│   │   │   ├── profile.tsx            # Profile page
│   │   │   └── support.tsx            # Support page
│   │   ├── (admin)/                   # Admin routes (protected)
│   │   │   ├── _layout.tsx            # Admin layout
│   │   │   ├── dashboard.tsx          # Admin dashboard
│   │   │   ├── users/                 # User management
│   │   │   ├── capital/               # Capital management
│   │   │   ├── revenue/               # Revenue management
│   │   │   ├── backdate/              # Backdate management
│   │   │   ├── support/               # Support management
│   │   │   ├── notifications/         # Notification center
│   │   │   ├── reports/               # Reports & export
│   │   │   ├── logs/                  # Activity + cron logs
│   │   │   └── settings/              # System settings
│   │   └── _layout.tsx                # Root layout
│   ├── components/                    # Reusable components
│   │   ├── ui/                        # Base UI components
│   │   ├── cards/                     # Dashboard cards
│   │   ├── forms/                     # Form components
│   │   ├── charts/                    # Chart components
│   │   ├── modals/                    # Modal components
│   │   └── common/                    # Shared components
│   ├── hooks/                         # Custom React hooks
│   ├── services/                      # API service layer
│   ├── store/                         # Zustand stores
│   ├── utils/                         # Helper functions
│   ├── constants/                     # App constants
│   ├── types/                         # TypeScript types
│   ├── assets/                        # Images, fonts, icons
│   └── theme/                         # Theme configuration
│
├── backend/                           # Node.js + Express API
│   ├── src/
│   │   ├── controllers/               # Route handlers
│   │   │   ├── auth.controller.js
│   │   │   ├── investor.controller.js
│   │   │   ├── capital.controller.js
│   │   │   ├── revenue.controller.js
│   │   │   ├── withdrawal.controller.js
│   │   │   ├── support.controller.js
│   │   │   ├── admin.controller.js
│   │   │   ├── backdate.controller.js
│   │   │   ├── notification.controller.js
│   │   │   ├── report.controller.js
│   │   │   └── settings.controller.js
│   │   ├── routes/                    # Express routes
│   │   │   ├── auth.routes.js
│   │   │   ├── investor.routes.js
│   │   │   ├── capital.routes.js
│   │   │   ├── revenue.routes.js
│   │   │   ├── withdrawal.routes.js
│   │   │   ├── support.routes.js
│   │   │   ├── admin.routes.js
│   │   │   ├── backdate.routes.js
│   │   │   ├── notification.routes.js
│   │   │   ├── report.routes.js
│   │   │   └── settings.routes.js
│   │   ├── middleware/                # Express middleware
│   │   │   ├── auth.middleware.js     # JWT verification
│   │   │   ├── role.middleware.js     # Role-based access
│   │   │   ├── rateLimit.middleware.js
│   │   │   ├── upload.middleware.js   # Multer config
│   │   │   ├── validate.middleware.js # Input validation
│   │   │   └── concurrent.middleware.js # Concurrent edit detection
│   │   ├── services/                  # Business logic layer
│   │   │   ├── roi.service.js         # ROI calculation engine
│   │   │   ├── revenue.service.js     # Revenue distribution
│   │   │   ├── email.service.js       # Resend integration
│   │   │   ├── backup.service.js      # Backup logic
│   │   │   ├── gdrive.service.js      # Google Drive upload
│   │   │   ├── transaction.service.js # Transaction ID generation
│   │   │   ├── notification.service.js
│   │   │   └── report.service.js      # PDF/Excel generation
│   │   ├── crons/                     # Scheduled jobs
│   │   │   ├── revenue.cron.js        # Daily revenue credit
│   │   │   ├── backup.cron.js         # Daily backup
│   │   │   ├── unlock.cron.js         # Account unlock at 12 AM
│   │   │   ├── summary.cron.js        # Monthly summary email
│   │   │   ├── escalation.cron.js     # Ticket escalation check
│   │   │   ├── roiAlert.cron.js       # ROI term expiry alert
│   │   │   └── withdrawal.cron.js     # Pending withdrawal reminder
│   │   ├── models/                    # Database query models
│   │   │   ├── user.model.js
│   │   │   ├── capital.model.js
│   │   │   ├── revenue.model.js
│   │   │   ├── transaction.model.js
│   │   │   ├── support.model.js
│   │   │   ├── notification.model.js
│   │   │   └── settings.model.js
│   │   ├── db/                        # Database connection
│   │   │   ├── connection.js          # PostgreSQL pool
│   │   │   └── index.js
│   │   ├── utils/                     # Utility functions
│   │   │   ├── logger.js              # Winston logger
│   │   │   ├── formatCurrency.js      # ₹ Indian format
│   │   │   ├── formatDate.js          # DD MMM YYYY format
│   │   │   ├── generateTxnId.js       # Transaction ID generator
│   │   │   └── indianNumber.js        # Number formatting
│   │   └── app.js                     # Express app setup
│   ├── migrations/                    # Database migrations
│   ├── seeds/                         # Initial data seeds
│   ├── uploads/                       # Uploaded files storage
│   ├── backups/                       # Local backup storage
│   ├── logs/                          # Application logs
│   ├── emails/                        # React Email templates
│   │   ├── approval.email.jsx
│   │   ├── rejection.email.jsx
│   │   ├── revenue-credit.email.jsx
│   │   ├── withdrawal.email.jsx
│   │   ├── support.email.jsx
│   │   ├── monthly-summary.email.jsx
│   │   └── base.email.jsx             # Base template with logo
│   ├── server.js                      # Entry point
│   └── .env                           # Environment variables
│
├── database/
│   ├── schema.sql                     # Complete database schema
│   └── migrations/                    # Version-controlled migrations
│
├── nginx/
│   └── tikhat.conf                    # Nginx configuration
│
├── scripts/
│   ├── deploy.sh                      # Deployment script
│   └── restore.sh                     # Backup restore script
│
└── README.md                          # Setup instructions
```

---

## SECTION 4: DATABASE RULES

### 4.1 General Rules
- Use PostgreSQL 16 only
- All tables must have: `id` (UUID), `created_at` (TIMESTAMP), `updated_at` (TIMESTAMP)
- Always use parameterized queries — never string concatenation in SQL
- Use database transactions for multi-step financial operations
- All financial amounts stored as INTEGER (paise/cents) to avoid floating point — display divided by 100
- **EXCEPTION**: Since we use whole numbers only, store as INTEGER representing rupees directly
- All timestamps stored in UTC, converted to IST for display
- Use database-level constraints: NOT NULL, UNIQUE, CHECK, FOREIGN KEY
- Create indexes on: user_id, transaction_id, status, created_at for all major tables
- Never delete financial records — use soft delete (is_deleted flag)

### 4.2 Migration Rules
- Every schema change must have a migration file
- Migration files named: `001_create_users.sql`, `002_create_capital.sql` etc.
- Never modify existing migration files — create new ones
- Test migrations on development before production

### 4.3 Connection Rules
- Use connection pooling (pg Pool)
- Max pool size: 20 connections
- Connection timeout: 30 seconds
- Always release connections after use

---

## SECTION 5: API RULES

### 5.1 Route Naming Convention
```
GET    /api/v1/[resource]          # List
GET    /api/v1/[resource]/:id      # Single item
POST   /api/v1/[resource]          # Create
PUT    /api/v1/[resource]/:id      # Full update
PATCH  /api/v1/[resource]/:id      # Partial update
DELETE /api/v1/[resource]/:id      # Delete
```

### 5.2 Response Format (Always follow this)
```javascript
// Success Response
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "meta": {           // For paginated responses
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}

// Error Response
{
  "success": false,
  "message": "Error description",
  "error": "ERROR_CODE",
  "details": { ... }  // Optional: validation errors
}
```

### 5.3 HTTP Status Codes
| Situation | Code |
|-----------|------|
| Success | 200 |
| Created | 201 |
| Bad Request / Validation Error | 400 |
| Unauthorized | 401 |
| Forbidden (wrong role) | 403 |
| Not Found | 404 |
| Conflict (duplicate) | 409 |
| Rate Limited | 429 |
| Server Error | 500 |

### 5.4 Authentication Headers
```
Authorization: Bearer <access_token>
```

### 5.5 Pagination
- Default: 20 items per page (web)
- Mobile: infinite scroll via cursor-based pagination
- Query params: `?page=1&limit=20` (web) or `?cursor=<last_id>&limit=20` (mobile)

---

## SECTION 6: AUTHENTICATION & SECURITY RULES

### 6.1 JWT Rules
- Access token expiry: 7 days
- Refresh token expiry: 30 days
- Store access token in: SecureStore (mobile), httpOnly cookie (web)
- Never store tokens in localStorage
- Token payload: `{ userId, role, sessionId, iat, exp }`
- Track active sessions in database (1 mobile + 1 web per user)

### 6.2 OTP Rules
- OTP: 6-digit numeric
- OTP expiry: 10 minutes
- OTP stored as bcrypt hash in database
- Max OTP requests: 3 per 15 minutes (rate limited)
- OTP verified → immediately invalidated (one-time use)

### 6.3 Password Rules
- Minimum 8 characters
- Must contain: uppercase, lowercase, number
- Stored as bcrypt hash (salt rounds: 12)
- Never logged, never returned in API responses

### 6.4 Rate Limiting Rules
```javascript
// Login endpoint
windowMs: 15 minutes
max: 10 attempts

// OTP request endpoint
windowMs: 15 minutes
max: 3 attempts

// Registration endpoint
windowMs: 1 hour
max: 5 attempts

// General API
windowMs: 15 minutes
max: 100 requests
```

### 6.5 Input Sanitization
- Sanitize ALL inputs server-side using express-validator
- Strip HTML tags from text inputs
- Validate file types by MIME type + extension (not just extension)
- Validate file size server-side (max 5MB)
- Never trust client-side validation alone

### 6.6 Security Headers (Helmet.js)
```javascript
helmet({
  contentSecurityPolicy: true,
  crossOriginEmbedderPolicy: true,
  hsts: true,
  noSniff: true,
  xssFilter: true
})
```

### 6.7 CORS Rules
```javascript
cors({
  origin: ['https://tikhatpartner.online', 'https://www.tikhatpartner.online'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
})
```

### 6.8 File Upload Security
- Check MIME type server-side (not just extension)
- Rename files on upload (never use original filename)
- Store outside web root
- Scan for malicious content
- Never execute uploaded files

---

## SECTION 7: FRONTEND CODING RULES

### 7.1 General Rules
- Use TypeScript for ALL frontend files (.tsx, .ts)
- No `any` type — always define proper types
- All components must be functional (no class components)
- Use named exports for components
- One component per file
- Component file names: PascalCase (e.g., `DashboardCard.tsx`)
- Hook file names: camelCase starting with `use` (e.g., `useCapital.ts`)
- Utility file names: camelCase (e.g., `formatCurrency.ts`)

### 7.2 State Management Rules
- Server state: React Query (TanStack Query)
- Global UI state: Zustand
- Form state: React Hook Form
- Local component state: useState
- Never use Redux
- Never use Context API for server data

### 7.3 API Calls
- All API calls go through `/services/` layer
- Never call API directly from components
- Always handle loading, error, and success states
- Use React Query's `useQuery` for GET, `useMutation` for POST/PUT/DELETE
- Always show loading skeleton while data loads

### 7.4 Navigation Rules
- Use Expo Router file-based routing
- Protected routes check auth token before rendering
- Unauthorized access → redirect to login
- Role check: investor routes redirect admin to admin panel and vice versa

### 7.5 Form Rules
- Use React Hook Form + Zod validation
- Show validation errors inline below each field
- Disable submit button while submitting
- Show loading spinner on submit button while processing
- Never allow double submit

### 7.6 Animation Rules
- Use React Native Reanimated v3 for all animations
- Page transitions: smooth slide animation
- Card animations: fade + scale on mount
- Skeleton loaders: shimmer effect (like Groww)
- Button press: scale down animation
- Modal: slide up from bottom (mobile style)
- Never use setTimeout for animations
- Keep animations under 300ms for snappiness

### 7.7 Responsive Rules
- Mobile first — design for 375px width minimum
- Use percentage widths or flex, never fixed pixel widths
- Bottom navigation: always visible on mobile
- Web: same mobile layout centered with max-width 480px
- Tablet: same as mobile layout
- Safe area: always use SafeAreaView or useSafeAreaInsets

### 7.8 Theme Rules
```typescript
// Color Palette — NEVER use hardcoded colors in components
const theme = {
  colors: {
    primary: '#0A1628',        // Dark Blue
    secondary: '#C9A84C',      // Golden
    background: '#FFFFFF',     // White
    surface: '#F8F9FA',        // Light grey surface
    card: '#FFFFFF',           // Card background
    text: {
      primary: '#0A1628',      // Dark blue text
      secondary: '#6B7280',    // Grey text
      inverse: '#FFFFFF',      // White text on dark bg
      golden: '#C9A84C',       // Golden text
    },
    border: '#E5E7EB',         // Light border
    error: '#EF4444',          // Red for errors
    success: '#10B981',        // Green for success
    warning: '#F59E0B',        // Amber for warnings
    pending: '#F59E0B',        // Amber for pending status
    approved: '#10B981',       // Green for approved
    rejected: '#EF4444',       // Red for rejected
    darkMode: {
      background: '#0A1628',
      surface: '#1E2D45',
      card: '#1E2D45',
      text: '#FFFFFF',
      border: '#2D3F5C',
    }
  },
  fonts: {
    regular: 'Inter-Regular',
    medium: 'Inter-Medium',
    semiBold: 'Inter-SemiBold',
    bold: 'Inter-Bold',
  },
  spacing: {
    xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48
  },
  borderRadius: {
    sm: 8, md: 12, lg: 16, xl: 24, full: 9999
  }
}
```

### 7.9 Currency Display Rules
```typescript
// Always use this function for displaying amounts
formatIndianCurrency(amount: number): string {
  // Returns: ₹1,00,000
  // Never: ₹100000 or Rs.1,00,000
}
```

### 7.10 Date Display Rules
```typescript
// Always use this function for displaying dates
formatDate(date: Date | string): string {
  // Returns: 15 Jul 2024
  // Never: 15/07/2024 or 2024-07-15
}

// For time display
formatTime(date: Date | string): string {
  // Returns: 6:00 PM IST
}
```

### 7.11 Loading States
- Every data-fetching screen must show skeleton loader
- Skeleton must match the shape of the actual content
- Never show blank screen while loading
- Error state must show retry button

### 7.12 Empty States
- Every list must have an empty state illustration + message
- Example: "No transactions yet" with an icon

---

## SECTION 8: BACKEND CODING RULES

### 8.1 General Rules
- Use JavaScript (not TypeScript) for backend
- Use ES Modules (import/export) — not CommonJS require
- Always use async/await (never .then().catch())
- Always wrap async route handlers in try/catch
- Never return stack traces to client in production
- Log all errors with winston

### 8.2 Controller Rules
```javascript
// Every controller function must follow this pattern:
export const functionName = async (req, res) => {
  try {
    // 1. Extract and validate inputs
    // 2. Call service layer
    // 3. Return formatted response
    return res.status(200).json({
      success: true,
      message: 'Success message',
      data: result
    });
  } catch (error) {
    logger.error(`[ControllerName] functionName error: ${error.message}`, { error });
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'INTERNAL_ERROR'
    });
  }
};
```

### 8.3 Service Layer Rules
- All business logic in services, never in controllers
- Services return data or throw errors
- Controllers only handle HTTP — services handle business logic
- ROI calculations ONLY in roi.service.js
- Email sending ONLY through email.service.js
- Transaction ID generation ONLY through transaction.service.js

### 8.4 Financial Calculation Rules
```javascript
// ROI Calculation — MUST follow exactly
// Monthly amount = Math.round(capital * roiPercent / 100)
// Daily average = Math.round(monthlyAmount / daysInMonth)
// Daily min = Math.round(dailyAverage * 0.9)
// Daily max = Math.round(dailyAverage * 1.1)
// Random daily = random integer between min and max
// Last day = monthlyTotal - sum of all previous days

// NEVER use floating point for financial calculations
// ALWAYS use Math.round() for final amounts
// ALWAYS verify: sum of all days <= monthly ROI total
```

### 8.5 Transaction Integrity Rules
```javascript
// Any operation that touches multiple tables MUST use a transaction:
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... multiple operations
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

### 8.6 Logging Rules
```javascript
// Use winston logger — never use console.log in production code
// Log levels:
logger.error()   // Errors that need immediate attention
logger.warn()    // Warnings (rate limit hits, suspicious activity)
logger.info()    // Important business events (transaction created, approved)
logger.debug()   // Development debugging only

// Every log must include context:
logger.info('Capital request approved', {
  transactionId: 'TKT-CAP-DEP-2024-00001',
  investorId: 'uuid',
  adminId: 'uuid',
  amount: 50000,
  timestamp: new Date().toISOString()
});
```

### 8.7 Environment Variables
```
# Backend .env — NEVER commit this file
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://user:pass@localhost:5432/tikhat_partner
JWT_SECRET=<strong-random-string>
JWT_REFRESH_SECRET=<strong-random-string>
RESEND_API_KEY=<resend-api-key>
GOOGLE_DRIVE_CLIENT_ID=<client-id>
GOOGLE_DRIVE_CLIENT_SECRET=<client-secret>
GOOGLE_DRIVE_REFRESH_TOKEN=<refresh-token>
GOOGLE_DRIVE_FOLDER_ID=<folder-id>
BACKUP_ENCRYPTION_KEY=<encryption-key>
FRONTEND_URL=https://tikhatpartner.online
UPLOAD_PATH=./uploads
BACKUP_PATH=./backups
LOG_PATH=./logs
```

---

## SECTION 9: CRON JOB RULES

### 9.1 Cron Job Structure
```javascript
// Every cron job must follow this pattern:
import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { pool } from '../db/connection.js';

export const jobName = cron.schedule('0 18 * * *', async () => {
  const logEntry = {
    jobName: 'revenue_credit',
    startTime: new Date(),
    status: 'running',
    processedCount: 0,
    failedCount: 0,
    totalAmount: 0,
    errors: []
  };

  try {
    // Insert log entry at start
    const logId = await insertCronLog(logEntry);
    
    // Execute job logic
    // ...
    
    // Update log on success
    await updateCronLog(logId, { status: 'success', ...logEntry });
    logger.info(`[Cron] ${logEntry.jobName} completed`, logEntry);
    
  } catch (error) {
    await updateCronLog(logId, { status: 'failed', error: error.message });
    logger.error(`[Cron] ${logEntry.jobName} failed`, { error });
    await sendAdminAlert(`Cron job failed: ${logEntry.jobName}`, error.message);
  }
}, {
  timezone: 'Asia/Kolkata'  // Always specify IST
});
```

### 9.2 Revenue Credit Cron Rules
- Run at admin-set time (read from settings table, not hardcoded)
- Process investors one by one in a loop
- Each investor in own try/catch (one failure doesn't stop others)
- Failed investor → retry once after 5 minutes
- If retry fails → log + admin alert
- Paused investors → skip entirely
- Deleted/inactive investors → skip
- Log: investor count, total amount, any failures

### 9.3 Idempotency Rules
- Revenue credit: check if already credited today before inserting
- Backup: check if backup already exists for today before running
- Monthly email: check if already sent this month before sending

---

## SECTION 10: EMAIL RULES

### 10.1 Email Template Rules
- All email templates built with React Email
- Base template with: Tikhat Partner logo, company name, footer
- Professional design — not plain text
- Mobile responsive email templates
- All amounts formatted as ₹ Indian format
- All dates formatted as DD MMM YYYY
- Include Transaction ID in all financial emails
- Include support contact in all emails

### 10.2 Email Service Rules
```javascript
// email.service.js — all emails go through this
// Never call Resend directly from controllers or crons
// Queue emails — don't await in main flow if not critical
// Retry failed emails 3 times with 5-minute intervals
// Log all email attempts (sent/failed) in email_logs table
// On 3 failed attempts → alert admin
```

### 10.3 Email Queue Priority
```
Priority 1 (Send immediately): OTP emails
Priority 2 (Send immediately): Approval/Rejection emails
Priority 3 (Queue): Transaction notification emails
Priority 4 (Queue): Daily revenue credit emails
Priority 5 (Batch): Monthly summary emails
```

---

## SECTION 11: FILE UPLOAD RULES

### 11.1 Upload Configuration
```javascript
// Multer config
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    // Never use original filename
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('FILE_TYPE_NOT_ALLOWED'), false);
  }
};

const limits = { fileSize: 5 * 1024 * 1024 }; // 5MB
```

### 11.2 File Storage Structure
```
/uploads/
  /kyc/
    /pan/
      /front/
      /back/
    /aadhar/
      /front/
      /back/
  /profile-photos/
  /payment-screenshots/
  /support-attachments/
```

### 11.3 File Access Rules
- Files never accessible directly via URL
- Always served through authenticated API endpoint
- Admin download: `/api/v1/files/:fileId/download` (authenticated)
- Investor can only download own files

---

## SECTION 12: UI/UX RULES

### 12.1 Design Principles
- Clean and minimal — like Groww
- White background, Dark Blue accents, Golden highlights
- Cards with subtle shadow (not heavy borders)
- Consistent 16px padding inside cards
- Consistent spacing between elements
- Professional typography — Inter font family

### 12.2 Transaction Status Colors
```
Pending / Submitted / Under Review → Amber (#F59E0B)
Approved / Active / Verified       → Green (#10B981)
Rejected / Failed / Locked         → Red (#EF4444)
Completed / Processed              → Blue (#3B82F6)
Cancelled                          → Grey (#6B7280)
```

### 12.3 Card Design Standard
```
- Background: White (#FFFFFF)
- Border radius: 16px
- Shadow: 0 2px 8px rgba(0,0,0,0.08)
- Padding: 16px
- Title: Dark Blue, 14px, SemiBold
- Amount: Dark Blue, 24px, Bold
- Subtitle: Grey, 12px, Regular
- Golden accent line at top: 3px height (for featured cards)
```

### 12.4 Button Design Standard
```
Primary Button:
- Background: Dark Blue (#0A1628)
- Text: White, 15px, SemiBold
- Border radius: 12px
- Height: 52px
- Active: scale(0.97) animation

Secondary Button:
- Background: Transparent
- Border: 1.5px Dark Blue
- Text: Dark Blue
- Same sizing as primary

Golden Button (for key CTAs):
- Background: Golden (#C9A84C)
- Text: Dark Blue
- Same sizing
```

### 12.5 Form Design Standard
```
- Label: Dark Blue, 13px, Medium, above input
- Input: White bg, 1px border (#E5E7EB), 12px radius, 48px height
- Focus: Dark Blue border (2px)
- Error: Red border + red error text below (12px)
- Placeholder: Grey (#9CA3AF)
```

### 12.6 Bottom Navigation Standard
```
- 5 tabs for investor: Dashboard, Revenue, Fund, Profile, Support
- Icons + Labels
- Active: Dark Blue icon + Golden underline indicator
- Inactive: Grey icon
- Height: 64px + safe area
```

### 12.7 Loading Skeleton Standard
```
- Background: #F3F4F6
- Shimmer: animated gradient from #F3F4F6 to #E5E7EB
- Match exact shape of content (same height, width, radius)
- Duration: 1.2s loop
```

### 12.8 Toast/Alert Messages
```
Success: Green background, white text, checkmark icon
Error: Red background, white text, X icon
Warning: Amber background, dark text, warning icon
Info: Dark Blue background, white text, info icon
Duration: 3 seconds auto-dismiss
Position: Top of screen (below status bar)
```

### 12.9 Empty State Design
```
- Centered illustration (SVG icon)
- Title: "No [items] yet"
- Subtitle: Brief description
- CTA button (if applicable)
```

### 12.10 Pull to Refresh
- All list screens must support pull-to-refresh
- Use React Query's refetch on pull

---

## SECTION 13: PERFORMANCE RULES

### 13.1 Frontend Performance
- Lazy load all screens (Expo Router does this automatically)
- Memoize expensive calculations with useMemo
- Memoize callbacks with useCallback
- Use React.memo for pure components
- Virtualize long lists (FlashList, not FlatList)
- Compress images before upload (Sharp / Expo ImageManipulator)
- Cache API responses with React Query (staleTime: 5 minutes)

### 13.2 Backend Performance
- Database connection pooling (max 20 connections)
- Index all frequently queried columns
- Use SELECT only needed columns (never SELECT *)
- Paginate all list queries
- Cache settings in memory (not re-fetched every request)
- Revenue calculation: pre-calculate and store, don't recalculate on every request

### 13.3 Database Indexes (Must Have)
```sql
-- These indexes MUST be created:
CREATE INDEX idx_transactions_investor_id ON transactions(investor_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_revenue_investor_date ON revenue_credits(investor_id, credit_date);
CREATE INDEX idx_capital_investor_id ON capital_transactions(investor_id);
CREATE INDEX idx_support_tickets_investor ON support_tickets(investor_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
```

---

## SECTION 14: ERROR HANDLING RULES

### 14.1 Frontend Error Handling
- Every API call has error state
- Network errors: "Connection failed. Please check your internet."
- Server errors: "Something went wrong. Please try again."
- Validation errors: Show inline next to specific field
- 401 errors: Clear tokens + redirect to login
- 403 errors: Show "Access denied" message

### 14.2 Backend Error Codes
```javascript
// Standard error codes — use these in API responses
AUTH_INVALID_CREDENTIALS
AUTH_ACCOUNT_LOCKED
AUTH_OTP_EXPIRED
AUTH_OTP_INVALID
AUTH_UNAUTHORIZED
AUTH_FORBIDDEN
USER_NOT_FOUND
USER_EMAIL_EXISTS
USER_PAN_EXISTS
USER_AADHAR_EXISTS
USER_UTR_EXISTS
CAPITAL_BELOW_MINIMUM
CAPITAL_ABOVE_MAXIMUM
CAPITAL_LOCKED
WITHDRAWAL_BELOW_MINIMUM
WITHDRAWAL_INSUFFICIENT_BALANCE
WITHDRAWAL_FREQUENCY_EXCEEDED
FILE_TOO_LARGE
FILE_TYPE_NOT_ALLOWED
RATE_LIMIT_EXCEEDED
INTERNAL_ERROR
```

---

## SECTION 15: TESTING RULES (For Every Prompt)

### 15.1 What to Test After Every Implementation
- [ ] API endpoint returns correct response format
- [ ] Authentication middleware blocks unauthorized requests
- [ ] Role middleware blocks wrong-role requests
- [ ] Input validation rejects invalid data
- [ ] Happy path works correctly
- [ ] Error cases return correct error codes
- [ ] Database transactions rollback on failure
- [ ] No console.log statements in production code
- [ ] No hardcoded values (use env variables or constants)
- [ ] Loading states display correctly
- [ ] Error states display correctly
- [ ] Mobile layout looks correct (375px width)

---

## SECTION 16: THINGS CURSOR MUST NEVER DO

1. ❌ Never use `console.log` in production code — use logger
2. ❌ Never hardcode API URLs — use environment variables
3. ❌ Never hardcode colors — use theme constants
4. ❌ Never skip input validation on backend
5. ❌ Never trust client-side validation alone
6. ❌ Never store sensitive data in localStorage
7. ❌ Never return passwords in API responses
8. ❌ Never use `SELECT *` in database queries
9. ❌ Never do financial calculations without Math.round()
10. ❌ Never modify files outside the current prompt scope
11. ❌ Never implement features not asked for in current prompt
12. ❌ Never use setTimeout as a hack for timing issues
13. ❌ Never commit .env files
14. ❌ Never use any type in TypeScript
15. ❌ Never use inline styles in React Native (use StyleSheet)
16. ❌ Never make direct DB calls from controllers (use models/services)
17. ❌ Never skip database transactions for multi-step operations
18. ❌ Never use floating point arithmetic for money
19. ❌ Never expose internal error details to client in production
20. ❌ Never skip the "Things Cursor must NOT modify" section of each prompt

---

## SECTION 17: DEPLOYMENT RULES

### 17.1 Server Setup Order
1. Install Node.js 20 LTS
2. Install PostgreSQL 16
3. Install Nginx
4. Install PM2 globally
5. Clone repository
6. Setup .env files
7. Run database migrations
8. Build frontend (expo export)
9. Configure Nginx
10. Start backend with PM2
11. Configure Cloudflare DNS
12. Verify SSL

### 17.2 PM2 Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'tikhat-backend',
    script: './backend/server.js',
    instances: 2,
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss IST'
  }]
};
```

### 17.3 Nginx Configuration Rules
- Frontend served as static files from `/var/www/tikhat/`
- API proxied to `localhost:5000`
- All HTTP redirected to HTTPS
- Gzip compression enabled
- Static file caching headers set

---

*End of PROJECT_INSTRUCTIONS.md*
*Cursor must read this file completely before starting any task.*
*These rules take precedence over Cursor's default behavior.*
*When in doubt, follow this file.*
