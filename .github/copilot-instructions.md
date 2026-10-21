# GitHub Copilot instructions — MCH Monitoring System

## Project overview
This repository contains the Web-Based Maternal and Child Healthcare Monitoring System for Karu Primary Healthcare Centre. It is a Next.js 14 App Router application using React 18, Prisma with PostgreSQL, and `bcryptjs` for password hashing. Vitest is used for unit and API integration tests, and Playwright is used for browser end-to-end tests.

The system manages administrator and health-worker accounts; maternal registration and antenatal care (ANC); delivery and postnatal records; child registration and visits; immunizations; growth measurements; mother/child appointments; reminders; dashboards and reports; CSV export; facility settings; session expiry; access controls; and local database backups.

## Repository map
- `app/`: Next.js App Router pages and route handlers. API routes live under `app/api/`.
- `app/(app)/`: authenticated application pages such as dashboard, patients, children, appointments, reports, users, notifications, and settings.
- `components/`: reusable UI components, including logout and activity tracking.
- `lib/`: shared authentication, validation, formatting, Prisma access, scheduling, health checks, reminders, and login throttling.
- `prisma/schema.prisma`: central database schema and relationships.
- `prisma/seed.js`: development/test seed data.
- `scripts/`: test runner, backups, data migration, and reminder dispatch.
- `tests/`: unit and API integration tests; use synthetic fixtures and never commit test database files or patient data.

Read `README.md`, `prisma/migrations/README.md` (when schema/migration work is involved), the relevant route/page, shared library, schema models, and related tests before changing behavior.

## Commands
Run from the repository root:
- Install dependencies: `npm install`
- Start development server: `npm run dev`
- Production build: `npm run build`
- Start production server: `npm run start`
- Apply Prisma schema: `npx prisma db push`
- Seed database: `npm run db:seed`
- Migrate/backfill existing data: `npm run db:migrate-data`
- Run unit tests: `npm run test:unit`
- Run unit and API integration tests with the isolated PostgreSQL test database: `npm test`
- Run browser end-to-end tests: `npm run test:e2e`
- Create a database backup: `npm run db:backup`
- Run reminder dispatch: `npm run reminders:run`

The test script (`scripts/run-tests.js`) applies the Prisma schema to the disposable PostgreSQL database in `TEST_DATABASE_URL` and runs Vitest with `DATABASE_URL` set to that test database. Inspect this script before changing test execution. Do not run tests against a production database.

## Architecture and domain rules
- Reuse the shared Prisma client from `lib/prisma.js`; do not create ad hoc Prisma clients.
- Keep request handlers, authentication/authorization, validation, persistence, and UI responsibilities separated according to existing patterns.
- Inspect both API route handlers and their corresponding UI/shared logic because feature behavior may span multiple layers.
- An `Appointment` belongs to a mother (`Patient`) and may optionally reference one of that mother's children. Validate this relationship; child appointment reminders are recorded against the mother and should identify the child.
- Child records belong to a mother. ANC records, delivery records, postnatal records, appointments, and notifications are associated with maternal records. Immunizations, growth records, visits, and child appointments are associated with child records.
- Preserve the existing cascade/set-null relationship behavior unless a deliberate, documented schema change is required.
- Use the existing naming conventions and validation utilities. Validate dates, numeric measurements, identifiers, enums/status strings, and relationships on the server, not only in browser forms.
- Preserve the current Next.js 14 / React 18 stack unless a framework upgrade is explicitly requested. Avoid unnecessary dependency upgrades.

## Security, privacy, and clinical safety
- Preserve the authentication/session checks and server-side role checks in `lib/auth.js`, API routes, and page handlers.
- Administrator-only actions include deleting patient/child/clinical records, changing system settings, managing users, and exporting reports. Never rely on hiding a UI control as the only authorization mechanism.
- Keep password hashing, session signing, cookie settings, inactivity expiry, and login throttling intact. Production must use a strong private `AUTH_SECRET`; never commit secrets or print them in logs.
- Treat maternal and child health records as sensitive personal and clinical data. Do not expose records across unauthorized accounts, include unnecessary personal details in logs, or use real patient data in tests.
- Never present the simplified local weight-for-age label as a definitive diagnosis or substitute for clinical judgment. Preserve clear limitations around clinical decision support.
- Reminder dispatch currently uses a console provider by default; do not claim it sends real SMS messages unless an actual provider has been configured and verified.
- Do not perform destructive database changes, production migrations, bulk deletions, or real patient notifications without explicit authorization.

## UI and implementation conventions
- Follow the existing page/component patterns and styling conventions; avoid introducing a second design system.
- Prefer shared validation and formatting helpers in `lib/` over duplicated ad hoc logic.
- Keep loading, empty, success, and error states accessible and clear.
- Use server-side validation and safe error responses; do not leak stack traces, credentials, session tokens, or database details to users.
- Preserve unrelated changes and avoid broad refactors when a focused fix is sufficient.

