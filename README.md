# Agency Management & Creative Hub

Company management application for a digital marketing agency: clients, creative shelf, agreements and scope, invoices and monthly billing, payments and receipts, employees and payroll, expenses, other income, a cash dashboard and reports.

| Part | Stack | Port |
| --- | --- | --- |
| `frontend/` | Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Lucide, Recharts | 3000 |
| `backend/` | Node.js, Express 5, TypeScript, Zod, Prisma 7, PDFKit, Multer | 4000 |
| Database | PostgreSQL 16 (Docker Compose for local development) | 5432 |

---

## 1. Prerequisites (Windows)

- **Node.js 20+** – check with `node -v`
- **Docker Desktop**, running – provides PostgreSQL. (A native PostgreSQL install also works; change `DATABASE_URL`.)

## 2. First-time setup (PowerShell)

```powershell
cd "D:\live projects\digital-agency-sw\agency-management"

# 1. Start PostgreSQL
docker compose up -d
docker compose ps                     # agency-postgres should be "healthy"

# 2. Backend
cd backend
npm install                           # also generates the Prisma client
Copy-Item .env.example .env
# Edit .env: set JWT_SECRET (command below) and optionally SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npx prisma migrate deploy             # create the tables
npm run db:seed                       # categories, default template, first admin, fictional sample data

# 3. Frontend
cd ..\frontend
npm install
Copy-Item .env.local.example .env.local
```

### The first administrator

`npm run db:seed` creates the administrator from `SEED_ADMIN_EMAIL` (default `admin@example.com`).

- If `SEED_ADMIN_PASSWORD` is set (12+ characters) it is used.
- If it is empty, a strong random password is generated and **printed once** in the terminal. Copy it, sign in, and change it under **Settings › My account**.

Re-running the seed never changes an existing admin's password. Set `SEED_SAMPLE_DATA=false` to skip the fictional sample clients, invoice, employees and expenses.

## 3. Run in development

Two PowerShell windows:

```powershell
# Window 1 – API on http://localhost:4000/api/v1
cd "D:\live projects\digital-agency-sw\agency-management\backend"
npm run dev
```

```powershell
# Window 2 – web app on http://localhost:3000
cd "D:\live projects\digital-agency-sw\agency-management\frontend"
npm run dev
```

Open http://localhost:3000 and sign in.

**Before issuing real invoices:** go to **Settings › Company** and replace the placeholder company name ("Your Agency Name") with your legal details. Issuing is blocked until you do.

## 4. Checks and tests

```powershell
# Backend
cd backend
npm run typecheck
npm run lint
npm test            # needs Docker running; uses TEST_DATABASE_URL (wiped on every run)

# Frontend
cd ..\frontend
npm run typecheck
npm run lint
npm run build
```

One-time test database creation (already in `.env.example` as `TEST_DATABASE_URL`):

```powershell
docker exec agency-postgres psql -U agency -d agency_management -c "CREATE DATABASE agency_management_test;"
```

The suite (`backend/tests/`) covers invoice/payroll calculations and rounding, Indian amount-in-words, authentication, CSRF, role-based access, server-side total recalculation, invoice numbering, duplicate-period protection, partial/full payments, overpayment and concurrent-payment protection, idempotent payment submission, duplicate transaction references, voiding, invoice revision, PDF generation, payroll status flow, paid-payroll locking, adjustments, payslip access and bank-detail masking.

## 5. Database changes and migrations

```powershell
cd backend
npm run db:migrate -- --name describe_change   # development: create + apply a migration
npx prisma migrate deploy                       # staging/production: apply pending migrations
npm run db:studio                               # browse data
```

**Before running migrations in production, back up the database and the uploads folder:**

```powershell
docker exec agency-postgres pg_dump -U agency -d agency_management -F c -f /tmp/backup.dump
docker cp agency-postgres:/tmp/backup.dump ".\backup-$(Get-Date -Format yyyyMMdd-HHmm).dump"
Compress-Archive -Path .\backend\uploads -DestinationPath ".\uploads-$(Get-Date -Format yyyyMMdd-HHmm).zip"
```

---

## 6. Roles

