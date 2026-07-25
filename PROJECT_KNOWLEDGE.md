# PROJECT_KNOWLEDGE.md
# Tikhat Partner App — Complete Business Knowledge Document
# Version: 1.0 | Last Updated: 2025
# This file is the single source of truth for all business logic, rules, and workflows.
# Cursor must reference this file before implementing any feature.

---

## 1. PROJECT IDENTITY

| Field | Value |
|-------|-------|
| App Name | Tikhat Partner App |
| Company | Tikhat Foods |
| Domain | tikhatpartner.online |
| Theme Colors | White, Dark Blue, Golden |
| UI Reference | Groww App (clean, professional, trustworthy) |
| Primary Platform | Mobile |
| Secondary Platform | Web |
| Language | English only (no Hindi, no Hinglish anywhere) |
| Timezone | IST (Indian Standard Time) — all times, crons, displays |
| Currency | ₹ Indian format (₹1,00,000 not ₹100,000) |
| Date Format | DD MMM YYYY (e.g., 15 Jul 2024) |
| Decimal Places | Whole numbers only (no decimals in amounts) |
| Navigation Style | Bottom navigation bar (like Groww) |
| Investor Term | "Tikhat Partner" (never use "user" or "investor" in UI) |

---

## 2. USER ROLES & PERMISSIONS

### 2.1 Role Hierarchy
```
Super Admin (1)
    └── Admin (unlimited, created by Super Admin)
            └── Tikhat Partner / Investor (self-register, admin approved)
```

### 2.2 Super Admin Exclusive Permissions
- Create new admins
- Delete admins
- Suspend/unsuspend admins
- Change system-wide settings
- APPROVE backdate transactions (admins can POST, only Super Admin approves)
- Change global revenue credit time
- Resolve tickets older than 7 days
- Reset any admin's password

### 2.3 Admin Permissions (All admins except Super Admin exclusives)
- Create, modify, delete, pause investors
- Approve/reject all investor requests
- Manage capital transactions
- Manage revenue settings
- Post backdate transactions (Super Admin approves)
- Manage support tickets
- Send notifications to investors
- Export reports
- View all logs

### 2.4 Investor (Tikhat Partner) Permissions
- View own dashboard, revenue, fund, profile, support
- Submit capital add/withdraw requests
- Submit profile update requests
- Submit email/mobile change requests
- Raise support tickets
- Export own transaction history
- Cancel own pending withdrawal requests
- Self-deactivate account

---

## 3. AUTHENTICATION SYSTEM

### 3.1 Investor Login Flow
1. Enter Email + Password
2. If credentials valid → send OTP to email
3. Enter OTP → access granted
4. OTP expires in 10 minutes
5. Max 5 failed password attempts → account locked
6. Locked account auto-unlocks at 12:00 AM IST
7. Locked account can also be unlocked via Email OTP password reset
8. Admin can unlock manually from User Management

### 3.2 Admin Login Flow
1. Enter Email + Password
2. If credentials valid → send OTP to email
3. Enter OTP → access granted

### 3.3 Session Rules
- No session timeout
- Max sessions: 1 mobile app + 1 web browser simultaneously
- New login on same device type = previous session invalidated
- JWT access token + refresh token system

### 3.4 Password Rules
- Investor sets own password at registration
- Admin sets own password at account creation
- Admin can change own password from profile
- Super Admin can reset any admin password
- Investor resets via Email OTP

### 3.5 Security Rules
- 5 failed login attempts → account locked (shown in User Management with reason)
- Locked status visible in investor list row with reason
- Rate limiting on: login, OTP requests, registration
- Spam registration protection (CAPTCHA or similar)
- Duplicate email prevention (one account per email)
- Deleted investor email permanently blocked from re-registration
- Suspicious IP activity (multiple accounts from same IP) → admin alert
- All API routes secured, no unauthorized access loopholes
- HTTPS via Cloudflare SSL
- Input sanitization on all fields
- SQL injection prevention (parameterized queries)
- File upload validation (server-side type + size check)

---

## 4. INVESTOR ACCOUNT LIFECYCLE

