# Development, Database, and Testing Commands

This guide is specific to the **Web-Based Maternal and Child Healthcare Monitoring System**. Run commands from the project root—the directory containing `package.json` and `prisma/`.

> **Important:** This repository uses **Next.js 14, Prisma 5, PostgreSQL, Vitest, and Playwright** for browser end-to-end testing.

## 1. Requirements and terminal setup

Check the installed versions:

```bash
node --version
npm --version
```

The README specifies Node.js 18 or later. Use a supported Node.js LTS release for development.

If you are in the parent directory and the project is inside `next/`, enter it first:

```bash
cd next
```

For this archive, run commands in the directory where this project's `package.json` is located. Do not run Prisma commands from an unrelated parent directory.

## 2. Install Node.js dependencies

Install the dependencies recorded in `package.json`:

```bash
npm install
```

If a normal install fails because of a peer-dependency conflict, inspect the error first. As a fallback only:

```bash
npm install --legacy-peer-deps
```

Do not routinely use `--force`; it can install incompatible dependency versions. If dependencies appear corrupted, close the running dev server and try:

```bash
npm cache verify
npm install
```

Start the development server:

```bash
npm run dev
```

Then open `http://localhost:3000`.

Stop a running development server with `Ctrl+C`.

## 3. Environment configuration

The app requires PostgreSQL. Set `DATABASE_URL` and `DIRECT_URL` in a private environment file or process environment before running Prisma schema operations or the application.

For production, set a strong, private `AUTH_SECRET` in the deployment environment. Do not commit secrets to Git, paste them into test output, or include them in screenshots. Production startup is expected to fail if the required secret is missing.

If this project uses a `.env` file locally, keep it private and do not commit it. Only create or edit environment variables after checking the datasource configuration and existing `.gitignore`.

## 4. Prisma and database commands

### Initial local database setup

From the project root:

```bash
npx prisma validate
npx prisma generate
npx prisma db push
npm run db:migrate-data
npm run db:seed
```

What each command does:

- `npx prisma validate` — checks the Prisma schema.
- `npx prisma generate` — generates the Prisma Client from the schema.
- `npx prisma db push` — synchronizes the configured database schema with `prisma/schema.prisma`. It does not create a migration history.
- `npm run db:migrate-data` — runs this project's data backfill/migration script. Review `scripts/migrate-data.js` before running it on a populated database.
- `npm run db:seed` — runs `prisma/seed.js` to create seed/demo records.

The package has a `postinstall` script that runs `prisma generate`, but running the generate command explicitly is useful when you have changed the schema or need to troubleshoot generated-client issues.

### Inspect and manage the database

```bash
npx prisma studio
```

Opens Prisma Studio to browse records in the configured database. Treat displayed patient records as confidential.

```bash
npx prisma format
npx prisma validate
npx prisma generate
```

Run these after editing `prisma/schema.prisma`, then apply the schema to the intended database.

### PostgreSQL schema commands

PostgreSQL is the only database supported by this project. The current setup uses `prisma db push`, so **do not run `npx prisma migrate dev` as the normal setup command** unless you have deliberately configured Prisma migrations and reviewed the repository's migration strategy.

`npx prisma migrate dev` is intended for a configured migration workflow; it is not interchangeable with `db push`. Before switching workflows, back up the database and review `prisma/migrations/README.md`.

### Database backup

Before schema changes, upgrades, or data migration on a database containing useful records:

```bash
npm run db:backup
```

The project's backup script runs `pg_dump` and writes a timestamped custom-format `.dump` file into the `backups` directory. Confirm that the backup exists and is usable before proceeding.

### Database provider
PostgreSQL is required. Configure `DATABASE_URL` using the format shown in `.env.example`. SQLite and MySQL URLs are rejected by the application and utility scripts.

## 5. Vitest commands

Vitest is listed in `devDependencies`, and the project uses `vitest.config.mts`.

Run the project's full test workflow:

```bash
npm test
```

This invokes `scripts/run-tests.js`. The script applies the Prisma schema to the disposable PostgreSQL database specified by `TEST_DATABASE_URL`, then runs `vitest run`. Do not point `TEST_DATABASE_URL` at a production or valuable database when running tests.

Run Vitest directly:

```bash
npx vitest run
```

Run tests in watch mode during development:

```bash
npx vitest
```