| Role | Access |
| --- | --- |
| Administrator | Everything, including the sign-in security switch. Approves managers' payments, expenses and payroll payouts, and employees' delete requests |
| Manager | Everything an administrator can do (finance, payroll, employees, users, settings, reports, audit log) **except**: payments, expenses and payroll payouts they enter wait for administrator approval; they cannot edit or void payments or expenses; they cannot create or change administrator logins or the sign-in security switch. Approves employees' delete requests |
| Accountant | Dashboard, clients, agreements (read), invoices, payments, expenses, other income, reports, categories |
| Employee | All day-to-day work: clients (no pricing), creative shelf, tasks (whole team board), calendar, ad campaigns, their own work log, their own **paid** payslips. Any delete or client archive becomes a request that a manager or administrator approves. No access to invoices, payments, expenses, income or other people's payroll |
| Client (portal) | Only their own client's **Approved** and **Published** creatives: preview and download original files (single files or a ZIP per creative). No drafts, archived work, internal notes, finance or settings. Create these logins in **Settings › Users** and pick the client. |

The frontend hides what a role cannot use, and the API enforces the same rules on every request.

**Approvals** (sidebar › Approvals, with a badge for requests waiting on you): nothing changes until a request is approved. Approving replays the original action as the approver, so receipt numbers, invoice balances, totals and reports only ever include approved entries, and the normal audit trail is kept. Rejected or withdrawn requests change nothing (any uploaded proof/receipt is discarded). Requests: `GET /approvals[?toReview|mine|status|kind]` · `GET /approvals/counts` · `POST /approvals/:id/approve|reject|cancel`.

## 7. Business rules worth knowing