### 4.1 Account Statuses
| Status | Login | Revenue Credit | Withdrawal Request | Description |
|--------|-------|---------------|-------------------|-------------|
| Pending | ❌ | ❌ | ❌ | Registered, awaiting admin approval |
| Active | ✅ | ✅ | ✅ | Fully operational |
| Paused | ✅ | ❌ | ✅ | Admin paused — login & withdrawal allowed, revenue stopped |
| Locked | ❌ | ✅ | ❌ | 5 failed login attempts |
| Self-Deactivated | ❌ | ❌ | ❌ | Investor closed own account |
| Deleted | ❌ | ❌ | ❌ | Admin deleted — data retained, email blocked |

### 4.2 Registration Flow
1. Investor visits app → clicks Register
2. Fills: Full Name, Email, Password, Mobile Number
3. Accepts Terms & Conditions + Privacy Policy (mandatory checkbox)
4. Submits registration
5. System sends confirmation email to investor
6. System sends new registration alert to admin
7. Admin reviews → Approves or Rejects
8. Investor receives approval email OR rejection email with reason
9. On approval → investor can login

### 4.3 Profile Completion
- After first login → red banner shown: "Please complete your profile"
- Banner shown on every login until investor dismisses it
- If investor dismisses banner → permanently hidden (even if profile incomplete)
- No functional restrictions for incomplete profile — only banner

### 4.4 Self-Deactivation
- Investor can request account deactivation from Profile page
- After deactivation: account inaccessible
- In admin User Management: investor marked as "Self-Deactivated"
- All data retained permanently

---

## 5. KYC & PROFILE MANAGEMENT

### 5.1 Profile Fields
| Field | Type | Notes |
|-------|------|-------|
| Profile Photo | Image upload | Optional |
| Full Name | Text | Min 3 chars, alphabets + spaces only |
| Date of Birth | Date | |
| Address | Text | |
| Mobile Number | 10-digit Indian (+91) | |
| Email Address | Email | Change via separate request form |
| PAN Number | Text + Front image + Back image | Locked after verification |
| Aadhar Number | Text + Front image + Back image | Locked after verification |
| Bank Account Details | Text | History retained on change |
| UPI ID | Text | |

### 5.2 File Upload Rules
- Max file size: 5MB per file
- Allowed formats: JPG, PNG, PDF
- Admin can download uploaded files directly
- Files stored on server in /uploads folder

### 5.3 KYC Workflow
1. Investor fills profile fields + uploads documents
2. Submits for admin review
3. Admin reviews field by field (not all-or-nothing)
4. Admin can approve individual fields OR reject with reason
5. Rejected fields: investor sees reason, can edit + resubmit
6. KYC Status per investor: Pending / Verified / Rejected

### 5.4 KYC Rules
- PAN Number: system checks for duplicates across all investors
- Aadhar Number: system checks for duplicates across all investors
- PAN + Aadhar fields LOCKED after admin marks as Verified
- After lock: only admin can change PAN/Aadhar (even the number itself)
- Admin sees full PAN and Aadhar numbers (not masked)
- Old bank details retained in database even after investor updates them

### 5.5 Profile Update Workflow
1. Investor edits any field → clicks Save
2. System shows: "Your details will be updated within 24-48 hours after admin approval. Thank you for your request."
3. Internal request created with status: Pending
4. Admin sees notification of pending profile update
5. Admin reviews → approves field by field OR rejects with reason
6. Investor notified of approval/rejection via email

### 5.6 Email/Mobile Change Request
- Separate request form on Profile page (edit button next to email/mobile)
- After submit: same 24-48 hr approval message
- Admin approves from User Management

### 5.7 Duplicate Detection
- System blocks if same PAN used by another investor
- System blocks if same Aadhar used by another investor
- System blocks if same Email used for registration
- System blocks if same UTR used in capital requests (globally)

---

## 6. CAPITAL MANAGEMENT

### 6.1 Capital Account Rules
| Rule | Value |
|------|-------|
| Minimum Deposit | ₹10,000 |
| Maximum Deposit | ₹10,00,000 |
| Minimum Withdrawal | ₹1,000 |
| UPI Transfer Limit | ₹1,00,000 (above this → bank transfer only) |
| Withdrawal Frequency | Set by admin per investor |
| Multiple Pending Deposits | Allowed simultaneously |
| Multiple Pending Withdrawals | Limited by frequency set by admin |