## Testing expectations
- Before changing behavior, read `README.md`, `package.json`, `vitest.config.mts`, `playwright.config.ts` when browser tests apply, the relevant page/API route, shared libraries, Prisma models, and related tests. Review `prisma/migrations/README.md` when schema or migration work is involved.
- Confirm intended behavior from project documentation and existing implementation; do not invent clinical rules or silently change documented behavior. Identify normal cases, invalid input, boundaries, authorization rules, relationships, and failure/recovery scenarios.
- Inspect available scripts and the test runner before executing tests. Establish a safe baseline with the narrowest relevant test, then run related regression tests. Record exact commands, failing assertions, exceptions, stack traces, and exit status.
- Diagnose each failure before editing. Determine whether it is caused by production code, a flawed test, test setup/configuration, dependency behavior, or an unavailable service. Trace relevant behavior through the UI, API route, validation/auth helper, Prisma operation, and schema as needed. Distinguish confirmed defects from inference and environment blockers.
- Add or update meaningful tests at the appropriate unit, API integration, or browser end-to-end level. Test observable requirements, including successful flows, invalid input, authorization boundaries (including direct API requests that bypass the UI), missing records, database relationships, duplicate submissions, concurrency where relevant, date/time and measurement boundaries, and failure/recovery behavior.
- Cover affected behavior such as login/password handling, throttling, session expiry and logout; maternal registration/card numbers/history; ANC, delivery and postnatal records; child registration, mother-child links, guardian defaults and visits; immunization and due dates; growth validation and age calculations; appointments and reminders; notifications and provider failures; report filtering/CSV authorization; user management, settings, database constraints, and delete/cascade/set-null behavior.
- Use synthetic fixtures and the isolated test database only. Never use real patient information. `npm test` invokes `scripts/run-tests.js`, which requires `TEST_DATABASE_URL` to point to a disposable PostgreSQL database, applies the Prisma schema there, and runs Vitest. Inspect the script before changing test execution; never run tests or destructive cleanup against production or valuable data.
- For defects, follow **Understand → Baseline → Test → Diagnose → Fix → Retest → Verify**. Implement the smallest reliable root-cause fix and add/update a regression test. Preserve authentication, authorization, validation, auditability, privacy, and data relationships. If a test contradicts documented intent, explain the evidence before revising it; do not change correct production behavior merely to satisfy a faulty assertion.
- Never delete valid tests, weaken meaningful assertions, skip tests, suppress exceptions, or mock away the behavior under test merely to obtain passing results. Do not disable security protections to make tests pass. Do not claim a feature works based on one unit test or report tests as passing without checking command output.
- After a meaningful fix, rerun the failing test, its full test file or focused suite, and related regression tests. Run `npm test` when practical and safe, plus `npm run build` and `npx prisma validate` when applicable. For UI/browser behavior, run the relevant Playwright test. Inspect the final diff for unintended changes.
- When a test task requests screenshot evidence, save it under `components/screenshot/<category>/<TEST_ID>/` using a consistent, detailed test-results dashboard modeled on `components/screenshot/unit-tests/UT-01/UT-01-evidence.html`. Include the test ID and title, truthful overall result/counts, a case-by-case breakdown of expected behavior versus observed outcome, exact test command/framework, execution result, and relevant isolation/privacy notes. For non-UI tests, render a local HTML evidence report and capture it as PNG; for UI tests, capture the relevant application state and include a detailed results summary when the page alone does not show the full test outcome. Derive all displayed statuses and counts from the actual run. Never fabricate passing results, omit failures/blockers, expose patient data/secrets, or claim a screenshot exists unless it was captured and verified.
- For schema or migration changes, back up populated data with `npm run db:backup` first, review `prisma/migrations/README.md` and `scripts/migrate-data.js`, prefer additive backward-compatible changes, and verify maternal history, guardian information, growth ages, appointment links, and reminder settings remain correct. Ask for explicit approval before destructive migrations, bulk deletes, production changes, or other high-impact operations.
- After a testing/debugging task, report **Scope**, **Baseline**, **Root cause** (distinguishing evidence from inference), **Changes**, **Retest** (exact commands and actual results), **Regression/build/schema checks**, **Remaining issues or blockers**, and **Status** (passed, failed, or partially verified with a concise justification). Never fabricate results; if blocked by credentials, services, or infrastructure, complete safe independent checks and state what remains unverified.

## Data and migration safety
- Back up a populated database with `npm run db:backup` before schema changes or upgrades.
- Review `prisma/migrations/README.md` and `scripts/migrate-data.js` before changing migration/backfill behavior.
- Prefer additive, backward-compatible migrations and explicit backfills. Verify existing maternal history, guardian details, growth ages, and reminder settings remain intact.
- Never commit `prisma/dev.db`, generated backups, secrets, or test database files.
