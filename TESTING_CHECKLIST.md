# Tikhat Partner — Manual End-to-End Testing Checklist

Use this checklist to verify complete business flows before production release.  
Mark each item when verified. Record transaction IDs, amounts, and email delivery notes.

**Environment:** _______________ (staging / production)  
**Tester:** _______________  
**Date (IST):** _______________

---

## 0. Pre-flight

- [ ] Backend health: `GET /api/health` → success, database OK, crons reported
- [ ] Frontend loads at `https://tikhatpartner.online` (or staging URL)
- [ ] Admin can open admin login; Super Admin credentials available
- [ ] Resend dashboard open for email verification
- [ ] Test mobile device / browser ready for investor app

---

## 1. Investor lifecycle

Flow: **register → admin approve → login → add capital → revenue credits → withdraw → support ticket**

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 1.1 | Investor registers (name, email, password, mobile) | Success message; status **pending**; no login yet | [ ] |
| 1.2 | Registration email received (Resend) | Approval-pending / welcome template | [ ] |
| 1.3 | Admin opens pending investors → **Approve** | Status becomes **active**; approval email sent | [ ] |
| 1.4 | Investor login → OTP email → verify OTP | Access + refresh tokens; dashboard loads | [ ] |
| 1.5 | Investor submits capital deposit (≥ ₹10,000) with UTR + screenshot | Transaction ID `TKT-CAP-DEP-YYYY-XXXXX`; status submitted | [ ] |
| 1.6 | Admin approves deposit | Capital balance increases; investor notified | [ ] |
| 1.7 | Wait for / trigger daily revenue credit (or manual credit) | Revenue transaction `TKT-REV-CR-...`; revenue balance > 0 | [ ] |
| 1.8 | Investor withdraws revenue (≥ ₹1,000) | Withdrawal request created; revenue pending updated | [ ] |
| 1.9 | Investor raises support ticket | Ticket ID `TKT-SUP-YYYY-XXXXX`; confirmation email | [ ] |

**Notes / IDs:** _______________________________________________

---

## 2. Capital flow

Flow: **deposit request → admin approve with modified amount → balance updated → withdraw → admin complete with UTR**

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 2.1 | Investor deposit request amount A (e.g. ₹50,000) | Status submitted; unique UTR accepted | [ ] |
| 2.2 | Admin opens request → Approve with modified amount B ≠ A | Status approved; stored amount = B; original retained | [ ] |
| 2.3 | Investor capital balance | Increases by **B** (not A); Total Balance updates | [ ] |
| 2.4 | Investor capital withdrawal amount C (≥ ₹1,000, ≤ available) | Request created; pending withdrawal reflected | [ ] |
| 2.5 | Admin: Approve → Process → Complete with payment UTR + date | Status completed; capital balance reduced by C | [ ] |
| 2.6 | Duplicate UTR on new deposit | Rejected globally | [ ] |
| 2.7 | Deposit reject path (separate request) | Status rejected; balance unchanged; reason stored | [ ] |

**Balance check:** Capital = Approved deposits − Approved/completed withdrawals ≥ 0  
Before: ₹________ After: ₹________  

**Txn IDs:** Deposit ________ / Withdrawal ________

---

## 3. Revenue flow

Flow: **ROI set → daily cron runs → credit appears → monthly total correct → withdraw revenue**

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 3.1 | Admin sets default ROI for investor (e.g. 30%) | Active ROI returned on investor/admin ROI APIs | [ ] |
| 3.2 | Confirm capital balance used for ROI is current approved capital | Matches capital card | [ ] |
| 3.3 | Daily revenue cron runs at configured IST time (or manual trigger in staging) | Cron log success; credit for eligible investors | [ ] |
| 3.4 | Investor revenue transaction list | New `TKT-REV-CR-...` for today; amount whole rupees | [ ] |
| 3.5 | Daily amount within 90–110% of daily average (except month last day) | Spot-check vs formula | [ ] |
| 3.6 | Month-to-date sum vs expected monthly (or pro-rated if mid-month join) | Monthly tracking / summary correct | [ ] |
| 3.7 | Pause investor revenue one day → resume next | Paused day = ₹0 and **not** redistributed | [ ] |
| 3.8 | Investor revenue withdrawal ≥ ₹1,000 | Request created; revenue balance never negative | [ ] |
| 3.9 | Admin completes revenue withdrawal with UTR | Balance reduced; investor notified | [ ] |