### 6.2 Capital Balance Display
```
Capital Balance
₹X,XX,XXX
                          [small font below: ₹X,XXX pending withdrawal]

Status: Available for Withdrawal / Locked for Withdrawal
```
- "Locked for Withdrawal" → shown when admin has locked this investor's capital
- If investor tries to submit capital withdrawal with locked status → warning shown

### 6.3 Capital Add Request Flow
| Step | Action |
|------|--------|
| 1 | Investor clicks "Add Capital" button on Fund page |
| 2 | Form opens: Amount, Date, UTR/Transaction No., Remark, Payment Screenshot |
| 3 | System checks: Amount ≥ ₹10,000, Amount ≤ ₹10,00,000 |
| 4 | System checks: UTR not already used by any investor |
| 5 | Submit → Transaction ID generated (TKT-CAP-DEP-YYYY-XXXXX) |
| 6 | Status: Submitted |
| 7 | Success message: "Your request has been received. Your account will be updated within 24-48 hours upon verification. Thank you for your request." |
| 8 | Admin notified |
| 9 | Admin reviews: Submitted → Under Review → Approved/Rejected |
| 10 | Admin can modify amount at approval (both original + approved amounts recorded) |
| 11 | On approval: capital credited to account, email sent to investor |
| 12 | On rejection: rejection reason emailed to investor |

### 6.4 Capital Withdrawal Request Flow
| Step | Action |
|------|--------|
| 1 | Investor clicks "Withdraw Capital" button on Fund page |
| 2 | System checks: capital not locked |
| 3 | System checks: withdrawal frequency not exceeded |
| 4 | Form opens: Amount, Account (Capital A/C / Revenue A/C), Transfer Mode (Bank/UPI) |
| 5 | If Amount > ₹1,00,000 → UPI option disabled, only Bank allowed |
| 6 | If balance insufficient → request blocked with message |
| 7 | Submit → Transaction ID generated (TKT-CAP-WDR-YYYY-XXXXX) |
| 8 | Amount immediately deducted from balance |
| 9 | "₹X,XXX pending withdrawal" shown below balance |
| 10 | Status: Submitted → Under Review → Approved → Processed → Completed |
| 11 | Admin approves → actual bank/UPI transfer done MANUALLY by admin outside app |
| 12 | Admin can optionally enter: payment date + UTR reference after transfer |
| 13 | Investor can cancel request if still in Submitted/Under Review status |
| 14 | On rejection: amount instantly restored, reason emailed |
| 15 | On capital lock after request submitted → request auto-cancelled |
| 16 | If pending > 48 hours → admin gets reminder notification |

### 6.5 Capital Status (Admin Sets Per Investor)
- **Available for Withdrawal**: investor can submit withdrawal requests normally
- **Locked for Withdrawal**: investor sees warning, cannot submit capital withdrawal

### 6.6 Admin Capital Powers
- Add/deduct capital directly (with remark + transaction details)
- Approve, reject, or delete capital requests
- Modify amount at approval time
- Set capital locked/available status
- Undo last action (reversible)
- Backdate capital entries
- Bulk approve withdrawal requests
- View all capital transactions per investor

---

## 7. REVENUE MANAGEMENT

### 7.1 ROI System
Every investor has:
1. **Default ROI** — always active unless term-based ROI is running
2. **Term-based ROI** — special rate for specific date range (start date + end date)

Rules:
- If a term is active for a date → term ROI used
- If no term active → default ROI used
- Gap between terms → default ROI fills the gap automatically
- No gap ever in ROI calculation

### 7.2 Revenue Calculation Formula

**Daily Average:**
```
Daily Average = (Capital Balance × Monthly ROI%) / Days in Month
```

**Daily Random Range:**
```
Minimum Daily = Daily Average × 90%
Maximum Daily = Daily Average × 110%
```

**Last Day of Month:**
```
Last Day Amount = Monthly ROI Total - Sum of all previous days credits
(Last day may be outside 90-110% range — this is acceptable)
```

**Pro-rated First Month:**
```
If investment starts on day X of a month with D days:
Remaining days = D - X
Pro-rated Amount = (Capital × ROI%) / D × Remaining days
```

**Example:**
- Capital: ₹10,000 | ROI: 30% monthly | Month: 30 days
- Monthly total: ₹3,000
- Daily average: ₹100
- Daily range: ₹90 to ₹110
- If invested on 15th: remaining = 16 days → pro-rated = ₹1,600
- Last day: ₹3,000 - sum of days 1-29

