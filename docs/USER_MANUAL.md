# User Manual - Jotun Billing System

## 1. Login

1. Open the system URL.
2. Enter admin username and password.
3. Click Login.
4. After successful login, the dashboard is displayed.

## 2. Create Invoice

1. Go to Invoices.
2. Click Create Invoice.
3. Select or enter customer information.
4. Add products from Product Catalogue.
5. Check quantity, unit price, discount, tax, delivery fee, and deposit.
6. Choose status:
   - `Draft`: save only, stock is not deducted.
   - `Unpaid`, `Partially Paid`, or `Paid`: confirmed invoice, stock is deducted.
   - `Cancelled`: invoice is cancelled, stock is restored if it was already deducted.
7. Click Save.

## 3. Record Payment

1. Open an unpaid or partially paid invoice.
2. Click Add Payment.
3. Enter amount, payment date, receiver, and note.
4. Save payment.
5. The system updates payment history, paid amount, balance due, and invoice status.

## 4. Print or Save PDF

1. Open Invoice Preview.
2. Review customer, products, totals, and payment QR.
3. Click Print / Save PDF.
4. Choose printer or Save as PDF from the browser.

## 5. Product Stock

1. Go to Products.
2. Create or update product information.
3. Use stock action to add, deduct, or set stock manually.
4. When an invoice is confirmed, stock is deducted automatically.
5. When a confirmed invoice is cancelled, stock is restored automatically.

## 6. Reports and Analytics

1. Go to Reports.
2. Select date range and group type.
3. Click Apply Filter.
4. Review:
   - Revenue Trend
   - Sales Performance
   - Products by Sales Source
   - Monthly Revenue
   - Best-Selling Products
   - Customer Debt Aging
   - Low Stock Watchlist

## 7. Backup

Owner role only:

1. Go to Reports.
2. Open Backup & Restore section.
3. Click Run Backup Now.
4. Download the snapshot JSON file if needed.
5. Store backup files securely.

## 8. Restore

Owner role only:

1. Go to Reports.
2. Select a backup snapshot or upload backup JSON.
3. Click Restore.
4. Type `RESTORE` to confirm.
5. The system creates a safety backup first, then restores business data.

## 9. Security Notes

- Do not share admin password.
- Use owner account only for backup, restore, and admin management.
- Keep `.env` and database passwords outside GitHub.
- Downloaded backups contain customer and business data; store them safely.
