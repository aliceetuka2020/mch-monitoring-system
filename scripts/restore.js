const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.startsWith("postgres")) throw new Error("DATABASE_URL must be a PostgreSQL connection string");
  const selected = process.argv[2];
  if (!selected) throw new Error("Choose a backup file, for example npm run db:restore -- backups/mch-2026-10-12T12-00-00-000Z.dump");
  const backupPath = path.resolve(process.cwd(), selected);
  if (!fs.existsSync(backupPath) || !fs.statSync(backupPath).isFile()) throw new Error(`Backup file does not exist: ${backupPath}`);
  if (!backupPath.endsWith(".dump")) throw new Error("PostgreSQL restore expects a .dump file created by pg_dump");
  const result = spawnSync("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", databaseUrl, backupPath], { stdio: "inherit" });
  if (result.error) throw new Error(`Could not run pg_restore: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status || 1);
  console.log(`Restored ${backupPath} to the PostgreSQL database configured by DATABASE_URL`);
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