**Formula reminder (Section 7.2):**  
Daily Avg = (Capital × ROI%) / DaysInMonth  
Range = 90%–110% of daily avg; last day = monthly total − prior credits  

**Observed:** Daily credit ₹________ / MTD ₹________ / Expected ₹________

---

## 4. Support flow

Flow: **raise ticket → admin reply → investor reply → admin resolve → investor reopen → admin close**

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 4.1 | Investor creates ticket (category + subject + message ± attachment) | `TKT-SUP-...`; status open/submitted | [ ] |
| 4.2 | Admin replies | Investor sees reply; notification + email | [ ] |
| 4.3 | Investor replies | Thread updated; admin notified | [ ] |
| 4.4 | Admin resolves ticket | Status resolved; investor can see resolution | [ ] |
| 4.5 | Investor reopens | Status reopened / open again | [ ] |
| 4.6 | Admin closes ticket | Status closed; further investor reply blocked (or per product rules) | [ ] |
| 4.7 | Escalation (optional): leave open 7+ days | Escalates to Super Admin at 12 AM IST | [ ] |

**Ticket ID:** _______________

---

## 5. Backdate flow

Flow: **admin submits → Super Admin approves → entries created → investor sees backdated transactions**

| Step | Action | Expected | Pass |
|------|--------|----------|------|
| 5.1 | Admin submits capital or revenue backdate request | Request pending Super Admin; preview amounts sensible | [ ] |
| 5.2 | Super Admin approves | Entries created with historical dates; audit logged | [ ] |
| 5.3 | Investor transaction history | Backdated rows visible with correct dates (DD MMM YYYY) | [ ] |
| 5.4 | Balances after backdate | Capital/revenue match approved backdate totals | [ ] |
| 5.5 | Super Admin reject path | No ledger entries; request rejected with reason | [ ] |

**Backdate request ID:** _______________

---

## 6. Email triggers (Resend dashboard)

Verify each template delivery (subject + recipient). Mark when seen in Resend.

| Trigger | Template / event | Received | Pass |
|---------|------------------|----------|------|
| Investor registration | Registration / pending | [ ] | [ ] |
| Admin approves investor | Approval | [ ] | [ ] |
| Admin rejects investor | Rejection | [ ] | [ ] |
| Login OTP | OTP | [ ] | [ ] |
| Forgot password OTP | OTP / reset | [ ] | [ ] |
| Capital deposit submitted | Transaction notice (if configured) | [ ] | [ ] |
| Capital deposit approved / rejected | Approval / rejection | [ ] | [ ] |
| Capital / revenue withdrawal updates | Withdrawal | [ ] | [ ] |
| Daily revenue credit | Revenue credit | [ ] | [ ] |
| Support ticket created | Support | [ ] | [ ] |
| Support admin reply | Support | [ ] | [ ] |
| Monthly summary (month end) | Monthly summary | [ ] | [ ] |
| Admin alerts (cron/email failure) | Admin alert | [ ] | [ ] |

---

## 7. Cross-cutting verification

- [ ] All transaction IDs follow formats (`TKT-CAP-DEP-`, `TKT-CAP-WDR-`, `TKT-REV-CR-`, `TKT-REV-WDR-`, `TKT-SUP-`, `TKT-ADM-`, `TKT-PRF-`)
- [ ] Amounts are whole rupees; UI shows Indian format (₹1,00,000)
- [ ] Dates display as DD MMM YYYY in IST
- [ ] Capital balance ≥ 0 and revenue balance ≥ 0 throughout
- [ ] Rate limiting returns 429 after abuse (optional spot check)
- [ ] No stack traces in API error responses
- [ ] Audit log entries for admin mutations

---

## 8. Sign-off

| Area | Result (Pass / Fail) | Issues |
|------|----------------------|--------|
| Investor lifecycle | | |
| Capital flow | | |
| Revenue flow | | |
| Support flow | | |
| Backdate flow | | |
| Emails | | |

**Overall:** Pass [ ] / Fail [ ]  

**Signed:** _______________ **Date:** _______________