### 7.3 Capital Change Mid-Month
- If capital added on day X → new ROI calculated on new balance from day X+1
- If capital withdrawn on day Y → ROI calculated on reduced balance from day Y+1
- Each capital change creates a new calculation segment

### 7.4 Revenue Credit System
- **Global credit time**: set by admin (e.g., 6:00 PM IST) — same for all investors
- **Cron job** runs at set time daily
- **Skips**: paused investors, deleted investors, pending investors
- **If paused mid-cron**: that day's credit does NOT happen
- **Paused days**: revenue is lost — NOT redistributed to remaining days
- **Failure**: auto-retry → if still fails → admin alert email

### 7.5 Pause/Resume Rules
- Admin can pause/resume daily credit per investor
- When paused: cron skips this investor
- When resumed: credit restarts from next scheduled time
- Paused days count as zero revenue — not carried forward
- Example: Monthly total ₹3,000, paused 2 days → actual credit ~₹2,800

### 7.6 ROI Term Change Mid-Month
- New rate applies from new term start date
- Previous days use old rate
- No retroactive recalculation

### 7.7 Revenue Withdrawal
- Frequency set by admin per investor (same setting as capital)
- Minimum withdrawal: ₹1,000
- Revenue balance cannot go negative
- If balance insufficient → request blocked

### 7.8 Admin Revenue Powers
- Set default ROI per investor
- Set term-based ROI (start date, end date, rate)
- Manual add/deduct revenue for specific dates
- Edit or reverse specific revenue entries
- Pause/resume daily credit per investor
- Set global credit time (Super Admin only)
- Backdate revenue with custom ROI or default
- View all revenue transactions per investor

### 7.9 End of Month
- On last day: remaining monthly amount credited regardless of range
- New month starts fresh calculation
- Month change handled automatically by system

---

## 8. TRANSACTION ID FORMAT

| Transaction Type | Format | Example |
|-----------------|--------|---------|
| Capital Deposit | TKT-CAP-DEP-YYYY-XXXXX | TKT-CAP-DEP-2024-00001 |
| Capital Withdrawal | TKT-CAP-WDR-YYYY-XXXXX | TKT-CAP-WDR-2024-00001 |
| Revenue Credit | TKT-REV-CR-YYYY-XXXXX | TKT-REV-CR-2024-00001 |
| Revenue Withdrawal | TKT-REV-WDR-YYYY-XXXXX | TKT-REV-WDR-2024-00001 |
| Admin Manual Entry | TKT-ADM-YYYY-XXXXX | TKT-ADM-2024-00001 |
| Support Ticket | TKT-SUP-YYYY-XXXXX | TKT-SUP-2024-00001 |
| Profile Request | TKT-PRF-YYYY-XXXXX | TKT-PRF-2024-00001 |

Rules:
- XXXXX = 5-digit sequential number, resets every year (00001, 00002...)
- Every transaction gets an ID — approved, rejected, cancelled, pending
- Cancelled and rejected transactions permanently retained with their IDs
- Year in ID = year the transaction was created

---

## 9. BALANCE CALCULATIONS

### 9.1 Capital Balance
```
Capital Balance = Total Approved Deposits - Total Approved Capital Withdrawals
```

### 9.2 Revenue Balance
```
Revenue Balance = Total Revenue Credited - Total Revenue Withdrawn
```

### 9.3 Total Balance (Dashboard Card)
```
Total Balance = Capital Balance + Revenue Balance
```

### 9.4 Effective ROI
```
Effective ROI = (Total Revenue Earned ÷ Total Capital Invested) × 100
Displayed as: "15.00% effective ROI"
```

### 9.5 Pending Withdrawal Display
```
Below any balance card (small font):
"₹X,XXX pending withdrawal"
Shown only when there is an active pending withdrawal request
```

---

## 10. WITHDRAWAL REQUEST STATUS LIFECYCLE

```
Submitted → Under Review → Approved → Processed → Completed
                        ↘ Rejected
```

