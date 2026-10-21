# RBAC implementation report

## Scope completed

The application now contains a normalized 20-role catalog, a granular permission registry, database tables for roles and permissions, an idempotent development seeder, server-side role validation, expanded account management, focused RBAC tests, and implementation documentation.

The existing `ADMIN` and `HEALTH_WORKER` values remain accepted so existing accounts and tests do not break. New demo accounts use the normalized role identifiers from the implementation brief.

## Files added

| File | Purpose |
|---|---|
| `lib/rbac.js` | Runtime role definitions, permission identifiers, role mappings, and permission helpers |
| `lib/rbac-seed.cjs` | CommonJS seed definitions compatible with the existing Prisma seed command |
| `DEMO_LOGIN_CREDENTIALS.md` | Development-only credentials and account-management guidance |
| `RBAC_ROLE_PERMISSION_MATRIX.md` | Role-permission matrix with implementation status and missing-module notes |
| `tests/rbac.unit.test.js` | Tests for all 20 roles and least-privilege rules |
| `RBAC_IMPLEMENTATION_REPORT.md` | This implementation and verification report |

## Files modified

| File | Change |
|---|---|
| `prisma/schema.prisma` | Added optional usernames and `Role`, `Permission`, and `RolePermission` models |
| `prisma/seed.js` | Replaced the two-account seed with a production-guarded, repeatable RBAC seed for 20 accounts and permissions |
| `lib/api.js` | Added permission-aware server-side authorization while retaining existing role checks |
| `app/api/users/route.js` | Accepts only approved legacy or normalized roles |
| `app/api/users/[id]/route.js` | Validates role changes against the approved catalog |
| `app/api/auth/me/route.js` | Returns server-derived effective permissions for display and testing |
| `app/(app)/layout.js` | Shows user management navigation only when the server-derived role has `users.view` |
| `app/(app)/users/UsersClient.js` | Displays and assigns all approved roles |

## Commands

Use a development or disposable test PostgreSQL database.

```sh
npm install
export DATABASE_URL='postgresql://mch_user:change-me@localhost:5432/mch_monitoring?schema=public'
npx prisma db push
npm run db:seed
npm run dev
```

For the full integration suite, configure `TEST_DATABASE_URL` to a disposable PostgreSQL database and run `npm test`. The test runner applies the schema to that database before running Vitest.

## Verification performed

Prisma schema validation passed using a placeholder PostgreSQL URL without connecting to a database.

The database-independent tests passed, 19 tests across three files, including all existing unit tests, existing feature unit tests, and the new RBAC tests.

The Next.js production build compiled successfully and completed with exit code zero. During page data collection it logged database connection errors because no PostgreSQL server was available at `localhost:5432`. Those warnings are environmental and do not indicate a compilation error.

The full `npm test` command was not completed because `TEST_DATABASE_URL` was not configured in the sandbox. Database integration tests, actual seeder execution, login against PostgreSQL, and repeat-seed verification therefore require a configured disposable database.

## Supported and incomplete modules

The supplied codebase contains patient, child, ANC, immunization, appointments, reminders, reports, settings, and portal functionality. Laboratory, pharmacy, facility-management, audit-log, and staff-facing patient-dashboard modules are not present. Their roles are represented in the RBAC registry with restricted permissions and are documented as partial or not implemented rather than being presented as functional modules.

The patient portal is present and read-only with OTP verification. The `patient_mother` demo account is available for role and permission testing, but it is not linked to a patient portal identity because the supplied portal architecture authenticates patients through card number, registered phone, and OTP.

## Security notes

Passwords for newly created demo accounts are bcrypt hashes. Existing demo account passwords are preserved on repeated seed runs. The seeder refuses production demo-account creation unless `ALLOW_DEMO_SEED=true` is explicitly set. Deactivated users are rejected by the existing database-backed session validation. Role assignment input is validated against the approved role catalog on the server.

The implementation deliberately does not claim facility-level or patient-level data isolation that the existing schema does not model. Those restrictions remain a follow-up requirement if multiple facilities or staff-to-patient assignments are introduced.
