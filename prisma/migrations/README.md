# Data-preserving schema updates

This project uses PostgreSQL as its only Prisma datasource. Set `DATABASE_URL` to the intended PostgreSQL database before running Prisma or migration commands. New schema changes are additive, nullable, or given safe defaults so existing maternal, child, clinical, account, portal, and settings records remain valid.

Before applying schema changes or data backfills to an installation with real records, stop application writes and create a verified PostgreSQL custom-format backup with `npm run db:backup`. Run `DATABASE_URL=postgresql://... npx prisma validate`, `DATABASE_URL=postgresql://... npx prisma db push`, and `DATABASE_URL=postgresql://... npm run db:migrate-data` from the project root. `db push` updates the configured schema and does not create a migration history. Review the target `DATABASE_URL` before every command.

Restore a PostgreSQL backup with `DATABASE_URL=postgresql://... npm run db:restore -- backups/<backup-file>.dump`. The restore command uses `pg_restore --clean --if-exists --no-owner` and is destructive to the selected database. Stop the application and create a fresh backup before restoring. Keep backup files in an access-controlled location.

The test runner requires `TEST_DATABASE_URL` to point to a disposable PostgreSQL database. It never falls back to SQLite and must never point to a production or valuable database.