| Status | Description |
|--------|-------------|
| Submitted | Investor submitted request |
| Under Review | Admin is reviewing |
| Approved | Admin approved, amount deducted from balance |
| Processed | Admin has initiated bank/UPI transfer |
| Completed | Transfer confirmed, UTR entered by admin |
| Rejected | Admin rejected with reason, amount restored |
| Cancelled | Investor cancelled (only in Submitted/Under Review) |
| Auto-Cancelled | System cancelled due to capital lock |

---

## 11. SUPPORT TICKET SYSTEM

### 11.1 Ticket Categories
- Capital Related
- Revenue Related
- Withdrawal Related
- KYC/Profile Related
- Technical Issue
- Other

### 11.2 Ticket Lifecycle
```
Open → In Progress → Resolved → Closed
              ↑______________|  (investor can reopen)
```

### 11.3 Ticket Rules
- Ticket ID format: TKT-SUP-YYYY-XXXXX
- Multiple attachments per ticket (5MB each, JPG/PNG/PDF)
- Conversation thread between investor and admin
- Admin can assign ticket to another admin
- Investor can reopen a Resolved ticket
- 7+ days unresolved → auto-escalate to Super Admin (checked at 12 AM IST daily)
- Filter/sort in admin: by status, date, investor name, category

### 11.4 Ticket Email Triggers
- Investor raises ticket → email to investor (confirmation)
- Admin replies → email to investor
- Ticket closed → email to investor

---

## 12. EMAIL SYSTEM

### 12.1 Configuration
| Field | Value |
|-------|-------|
| Provider | Resend.com |
| Sender Name | Tikhat Partner |
| Sender Email | noreply@tikhatpartner.online |
| Logo | Tikhat Foods logo (added at deployment) |
| Language | English only |
| Unsubscribe | Not available |

### 12.2 Email Triggers — Investor Emails
| Trigger | Email Sent |
|---------|-----------|
| Registration submitted | Confirmation email |
| Registration approved | Approval email |
| Registration rejected | Rejection email with reason |
| Profile update approved | Approval email |
| Profile update rejected | Rejection email with reason + field name |
| Capital deposit approved | Credit confirmation with amount + Transaction ID |
| Capital deposit rejected | Rejection email with reason |
| Capital withdrawal approved | Approval email |
| Capital withdrawal processed | Processing email |
| Capital withdrawal completed | Completion email with UTR |
| Capital withdrawal rejected | Rejection email with reason + amount restored |
| Daily revenue credit | Daily credit email with amount + Transaction ID |
| Revenue withdrawal approved | Approval email |
| Revenue withdrawal completed | Completion email with UTR |
| Support ticket raised | Confirmation with Ticket ID |
| Admin replies to ticket | Reply notification |
| Ticket closed | Closure email |
| Monthly summary (1st of month) | Previous month's statement |

### 12.3 Email Triggers — Admin Emails
| Trigger | Email Sent |
|---------|-----------|
| New investor registration | Alert to all admins |
| New withdrawal request | Alert to admins |
| Withdrawal pending 48hrs | Reminder to admins |
| ROI term expiring tomorrow | Alert to admins |
| Backup failure | Alert to Super Admin |
| Email delivery failure | Alert to Super Admin |

### 12.4 Email Queue
- Emails queued and sent asynchronously
- Retry on delivery failure (3 attempts)
- Failure after 3 attempts → logged + admin alerted

### 12.5 Admin Custom Notifications
- Admin can draft and send custom notification to:
  - One specific investor
  - Selected investors (multi-select)
  - All investors
- Available from Notification Center in admin panel

### 12.6 Monthly Summary Email (Auto)
- Sent on 1st of every month at 12:00 AM IST
- Contains previous month's: revenue earned, capital balance, withdrawals
- If 1st is server down → sent next day (retry)

---

## 13. IN-APP NOTIFICATIONS

- Notification bell icon in app header
- Notifications for: request approvals, rejections, ticket replies
- Admin notification center: pending approvals, new tickets, new registrations
- Real-time activity feed in admin dashboard

---

## 14. BACKDATE MANAGEMENT

### 14.1 Who Can Use
- Any admin can POST backdate entries
- Super Admin must APPROVE before entries are committed

### 14.2 Backdate Revenue Entry
- Single day: Admin enters date + amount (or leaves blank for system calculation)
- Bulk period: Admin enters start date + end date + ROI rate (optional)
- If no ROI rate entered → system uses default ROI for that investor
- System distributes randomly within 90-110% daily range
- Last day gets remaining amount
- Email to investor: Admin chooses yes/no per backdate batch

