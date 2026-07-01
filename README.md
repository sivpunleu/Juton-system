# Jotun Billing System

A small invoice management application built with:

- Node.js, Express, MySQL, and Sequelize
- Vue 3, Vite, Bootstrap 5, and BootstrapVueNext

## Run locally

1. Create a MySQL database, copy `backend/.env.example` to `backend/.env`,
   and update the `DB_*` values. If MySQL is unavailable, development and
   tests can use local JSON storage; production always requires MySQL.
2. Install and start the backend:

```bash
cd backend
npm install
npm run dev
```

3. In another terminal, install and start the frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` and the API runs at
`http://localhost:5000`.

## Admin authentication

Admin invoice pages, the invoice list, and create/edit/delete actions require
an admin login. Customer-facing invoice links use random share tokens at
`/public/invoices/:token`.

Generate a bcrypt password hash:

```bash
cd backend
npm run hash-password
```

Generate a JWT signing secret:

```bash
npm run generate-jwt-secret
```

Add the generated values to `backend/.env`:

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$...
JWT_SECRET=long-random-secret
JWT_EXPIRES_IN=8h
```

Passwords and JWT secrets must only be stored in environment variables. Never
add them to frontend code or commit them to Git.

The first successful environment-admin login creates an `owner` account in
the application database. The owner can then create more accounts:

- `owner`: full access, admin management, and JSON backup
- `admin`: manage invoices, payments, customers, products, and audit logs
- `viewer`: read-only access

## Billing features

- Atomic sequential invoice numbers in `INV-YYYY-00001` format
- Draft, unpaid, partially paid, paid, and cancelled statuses
- Payment history with amount, date, receiver, note, and recording admin
- Dashboard revenue, outstanding balance, paid invoice, and status metrics
- Customer and product catalogues that populate the invoice form
- Audit logging for management and security actions
- Recoverable trash and restore for invoices, customers, and products
- Server-side pagination and filters
- Personal profiles with a compressed avatar, display name, password controls,
  last login details, and personal activity history
- Invoice CSV export and owner-only JSON database backup
- Automated daily backup snapshots with owner-only download and restore workflow
- Telegram delivery for invoices, payment receipts, and debt alerts
- A shared A4 layout for browser preview and Print / Save PDF

Downloaded backups contain private customer and business data. Store them in a
secure location.

Backup restore replaces business data such as invoices, customers, products,
salespeople, settings, audit logs, and invoice counters. Admin accounts are not
restored from uploaded backup files.

## Deploy

### 1. Cloud MySQL

Create a MySQL service on Aiven, Railway, or another provider. Copy its host,
port, database, username, and password. Enable SSL for production and upload
the provider CA certificate to Render as a secret file when required.

Production requires MySQL. The local JSON fallback is development-only.

### 2. Backend on Render

1. Push this repository to GitHub.
2. In Render, create a Blueprint from the repository. Render reads
   `render.yaml`.
3. Set these environment variables:

```text
DB_HOST=your-cloud-mysql-host
DB_PORT=your-cloud-mysql-port
DB_NAME=defaultdb
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_SSL=true
DB_SSL_CA_PATH=/etc/secrets/mysql-ca.pem
DB_SYNC=false
DB_LOGGING=false
CLIENT_URL=https://your-frontend.vercel.app
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$...
JWT_SECRET=long-random-secret
JWT_EXPIRES_IN=8h
TELEGRAM_BOT_TOKEN=123456789:replace-with-bot-token
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_PUBLIC_URL=https://your-frontend.vercel.app
AUTO_BACKUP_ENABLED=true
AUTO_BACKUP_TIME=02:00
AUTO_BACKUP_RETENTION_DAYS=30
KHQR_ENABLED=false
KHQR_BAKONG_ACCOUNT_ID=your-bakong-account-id
KHQR_MERCHANT_NAME=Marvel Decor
KHQR_MERCHANT_CITY=PHNOM PENH
KHQR_MERCHANT_CATEGORY_CODE=5999
KHQR_CURRENCY=USD
```

After deployment, test:

```text
https://your-backend.onrender.com/api/health
```

Run `npm run db:sync` once with the production database environment variables
when creating an empty database. Keep `DB_SYNC=false` during normal production
startup.

Database snapshots stored by the application live in the same MySQL service.
Download important snapshots regularly and keep an encrypted copy outside the
database provider.

### 3. Frontend on Vercel

1. Import the same GitHub repository.
2. Set the Root Directory to `frontend`.
3. Add this environment variable:

```text
VITE_API_URL=https://your-backend.onrender.com/api
```

4. Deploy, then copy the Vercel URL into Render's `CLIENT_URL` and redeploy
   the backend.

## Telegram alerts

1. Create a bot with `@BotFather` and copy its token.
2. Open the bot and send `/start`. For a group or channel, add the bot and
   allow it to post messages.
3. Read the target chat ID from the Bot API `getUpdates` response.
4. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to Render Environment.
   `TELEGRAM_PUBLIC_URL` is optional; when omitted, the first `CLIENT_URL`
   value is used for invoice links.
5. Redeploy the backend.

Bot tokens must stay in backend environment variables. Never put a Telegram
token in Vue code, Vercel variables exposed with `VITE_`, screenshots, or Git.

After configuration:

- Invoice Preview can send the invoice summary and public invoice link.
- Payment Receipt and payment history can send receipt details.
- Notification Center can send an overdue and outstanding debt summary.
- Every send action is recorded in Audit Log.

## Bakong KHQR payments

Dynamic KHQR can be enabled from backend environment variables. When enabled,
invoice preview pages generate a KHQR code for the current balance due and use
the invoice number as the payment reference.

```text
KHQR_ENABLED=true
KHQR_BAKONG_ACCOUNT_ID=your-bakong-account-id
KHQR_MERCHANT_NAME=Marvel Decor
KHQR_MERCHANT_CITY=PHNOM PENH
KHQR_MERCHANT_CATEGORY_CODE=5999
KHQR_CURRENCY=USD
```

This creates the QR for customer payment only. Payment verification is still
manual unless a bank or payment provider webhook is added later.
# Juton-system