- **Money** is stored as PostgreSQL `numeric(14,2)`. The backend recalculates every total from line items; totals sent by the browser are ignored. The API returns amounts as decimal strings.
- **Invoices** are drafts until issued. Issuing assigns the next sequential number (e.g. `INV-2026-27-0001`, restarting each April when "Include financial year" is on) and freezes the company details on the invoice. Issued totals cannot be edited: use **Revise** (cancels the invoice, keeps its number, creates a linked draft) or **Cancel**. Invoices with payments must have those payments voided first.
- **Duplicate billing**: a second invoice for the same client and billing month needs explicit confirmation; generated recurring invoices are additionally protected by a unique key.
- **Payments** lock the invoice row while saving, cannot exceed the balance, are blocked if the same method + transaction reference was already recorded, and are idempotent per form submission. Payments are voided, never deleted.
- **Payroll** goes Pending → Approved → Paid. Paid records are locked; corrections are recorded as adjustments. One record per employee per month. **No statutory deduction is assumed** – configure rules in **Settings › Payroll deductions** and verify compliance with a professional.
- **Reports and the dashboard are cash-based**: client collections come only from recorded payments, other income excludes client payments (matching references are blocked), and payroll counts net pay + adjustments on the payment date. These are management reports, not audited statements.
- **Archiving** hides clients and agreements without deleting history. Expenses and income entries are voided, not deleted. Every change to financial records is written to the audit log (client-related entries appear on the client's Activity tab).
- **Ad campaigns** store spend and results as entered from Meta Ads Manager / Google Ads (CTR, CPC, CPM and cost per result are calculated by the server). A campaign appears in a report period if it ran at any time within it. Agency-paid ad spend is not added to Expenses automatically. Post, reel and story boosts must name the boosted creative (picked from the Creative Shelf) or a link to the post; the "Boosted posts & reels" report groups all boosts per creative.
- **Calendar** (Google Calendar–style): month / week / day / schedule views, click to create, drag to move, repeating events (daily/weekly/monthly/yearly with end date; delete one occurrence or the series), guests, client link and event types (posting date, design deadline, send to client, shoot, meeting, campaign launch, festival). Task deadlines, creative publish dates and ad campaigns appear as linked, read-only calendars. Each client page has its own Calendar tab. Keyboard: t (today), d/w/m/a (views), j/k (next/previous), c (create).
- **Content calendars** (client › Content calendar tab): one per client and month, either an uploaded file (PDF, Excel, Word or image, up to 25 MB) or a PDF generated from the app calendar every time it is opened, so it always matches the plan. The generated PDF is a landscape month grid plus a day-by-day list of posting dates, creatives to publish, shoots, festivals, items for client review and ad campaign start dates. Internal meetings, design deadlines, ad spend and creative statuses are never included. Shared calendars appear in the client portal (Creatives & Calendar › Content calendar) to view or download; unsharing hides them immediately. API: `GET/POST /content-calendars` · `GET /content-calendars/preview?clientId&period` · `PUT/DELETE /content-calendars/:id` · `GET /content-calendars/:id/file[?download=true]` · portal: `GET /portal/content-calendars` · `GET /portal/content-calendars/:id/file`.
- **Tasks** are on a shared team board. Admins, managers and employees create, edit, reassign and move tasks To do → In progress → In review → Done and post updates; an employee's delete goes to a manager for approval. Work log entries can be linked to a task, so each task shows hours logged against its estimate.
- **Work log** time is entered in hours and stored in minutes. Employees can only see and edit their own entries; a person cannot log more than 24 hours on one day.
- **Agreement uploads** are stored copies for reference; uploading a document does not by itself constitute or verify a legally valid signature.

## 8. Replacing the invoice design and branding

1. **Settings › Company** – legal and trading name, address, PAN, GST registration and GSTIN (only shown when enabled), default tax rate, CGST/SGST split, bank and UPI details, invoice/receipt prefixes and numbering, payment terms, and the **logo** (PNG or JPEG, used on invoices, receipts and payslips).
2. **Settings › Invoice templates** – create or edit a template:
   - Layout: **Classic** (logo + accent rule), **Modern** (full-width colour header band) or **Minimal** (monochrome).
   - Primary and accent colours, header tagline, terms, footer text, which sections to show, signature label and an uploaded **signature image**.
   - **Preview PDF** renders the template with clearly marked SAMPLE data.
   - Upload your existing invoice as a **Reference design** (PDF/image) to keep it beside the template while you match colours and wording.
3. Choose the active template in **Settings › Company › Invoice template**. A specific invoice can also pick a template in the editor.

To change the layout itself beyond these options (for example to reproduce a supplied design exactly), edit `backend/src/services/pdf/invoicePdf.ts`. `drawHeader`, `drawParties`, `drawItems`, `drawTotals` and `drawFooterBlocks` each render one section from saved invoice data; add a new value to the `InvoiceLayout` enum in `prisma/schema.prisma` if you want it selectable. Download PDF always renders the exact saved invoice (draft/cancelled invoices are watermarked).

PDFs use the built-in Helvetica font, so amounts are shown with the currency code (`INR 53,100.00`) rather than the ₹ glyph. To use ₹, register a TTF font that contains it with `doc.registerFont` in `pdfUtils.ts`.

## 9. File storage

Uploads are streamed by Multer to `backend/uploads/tmp`, content-checked by file signature, then moved into `backend/uploads/<category>/<year>/<month>/<uuid>.<ext>`. Only metadata is stored in PostgreSQL; files are never loaded fully into memory, and videos are served with HTTP range support. All downloads go through `GET /api/v1/files/:id`, which checks the user's role against the file category.

To use S3-compatible storage, implement the `StorageDriver` interface in `backend/src/services/storage/storage.ts` (multipart upload from the temp file, signed-URL redirect in `send()`), add a driver value to `STORAGE_DRIVER` in `config/env.ts`, and select it in `createStorage()`.

Limits: creatives up to `MAX_UPLOAD_MB` (default 500 MB, images and MP4/MOV/WEBM video), agreements 25 MB (PDF/DOCX/JPG/PNG), receipts and proofs 10 MB, logos and signatures 5 MB (PNG/JPEG).

## 10. Security

- Passwords hashed with **argon2id**; sessions are **httpOnly** JWT cookies (8 h) revoked on password change, role change, deactivation or "sign out on all devices".
- **CSRF**: double-submit token (`GET /auth/csrf`), required as `X-CSRF-Token` on every non-GET request.
- Helmet security headers, CORS restricted to `CORS_ORIGIN`, rate limiting (stricter on login), Zod validation on every input, Prisma parameterised queries, path-traversal-safe storage keys, generic 404 for records you may not access.
- Employee bank details are admin-only and masked in lists and payslips; audit entries never store their values.
- Secrets live in `.env` files, which are git-ignored. Commit only `.env.example` / `.env.local.example`.
- In production: serve both apps over HTTPS, set `NODE_ENV=production`, a fresh `JWT_SECRET`, real database credentials, and `CORS_ORIGIN` to the frontend URL. If the frontend and API are on different sites, set `COOKIE_SAMESITE=none` (requires HTTPS).

---

## 11. Project layout

```
agency-management/
  docker-compose.yml           local PostgreSQL
  backend/
    prisma/                    schema.prisma, migrations/, seed.ts, sampleData.ts
    prisma.config.ts           Prisma 7 configuration (schema, migrations, seed)
    src/
      app.ts, server.ts        Express app and entry point
      config/                  env validation, role permissions
      routes/                  one router per module, mounted under /api/v1
      controllers/             HTTP in/out only
      services/                business logic, transactions, PDF rendering, storage
      validators/              Zod schemas
      middleware/              auth, CSRF, validation, uploads, errors
      utils/                   money maths, dates, CSV, amount in words
      generated/prisma/        generated Prisma client (git-ignored)
    tests/                     Vitest + Supertest
    uploads/                   local file storage (git-ignored)
  frontend/
    src/
      app/login/               sign-in page
      app/(app)/               authenticated pages (one folder per sidebar item)
      components/ui/           Button, Card, DataTable, form fields, Modal, Toast, filters…
      components/layout/       AppShell (collapsible sidebar + top bar), PageHeader
      features/<module>/       module components (clients, creatives, invoices, payroll…)
      lib/api.ts               the single shared API client
      lib/                     hooks, form helper, labels, navigation, upload with progress
      types/                   API and model types
```

## 12. API reference

Base URL `/api/v1`. All endpoints except `/health`, `/auth/csrf`, `/auth/login` and `/auth/logout` require the session cookie; all non-GET requests require `X-CSRF-Token`.

**Responses:** `{ "success": true, "data": …, "meta"?: { page, pageSize, total, totalPages } }` or `{ "success": false, "error": { "code", "message", "details"? } }`. Lists accept `page`, `pageSize` (max 100) and `search`. Endpoints marked CSV accept `format=csv`.

| Area | Method & path | Notes |
| --- | --- | --- |
| Health | `GET /health` | |
| Auth | `GET /auth/csrf` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/logout-all` · `GET /auth/me` · `POST /auth/change-password` | |
| Users | `GET /auth/users` · `POST /auth/users` · `PATCH /auth/users/:id` | admin |
| Settings | `GET/PUT /settings/company` · `POST/DELETE /settings/company/logo` | write: admin |
| Templates | `GET/POST /settings/templates` · `GET/PUT/DELETE /settings/templates/:id` · `GET /settings/templates/:id/preview` · `POST/DELETE /settings/templates/:id/signature\|reference` | |
| Categories | `GET /settings/categories?type=EXPENSE\|INCOME` · `POST /settings/categories` · `PATCH /settings/categories/:id` | |
| Files | `GET /files/:id` (inline) · `GET /files/:id/download` | role checked per file category |
| Dashboard | `GET /dashboard?from&to` | finance |
| Clients | `GET/POST /clients` · `GET /clients/options` · `GET/PUT /clients/:id` · `POST /clients/:id/archive\|restore` · `GET /clients/:id/summary` · `GET /clients/:id/activity` | |
| Client services | `POST /clients/:id/services` · `PUT/DELETE /clients/:id/services/:serviceId` | |
| Creatives | `GET /creatives` · `GET /creatives/campaigns` · `GET/POST /clients/:id/creatives` · `GET/PUT/DELETE /clients/:id/creatives/:creativeId` · `POST /clients/:id/creatives/:creativeId/files` · `DELETE …/files/:fileId` | multipart `files[]`; filters `month, campaign, platform, contentType, status` |
| Agreements | `GET/POST /agreements` · `GET/PUT /agreements/:id` · `POST /agreements/:id/archive\|restore` · `POST /agreements/:id/documents` · `DELETE /agreements/:id/documents/:fileId` | filter `renewal=DUE_SOON\|EXPIRED` |
| Projects | `GET/POST /projects` · `GET/PUT/DELETE /projects/:id` | |
| Invoices | `GET /invoices` (CSV) · `POST /invoices` · `POST /invoices/generate` · `POST /invoices/generate-monthly` · `GET/PUT/PATCH/DELETE /invoices/:id` · `POST /invoices/:id/issue\|cancel\|revise` · `GET /invoices/:id/pdf[?download=1]` · `GET/POST /invoices/:id/payments` | PUT/DELETE drafts only; PATCH = due date/notes/terms |
| Payments | `GET /payments` (CSV) · `POST /payments` · `GET /payments/:id` · `POST /payments/:id/void` · `POST /payments/:id/proof` · `GET /payments/:id/receipt` | multipart; send `idempotencyKey` |
| Employees | `GET/POST /employees` · `GET/PUT /employees/:id` · `POST /employees/:id/salary-structures` · `DELETE /employees/:id/salary-structures/:structureId` | admin |
| Payroll | `GET/POST /payroll` · `POST /payroll/generate` · `GET/PUT/DELETE /payroll/:id` · `POST /payroll/:id/approve\|reopen\|pay\|adjustments` · `GET /payroll/:id/payslip` · `GET /payroll/my` · `GET/POST /payroll/statutory-deductions` · `PUT /payroll/statutory-deductions/:id` | admin; employees: own paid payslips |
| Expenses | `GET /expenses` (CSV) · `POST /expenses` · `GET/PUT /expenses/:id` · `POST /expenses/:id/void` | multipart `receipt` |
| Other income | `GET /income` (CSV) · `POST /income` · `GET/PUT /income/:id` · `POST /income/:id/void` | multipart `attachment` |
| Client portal | `GET /portal/me` · `GET /portal/creatives` · `GET /portal/creatives/campaigns` · `GET /portal/creatives/:id` · `GET /portal/creatives/:id/download` (streamed ZIP) | CLIENT role only, scoped to the linked client |
| Ad campaigns | `GET /ad-campaigns` (CSV) · `POST /ad-campaigns` · `GET/PUT/DELETE /ad-campaigns/:id` · `GET /ad-campaigns/creative-options?clientId` | staff and employees read and write; employee deletes become approval requests; filters `clientId, platform, campaignType, status, from, to` |
| Work log | `GET /work-logs` (CSV) · `POST /work-logs` · `PUT/DELETE /work-logs/:id` · `GET /employees/options` | admin/manager: everyone; employees: own entries only; max 24 h per person per day |
| Tasks | `GET /tasks` · `POST /tasks` · `GET/PUT/DELETE /tasks/:id` · `POST /tasks/:id/status` · `POST /tasks/:id/comments` · `GET /tasks/options` | admin/manager/employee: create, edit, reassign, move, comment; employee deletes become approval requests |
| Calendar | `GET /calendar?from&to[&clientId&types&sources&mine]` · `POST /calendar/events` · `GET/PUT/DELETE /calendar/events/:id[?occurrence=YYYY-MM-DD]` · `PATCH /calendar/events/:id/move` | all internal roles view; admin/manager/employee create; employees can change any event; their deletes become approval requests. Returns events (repeats expanded) plus task due dates, creative publish dates and ad campaigns |
| Reports | `GET /reports/:type?from&to[&clientId&employeeId&entityType&action]` (CSV) · `GET /reports/audit-options` | **Money** (admin, accountant, manager): `monthly-summary`, `collections`, `other-income`, `expenses-by-category`, `expense-details`, `outstanding-invoices`, `client-wise`, `payroll-totals` · **Client Ads** (staff): `ads-by-client`, `ads-boosted-creatives`, `ads-campaigns`, `ads-by-type` · **Employee Work** (admin, manager): `work-by-employee`, `work-by-client`, `work-by-task`, `work-log` · **Audit** (admin, manager): `audit-log` |

## 13. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Invalid environment configuration` on backend start | Check `backend\.env` against `.env.example` (`JWT_SECRET` must be 32+ characters). |
| `Can't reach database server` | Start Docker Desktop, then `docker compose up -d`. |
| Frontend shows "Cannot reach the server" | Backend not running, or `NEXT_PUBLIC_API_URL` in `frontend\.env.local` is wrong. |
| "Security token missing or invalid" | Refresh the page (the CSRF token is renewed automatically on retry). |
| Port already in use | `Get-NetTCPConnection -LocalPort 4000` to find the process, or change `PORT`. |
| Issue invoice says "Set your company's legal name" | Fill in Settings › Company first. |