### 14.3 Backdate Capital Entry
- Admin enters: amount, date, transaction details
- After approval: system auto-recalculates revenue from that capital date to present
- All recalculated revenue entries get Transaction IDs

### 14.4 Backdate New Investor
- Admin enters investor details + joining date (past date)
- After approval: system auto-generates revenue from joining date to present
- Investor's "Account Created" date shows the backdated joining date

### 14.5 Backdate Rules
- All backdate entries pending until Super Admin approves
- Email notification to investor: admin choice per batch
- System uses same random distribution algorithm as live revenue

---

## 15. ADMIN DASHBOARD

### 15.1 Stats Cards
- Total Tikhat Partners (active / paused / pending breakdown)
- Total Capital Under Management (₹)
- Total Revenue Credited Today (₹)
- Pending Approvals Count (capital + withdrawal + profile requests)
- Active Support Tickets Count
- Today's Revenue Schedule: "6:00 PM: X partners, ₹X,XX,XXX total"

### 15.2 Real-Time Activity Feed
- Live updates: new requests, revenue credits, ticket activities
- "Investor X submitted withdrawal request — ₹X,XXX"
- "Revenue credited to 47 partners — ₹X,XX,XXX total"

### 15.3 Top Investors List
- By highest capital invested
- By highest ROI earned

### 15.4 Financial Summary
- Total capital under management
- Total revenue distributed this month
- Total withdrawals this month
- Net liability

### 15.5 Date Range Filters
- All stats filterable by date range
- Indian Financial Year filter (April - March)

---

## 16. SYSTEM SETTINGS (Super Admin Only)

| Setting | Description |
|---------|-------------|
| Global Revenue Credit Time | IST time for daily cron (e.g., 6:00 PM) |
| Minimum Capital Deposit | Currently ₹10,000 |
| Maximum Capital Deposit | Currently ₹10,00,000 |
| Minimum Withdrawal Amount | Currently ₹1,000 |
| UPI Transfer Limit | Currently ₹1,00,000 |
| Maintenance Mode | On/Off — investors see maintenance message |
| Terms & Conditions | Editable content from admin panel |
| Privacy Policy | Editable content from admin panel |
| Manual Backup | Trigger button for immediate backup |

---

## 17. AUTOMATION & CRON JOBS

| Job | Time (IST) | Frequency | On Failure |
|-----|-----------|-----------|-----------|
| Revenue Credit | Admin-set time | Daily | Auto-retry + admin alert |
| Account Auto-Unlock | 12:00 AM | Daily | Log error |
| Database Backup | 12:00 AM | Daily | Admin email alert |
| Google Drive Backup Upload | 12:00 AM | Daily | Admin email alert |
| Monthly Summary Email | 12:00 AM | 1st of month | Retry next day |
| Ticket Escalation Check | 12:00 AM | Daily | Log |
| ROI Term Expiry Alert | 12:00 AM | Daily | Admin email |
| Pending Withdrawal Reminder | Real-time check | 48hr trigger | Log |

### Cron Execution Log
- Every cron execution logged in database
- Log contains: job name, start time, end time, success/fail, investor count, total amount
- Viewable in admin panel under "Cron Job Logs"

---

## 18. BACKUP & RECOVERY

### 18.1 Automated Backup
- Daily at 12:00 AM IST
- Tool: pg_dump (PostgreSQL)
- Format: compressed + encrypted .tar.gz
- Local storage: /backups folder on server (last 30 days retained)
- Google Drive: date-wise folders, permanent retention

### 18.2 Google Drive Backup
- Folder structure: `/TikhatPartnerBackups/YYYY/MM/DD/backup.tar.gz`
- Auto-uploaded after local backup completes
- Failure → admin email alert

### 18.3 Manual Backup
- Admin can trigger manual backup from System Settings
- Same process as automated backup

### 18.4 Recovery
- Restore from .tar.gz file using pg_restore
- Compatible with any Ubuntu server
- Full deployment guide to be documented separately

---

## 19. REPORTS & EXPORT

### 19.1 Investor-Side Exports
- Transaction history → PDF with Tikhat Partner letterhead (logo, company name, address)
- Web view: pagination (20 per page)
- Mobile view: infinite scroll