Run one test file (replace the path with an existing test file):

```bash
npx vitest run tests/path/to/example.test.js
```

Run tests matching a name:

```bash
npx vitest run -t "part of the test name"
```

Show coverage only if a compatible coverage provider is installed:

```bash
npx vitest run --coverage
```

If Vitest reports that a coverage provider is missing, check installed packages before adding one. Do not install a second test framework unnecessarily.

List the project's configured scripts:

```bash
npm run
```

## 6. Playwright browser testing

Install the Chromium browser used by the Playwright configuration:

```bash
npx playwright install chromium
```

Run the browser smoke test:

```bash
npm run test:e2e
```

Playwright starts the Next.js development server automatically. The example test checks the login form without submitting credentials. Run a specific test file with:

```bash
npx playwright test e2e/example.spec.ts
```

On Linux CI machines, Playwright may require browser system dependencies; install them with `npx playwright install --with-deps chromium` in the CI image.

Run with the interactive UI:

```bash
npx playwright test --ui
```

Open the latest HTML report:

```bash
npx playwright show-report
```

These optional commands will not work until the dependency, configuration, test files, and any required app-server setup exist. Add a package script such as `"test:e2e": "playwright test"` only after configuring the project.

## 7. Run and build the application

```bash
npm run dev
npm run build
npm run start
```

- `npm run dev` starts the local development server.
- `npm run build` creates the production build.
- `npm run start` starts the production server and should be used after a successful build.

Before production deployment, configure `AUTH_SECRET`, review environment variables, back up the database, and run the relevant tests. Never use seeded demonstration credentials in a public deployment.

## 8. Other project scripts

```bash
npm run db:push
npm run db:seed
npm run db:backup
npm run db:migrate-data
npm run reminders:run
```

- `db:push` — runs `prisma db push`.
- `db:seed` — runs the seed script.
- `db:backup` — backs up the local/configured database according to the script.
- `db:migrate-data` — runs the project's data migration/backfill script.
- `reminders:run` — runs the configured reminder dispatch job. The README describes the current reminder provider as a console provider, not a real SMS gateway.

Inspect the relevant script before running it against real data.

## 9. Common troubleshooting

### Prisma Client is out of date

```bash
npx prisma generate
```

### Prisma schema validation fails

```bash
npx prisma format
npx prisma validate
```

Read the complete error and fix the schema or environment configuration; do not suppress the error.

### Database schema does not match the application

Back up the database first, confirm that the correct `DATABASE_URL` is selected, then run:

```bash
npx prisma validate
npx prisma db push
npx prisma generate
```

Run `npm run db:migrate-data` only when the project's documented backfill is needed and the target database has been backed up.

### Tests fail

1. Run `npm test` and capture the first meaningful failure.
2. Inspect the failing test, implementation, Prisma schema, and relevant logs.
3. Determine whether the cause is application code, an invalid test, test setup, or environment configuration.
4. Fix the root cause, rerun the failing test, then rerun `npm test`.
5. Do not delete tests, weaken assertions, or report success unless the commands actually pass.

### Port 3000 is already in use

Stop the other development server or choose an unused port according to the Next.js CLI options. Do not kill unrelated processes without identifying them first.

## 10. Safety checklist

- Run commands from the project root.
- Verify the active database URL before database operations.
- Back up important data before schema changes or backfills.
- Use a separate, disposable test database for tests.
- Never run destructive test cleanup against production data.
- Keep `.env` files, credentials, tokens, and patient data out of Git.
- Do not assume Playwright, Jest, Cypress, or extra Vitest coverage packages are installed; check `package.json` first.
- Record the actual test/build results and clearly report anything that could not be verified.


## Pregnancy records and database recovery

The data migration now creates a LEGACY pregnancy for a mother when no pregnancy record exists, links historical ANC records, and assigns a child number. For a populated database, stop writes and create a backup before running the migration. Apply `npx prisma db push` and then `npm run db:migrate-data`.

A PostgreSQL custom-format backup can be restored with `npm run db:restore -- backups/<backup-file>.dump`. The restore is destructive, so stop the application and create a current backup before starting it. The included backup and restore scripts use PostgreSQL `pg_dump` and `pg_restore`.


The `db:restore` npm script restores PostgreSQL custom-format dumps and is destructive to the selected database. Create a current backup before restoring.
