# Testing Evidence

## Automated Test Result

| Area | Command | Result |
| --- | --- | --- |
| Backend unit/integration tests | `cd backend && npm test` | PASS - 28 tests, 0 failed |
| Frontend production build | `cd frontend && npm run build` | PASS - build completed |

Note: Vite reports a chunk-size warning after build. It is not a failing error, but code-splitting can be improved later.

## Test Cases

| No | Test Case | Expected Result | Status |
| --- | --- | --- | --- |
| 1 | Admin login with valid username/password | User can access dashboard | PASS |
| 2 | Login with wrong password | System rejects login | PASS |
| 3 | Create invoice with product item | Invoice number is generated and invoice is saved | PASS |
| 4 | Confirm active invoice | Product stock is deducted automatically | PASS |
| 5 | Cancel confirmed invoice | Product stock is restored automatically | PASS |
| 6 | Record partial payment | Payment history is saved and balance due is updated | PASS |
| 7 | Prevent overpayment | Payment greater than balance is rejected | PASS |
| 8 | Revenue report by date range | Summary, trend, sales performance, and items are returned | PASS |
| 9 | Analytics report | Monthly revenue, best-selling products, debt aging, and low-stock data are returned | PASS |
| 10 | Backup snapshot | Owner can create and download JSON backup | PASS |
| 11 | Restore backup | Data is restored and safety backup is created first | PASS |
| 12 | KHQR payment data | Active unpaid invoice receives dynamic KHQR payload | PASS |
| 13 | Role access control | Owner/admin/viewer permissions are enforced | PASS |

## Screenshot Checklist

ប្រើ list នេះពេលរៀបចំ project paper ឬ slide presentation:

| Screenshot | Purpose |
| --- | --- |
| Login page | បង្ហាញ authentication |
| Dashboard | បង្ហាញ invoice/revenue overview |
| Product catalogue | បង្ហាញ stock quantity និង low-stock threshold |
| Invoice form | បង្ហាញ create invoice workflow |
| Invoice preview | បង្ហាញ invoice A4 និង KHQR/payment action |
| Payment history | បង្ហាញ record payment និង balance update |
| Reports page | បង្ហាញ revenue chart និង analytics |
| Backup & Restore | បង្ហាញ data safety workflow |
| Render backend health/logs | បង្ហាញ deployment evidence |
| Aiven/Railway MySQL overview | បង្ហាញ cloud database evidence |

## Manual Verification Notes

- Create an invoice as `Draft` first: stock should not be deducted.
- Change the invoice to `Unpaid`, `Partially Paid`, or `Paid`: stock should deduct once.
- Change invoice to `Cancelled`: stock should restore.
- Add payment to active invoice: `paidAmount`, `balanceDue`, and `status` should update.
- Run backup before restore: system creates a safety snapshot.
