# Web-Based Maternal and Child Healthcare Monitoring System

This is the web-based Maternal and Child Healthcare Monitoring System for Karu Primary Healthcare Centre. It uses Next.js 14 App Router, React, Prisma with PostgreSQL, and bcryptjs for password hashing.

## Modules

The application supports administrator and health-worker accounts, maternal registration and records, antenatal care, delivery and postnatal records, child registration and healthcare visits, guardian and birth details, immunization schedule tracking, growth measurements, mother and child appointments, reminders, dashboard indicators, reports, CSV export, facility settings, session expiry, access controls, validation, login throttling, and local database backup.

An appointment always belongs to a mother. It may also be linked to one of that mother's children. A child appointment reminder is recorded against the mother and names the child.

## Setup

Use Node.js 18 or later. From this project directory run `npm install`, `npx prisma db push`, `npm run db:migrate-data`, `npm run db:seed`, then `npm run dev`. Open `http://localhost:3000` in a browser. For a production deployment, configure a strong, private `AUTH_SECRET` environment variable before starting the application. Production startup stops with a clear error if it is missing. Do not commit the secret or place it in application logs.

## Default accounts

The seeded administrator account is `admin@karuphc.gov.ng` with password `Admin123!`. The seeded health-worker account is `worker@karuphc.gov.ng` with password `Worker123!`. Change both passwords after the initial sign-in. New accounts and password changes require at least eight characters with one letter and one number.

## Database upgrades

Back up a populated database with `npm run db:backup` before updating. Apply the additive Prisma schema using `npx prisma db push`, then run `npm run db:migrate-data`. The data backfill preserves old maternal history by copying it into the new previous-pregnancies field when that field is empty. It fills guardian details from each child's mother when missing, calculates stored ages for existing growth measurements, and creates the default reminder setting. The schema additions use nullable fields or safe defaults and do not delete existing records. The procedure is documented in `prisma/migrations/README.md`.

PostgreSQL is required. Set `DATABASE_URL` to the PostgreSQL connection string in the deployment environment, then run `npx prisma db push` and `npm run db:migrate-data` against a backed-up database. The runtime Prisma client reads that value. SQLite and MySQL connection strings are not supported by this project.

## Patient reminders

Patient reminder dispatch is disabled until an administrator enables **Patient reminder dispatch** in System settings. The reminder window is configured in days in the same settings panel. The Reminders page has a **Send now** action for administrators. Scheduled dispatch can be configured with `npm run reminders:run`, for example from the host's scheduler. The application supports a real Twilio SMS provider. Set `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, and optionally `SMS_DEFAULT_COUNTRY_CODE=+234` in the deployment environment. Credentials are read only from environment variables and are never logged. Without `SMS_PROVIDER=twilio`, development uses the console provider and production refuses portal OTP delivery rather than pretending that an SMS was sent.

## Tests

Run `npm test` for unit and API integration tests. The test runner applies the Prisma schema to the disposable PostgreSQL database in `TEST_DATABASE_URL`, resets records before each test, and covers authentication, registration, ANC reminders, immunization, growth age, mother and child appointments, child visits, reminder dispatch, report export, role restrictions, and invalid input. Run `npm run test:unit` for the Vitest suite without the database setup, or `npm run test:e2e` for the Playwright browser smoke test (install its browser first with `npx playwright install chromium`). To apply the schema directly, set `DATABASE_URL` to the target PostgreSQL database and use `npx prisma db push`.

## Manual test checklist based on proposal section 3.23

**User login, valid credentials**, sign in with the seeded administrator account and confirm access to the dashboard.

**User login, invalid credentials**, submit an incorrect password and confirm access is denied. After five failures, confirm further attempts are locked for fifteen minutes.

**Mother registration, complete valid information**, register a mother and confirm a card number is generated and maternal history fields are saved.

**Child registration, valid child information**, register a child and confirm the child is linked to the mother and guardian defaults are inherited when guardian fields are empty.

**ANC record, valid antenatal information**, record an antenatal visit with a next-visit date and confirm both the visit and its reminder are stored.

**Immunization, vaccine details**, record a vaccine and confirm the child immunization history and schedule status are updated.

**Growth record, weight and height**, record a measurement and confirm age at measurement and the simplified weight-for-age label appear.

**Appointment, valid date and service**, book an appointment for a mother, then book one for the mother's child and confirm the child appears in the list and reminder.

**Record search, patient ID or name**, search for a child or mother and confirm the relevant record is displayed.

**Report generation, selected criteria**, view the reports and export a CSV as an administrator. Confirm a health worker is denied CSV export.

## Access control and operational limits

Health workers can register and edit routine healthcare information. Deleting patients, children, and clinical records, changing system settings, managing users, and exporting reports are administrator-only operations enforced by the server. Login lockout counters are held in memory and clear after process restarts. A multi-instance deployment should use a shared rate-limit store. The default console reminder provider is for development and testing only. Configure Twilio for production SMS delivery. Add a real SMS provider and configure its credentials securely before patient delivery. The local weight-for-age lookup is a simplified screening aid and is not a replacement for the WHO growth standards. This system supports record management and does not replace professional clinical judgment.