### 19.2 Admin-Side Exports
- Investor-wise full transaction history → PDF
- Monthly revenue report → PDF or Excel
- Capital report → PDF or Excel
- Indian Financial Year basis (April - March)
- Date range filters on all reports

### 19.3 PDF Letterhead Contents
- Tikhat Partner logo
- Company name: Tikhat Foods
- Domain: tikhatpartner.online
- Report title, date range, investor name

---

## 20. INVESTOR PANEL — COMPLETE PAGE STRUCTURE

### 20.1 Homepage (Public — Before Login)
- Splash screen (branded)
- Sections: Business info, features, partner enrollment info, contact details, about us (content provided by client at deployment)
- Login button
- Register button

### 20.2 Dashboard (After Login)
**Cards:**
1. Capital Invested Card → "View Transactions" link
2. Revenue Account Card (total daily returns) → "View Transactions" link
3. Total Balance Card (Capital Balance + Revenue Balance)
4. Portfolio Summary: Total Invested, Total Earned, Effective ROI%
5. Joining Date ("Partner Since: 15 Jul 2024")

**Charts:**
- Monthly Revenue Trend (bar/line chart)
- Capital Growth Over Time (line chart)

### 20.3 Revenue Page
- Daily credit/debit transaction list
- Columns: Date, Description, Credit, Debit, Balance
- Monthly total revenue section
- Overall total revenue (all time)
- Total withdrawn (all time)
- Filter by month/year

### 20.4 Fund Page
- Capital balance display with pending withdrawal note
- Capital locked/available status line
- Capital transaction history
- "Add Capital" button → opens Add Capital form
- "Withdraw" button → opens Withdrawal form

**Add Capital Form Fields:**
- Amount (₹)
- Date of Transfer
- UTR / Transaction Number
- Remark
- Attach Payment Screenshot

**Withdraw Form Fields:**
- Amount (₹)
- Account: Capital A/C / Revenue A/C
- Transfer Mode: Bank Transfer / UPI Transfer
- (UPI disabled if amount > ₹1,00,000)

### 20.5 Profile Page
- Profile photo (upload)
- Personal details: Name, DOB, Address
- Contact: Mobile, Email (with change request button)
- KYC: PAN Number + front/back images, Aadhar Number + front/back images
- Bank details
- UPI ID
- Account Opening Date
- Edit button → submit for admin approval → success message shown

### 20.6 Support Page
- "Raise New Ticket" button
- Ticket list: ID, Category, Status, Date, Last Update
- Click ticket → conversation thread view
- Filter by: status, category

### 20.7 Notifications
- Bell icon in header
- List of in-app notifications

---

## 21. ADMIN PANEL — COMPLETE PAGE STRUCTURE

### 21.1 Admin Dashboard
- Stats cards (see Section 15)
- Real-time activity feed
- Today's revenue schedule
- Top investors list
- Financial summary
- Date range filters

### 21.2 User Management
- Investor list with search + filters (name, status, joining date, capital amount)
- Actions per investor: View, Edit, Pause, Delete, Approve, Reject
- Investor detail page: all profile info + KYC + transaction summary
- Pending profile update requests with notification badge
- Field-by-field approve/reject for profile updates
- Account status management
- Locked accounts shown with lock reason
- Self-deactivated accounts marked

### 21.3 Capital Management
- Investor-wise capital overview
- Capital transaction history per investor
- Pending deposit/withdrawal requests list
- Approve/reject/delete requests
- Modify amount at approval
- Add/deduct capital directly
- Set locked/available status
- Bulk approve withdrawals
- Undo last action

### 21.4 Revenue Management
- Per investor: default ROI setting
- Per investor: term-based ROI (add new term with start/end date + rate)
- Revenue transaction history per investor
- Manual revenue add/deduct for specific date
- Edit/reverse specific revenue entries
- Pause/resume daily credit per investor
- Revenue credit frequency setting per investor
- Withdrawal frequency setting per investor
- Cron job status + next run time display

### 21.5 Backdate Management
- Select investor
- Choose: Single day entry / Bulk period entry / New backdate investor
- Enter details + ROI rate (optional)
- Preview before submit
- Submit for Super Admin approval
- Email notification toggle (yes/no)

