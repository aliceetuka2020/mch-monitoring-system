# Deploying to Vercel with Supabase

## Import the application

1. Sign in to [Vercel](https://vercel.com/) and choose **Add New → Project**.
2. Import `aliceetuka2020/mch-monitoring-system` from GitHub.
3. Set **Root Directory** to `.`. The repository root is already the Next.js application.
4. Keep the detected Next.js framework and default build settings (`npm run build`). Use Node.js 20.9 or later.
5. Add the environment variables below before deploying. Select **Production** for production credentials. Do not expose the production database to Preview deployments; use a separate Supabase staging project and separate `AUTH_SECRET` for Preview.

## Required production environment variables

Create these under **Project → Settings → Environment Variables**. Enter the values directly in Vercel; never commit or paste secrets into source files, chat, or screenshots.

| Name | Value to enter | Scope |
| --- | --- | --- |
| `DATABASE_URL` | Supabase **Transaction pooler** connection string (port `6543`). For Prisma 5 with Supavisor, ensure the query string contains `pgbouncer=true`. | Production |
| `DIRECT_URL` | Supabase **Session pooler** connection string (port `5432`), or the direct database connection if the network supports it. Prisma uses this for schema operations. | Production |
| `AUTH_SECRET` | A new, random secret with at least 32 random bytes. Generate locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the output directly into Vercel. | Production |

Get both connection strings from the Supabase project **Connect** dialog. Use the Supavisor connection strings and the database password for that project. If the password contains URL-reserved characters, use the URL-encoded password supplied by Supabase or encode it before constructing the URL. Do not use a Supabase `anon` or `service_role` API key for either database URL.

`DIRECT_URL` is configured in `prisma/schema.prisma` so Prisma Client uses the pooled `DATABASE_URL` at runtime while Prisma schema commands use the direct/session connection. Both variables must exist in Vercel because Prisma Client generation runs during installation/build.

## Optional SMS environment variables

If the deployed system must send portal OTPs or patient reminders through Twilio, add all of these as **Production** variables:

| Name | Value |
| --- | --- |
| `SMS_PROVIDER` | `twilio` |
| `TWILIO_ACCOUNT_SID` | Account SID from Twilio |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token (mark as sensitive/secret) |
| `TWILIO_FROM` | The Twilio sender number, in international format |
| `SMS_DEFAULT_COUNTRY_CODE` | Optional; defaults to `+234` |

Leave SMS unconfigured until Twilio credentials and a permitted sender are ready. Production portal OTP delivery will return an error if Twilio is not configured.

Do **not** add `TEST_DATABASE_URL` or `ALLOW_DEMO_SEED` to the Vercel Production environment. `TEST_DATABASE_URL` must only ever point to a disposable test database.

## First deployment and database

The Supabase database was already synced with the Prisma schema during setup. Do not run `prisma db push` automatically as part of every Vercel deployment. For a later schema change, back up the database, set both `DATABASE_URL` and `DIRECT_URL` in a local private environment, review the schema diff, then apply the schema deliberately.

After saving or changing Vercel environment variables, create a new deployment so the build and functions receive them. Confirm the deployment is **Ready**, then open its URL and test login and the main workflows.

Before inviting users, change all seeded/demo account passwords and disable accounts that are not needed. Use only authorized user accounts for real patient data.

## Vercel platform limitations

- The application's backup screen writes `.dump` files to the local filesystem. Vercel function filesystems are ephemeral, so those files are not durable backups and may not be available to a later request. Use Supabase's managed backups or an independently secured backup destination.
- Login throttling is held in process memory. It is not shared between Vercel function instances; use a shared rate-limit store before relying on it for a public production deployment.
- Scheduled reminder dispatch is not automatically configured by this deployment guide. The current in-app administrator action can dispatch reminders manually; add and test a secured scheduler before relying on automatic delivery.