The dependency audit run for this update reports one unresolved critical Next.js advisory affecting the Next.js 14 release line. The published fix requires Next.js 16.4.0, a major-version change outside the specified Next.js 14 stack, so this project retains Next.js 14.2.35. Upgrade and regression-test the framework major before exposing the deployment to the public internet. PostCSS is overridden to version 8.5.23 to resolve its production advisory.

## Database backup

Run `npm run db:backup` periodically. The script creates a timestamped copy in the `backups` directory.


## Pregnancy, antenatal care, and child identification

A mother can have multiple pregnancy records. The Pregnancy form stores the start date, last menstrual period, gravida, parity, current status, and outcome. Estimated delivery date is calculated as 280 days after the last menstrual period. ANC visits can be linked to a pregnancy, and gestational age is calculated from the linked pregnancy at the visit date. Foetal assessment, medications and supplements, and health education are stored with the ANC visit. During migration, legacy maternal estimated delivery dates and registration dates are preserved in one LEGACY pregnancy record per mother where an equivalent pregnancy record does not already exist, and unlinked historical ANC visits are linked to it.

New children receive a stable child number in the form `KPHC-CH-<sequence>`. Existing records are assigned a number by the data migration. Immunization entry uses the configured schedule of vaccine and dose pairs, with a structured Other option for extra vaccines. The next scheduled due date is prefilled when the following schedule milestone can be determined from the child's date of birth. The list and detail views display the child's identifier, birth weight, guardian details, and immunization administrator.

## Reporting and list limits

Report date and service filters apply to the appointment, ANC, delivery, postnatal, immunization, and growth record sections. Reports include appointment status totals, missed appointments, maternal visit and delivery summaries, child age and gender statistics, zero-dose children, growth measurements, scheduled-dose coverage, due and overdue vaccine follow-up, guardian contact details, and administrator account and monthly record statistics. Report CSV export is administrator-only. The browser print action uses the page's print stylesheet.

List APIs use page-based pagination. The default page size is 25 and the maximum is 100. Maternal, child, appointment, reminder, and administrator user lists expose pagination metadata. Aggregate report totals use Prisma count and grouped database queries wherever possible. Dose-level follow-up and the individual zero-dose child list query individual records because guardian contact information is required. These child-level lists can grow with the facility's registered population.

## Facility settings and session security

Administrators can configure the facility display name, the inactivity timeout from 5 to 365 minutes, and the immunization reminder window from 1 to 365 days. The facility name appears on the login screen and in the application sidebar. A valid signed cookie is not sufficient on its own, each request also checks the user record and active account state in the database, and the current database role is used for authorization. The saved inactivity setting overrides the 30-minute default.

## Backup and restore

Administrators can create a timestamped PostgreSQL custom-format backup in the `backups` directory from System settings. The command-line backup runs `pg_dump` against `DATABASE_URL` and writes a `.dump` file. Restore a selected backup with `npm run db:restore -- backups/<backup-file>.dump`, which runs `pg_restore --clean --if-exists --no-owner`. Restore is destructive to the active database, stop the application and create a current backup before running it. Keep backup files in an access-controlled location and maintain an off-device copy according to facility policy.

## Deployment upgrade sequence

For an existing installation, stop writes to the database and run `npm run db:backup` before deployment. Apply the additive schema with `npx prisma db push`, then run `npm run db:migrate-data`. This backfill assigns child numbers, creates legacy pregnancy records only when missing, links historical ANC visits, fills guardian details, computes stored growth ages, and creates defaults for facility, inactivity, and reminder settings. The script can be rerun safely and does not delete records or overwrite populated fields. See `prisma/migrations/README.md` for upgrade detail.

## Expanded verification

`npm test` covers API behavior for pregnancy registration and EDD, automatic ANC gestational age and new fields, scheduled and Other immunizations, child-number assignment, pagination, same-day appointment handling, facility settings, care-record editing, backups, data migration, authentication, authorization, report export, and validation. The production build requires `AUTH_SECRET` to be set, provide a non-production validation value when testing the build locally, and use a strong private secret in production.


To run a scheduled PostgreSQL backup with cron, create a cron entry under the operating-system account that owns the application. Replace the project, npm, log, and `DATABASE_URL` paths with the actual installation paths. The example runs daily at 2:00 a.m.

```cron
0 2 * * * cd /srv/mch-monitoring-system && DATABASE_URL="postgresql://mch_user:password@db-host:5432/mch_monitoring?schema=public" /usr/bin/npm run db:backup >> /srv/mch-monitoring-system/backup.log 2>&1
```

Cron has a limited environment, use the absolute npm path from `command -v npm` and set the same database URL used by the running application. In Windows Task Scheduler, create a daily task under the application service account, select `npm.cmd` as the program, set `run db:backup` as the arguments, and set the project root as the Start in directory. Configure the task account's `DATABASE_URL` to the same PostgreSQL database used by the application. Review backup retention and copy required backups to an access-controlled off-device location.


## Patient and guardian portal

Patients and guardians can open `/portal`, enter the maternal card number and the registered phone number, and receive a one-time verification code by SMS. After verification, the portal shows the patient’s appointments, reminders, antenatal visit count, linked children, and immunization history. Portal sessions expire after 30 days and can be revoked by signing out. The portal is read-only, and clinical records remain under staff control. Apply the additive Prisma schema with `npx prisma db push` before first use.