### 21.6 Support Management
- All tickets list with filters + sort
- Ticket detail: conversation thread
- Reply to investor
- Change ticket status
- Assign to another admin
- Escalated tickets highlighted (7+ days)

### 21.7 Notification Center
- All system notifications
- Pending approval alerts
- Custom notification composer (single/selected/all investors)

### 21.8 Reports & Export
- Generate investor-wise reports
- Monthly revenue reports
- Capital reports
- Financial year summary
- Export as PDF or Excel

### 21.9 System Settings (Super Admin)
- All settings from Section 16
- Admin management (create/suspend/delete admins)
- Admin activity logs

### 21.10 Activity Logs
- All admin actions logged with: admin name, action, investor affected, timestamp
- Searchable and filterable
- Permanent retention (5+ years)

### 21.11 Cron Job Logs
- All cron executions logged
- Status: success/partial/failed
- Details: how many investors processed, total amount, errors

---

## 22. CONCURRENT EDITING RULES

- If 2 admins are editing same investor record simultaneously → both see banner: "[Admin Name] is also editing this page"
- Last save wins
- Double-processing prevention: if 2 admins approve same withdrawal simultaneously → system processes only once

---

## 23. DATA RETENTION RULES

| Data Type | Retention Period |
|-----------|-----------------|
| Transaction records | Permanent (5+ years) |
| Audit logs | Permanent |
| Deleted investor data | Permanent (access removed) |
| Cancelled/rejected transactions | Permanent |
| Old bank details | Permanent |
| Cron job logs | Permanent |
| Email delivery logs | Permanent |
| Backup files (local) | 30 days |
| Backup files (Google Drive) | Permanent |

---

## 24. EDGE CASES & SPECIAL RULES

### 24.1 Revenue Edge Cases
- Last day of month → remaining amount credited (may be outside 90-110% range)
- Investor paused mid-cron → that day skipped entirely
- ROI term gap → default ROI fills automatically
- Capital added mid-month → new balance used from next day
- Revenue balance never goes negative (admin deductions blocked if insufficient)

### 24.2 Withdrawal Edge Cases
- Capital locked after withdrawal request submitted → request auto-cancelled
- Investor cancels withdrawal → amount instantly restored
- Admin rejects withdrawal → amount instantly restored
- UPI chosen for amount > ₹1,00,000 → system blocks at form level
- Withdrawal frequency exceeded → system blocks with message

### 24.3 Backdate Edge Cases
- Backdate capital → triggers automatic revenue recalculation from that date
- Backdate new investor → system generates all revenue from joining date
- Multiple ROI terms in backdate period → system uses appropriate rate per date range

### 24.4 Security Edge Cases
- Same UTR from same investor → blocked
- Same UTR from different investor → blocked globally
- Same PAN from different investor → blocked
- Same Aadhar from different investor → blocked
- Same email for new registration → blocked
- Deleted investor email for new registration → blocked permanently
- 5 failed logins → account locked, visible in admin with reason

---

## 25. VALIDATION RULES SUMMARY

| Field | Rule |
|-------|------|
| Full Name | Min 3 chars, alphabets + spaces only |
| Mobile Number | 10 digits, Indian format only (+91) |
| Email | Valid email format, unique |
| Amount (Capital Add) | ₹10,000 to ₹10,00,000 |
| Amount (Withdrawal) | Min ₹1,000 |
| UPI Transfer | Max ₹1,00,000 |
| UTR Number | Globally unique across all investors |
| PAN Number | Globally unique across all investors |
| Aadhar Number | Globally unique across all investors |
| File Upload | Max 5MB, JPG/PNG/PDF only |
| OTP | Expires in 10 minutes |
| Password Attempts | Max 5 before lock |

---

## 26. LEGAL & COMPLIANCE

- Terms & Conditions: mandatory acceptance at registration
- Privacy Policy: mandatory acceptance at registration
- Both documents editable by Super Admin from admin panel
- PAN + Aadhar stored for legal/compliance purposes
- Audit trail maintained for 5+ years
- Indian Financial Year (April-March) used in reports
- No GST/TDS calculation in current scope

---

*End of PROJECT_KNOWLEDGE.md*
*This document must be referenced by Cursor before implementing any feature.*
*Do not implement anything that contradicts this document.*
*If any requirement seems unclear, refer back to this document first.*
