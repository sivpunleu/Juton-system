# Security Controls

## Authentication

- Admin login uses username and password.
- Passwords are stored as bcrypt hashes, never plain text.
- JWT is used for authenticated API access.
- JWT secret must be at least 32 characters.
- Token lifetime is configured with `JWT_EXPIRES_IN`.

## Password Policy

New admin passwords must:

- Have at least 10 characters.
- Include uppercase and lowercase letters.
- Include at least one number.
- Include at least one symbol.

## Authorization

The system uses role-based access control:

| Role | Permission |
| --- | --- |
| owner | Full access, admin management, backup and restore |
| admin | Manage invoices, payments, customers, products, and reports |
| viewer | Read-only access |

## Request Protection

- `helmet` adds HTTP security headers.
- Express hides the `X-Powered-By` header.
- CORS only allows configured frontend origins from `CLIENT_URL`.
- Global API rate limiting protects `/api/*` routes.
- Login has a stricter failure-based rate limit.
- JSON body size is limited with `JSON_BODY_LIMIT`.

## Data Protection

- Secrets stay in environment variables and are ignored by Git.
- MySQL SSL is supported for cloud database connections.
- Backup and restore are owner-only operations.
- Restore creates a safety backup before replacing business data.
- Audit logs record important actions such as login, invoice changes, payments, backup, restore, and admin changes.

## Production Environment Variables

```text
NODE_ENV=production
JWT_SECRET=long-random-secret-at-least-32-characters
JWT_EXPIRES_IN=8h
CLIENT_URL=https://your-frontend-url
JSON_BODY_LIMIT=10mb
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=600
DB_SSL=true
DB_LOGGING=false
```

## Remaining Improvements

- Add refresh token rotation if long-lived sessions are required.
- Add backup file encryption for downloaded JSON backups.
- Add payment-provider webhook verification for automatic KHQR confirmation.
- Add centralized request schema validation with a library such as Zod or Joi.
