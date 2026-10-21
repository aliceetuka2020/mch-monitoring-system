const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !databaseUrl.startsWith("postgres")) {
  console.error("DATABASE_URL must be a PostgreSQL connection string, such as postgresql://user:password@host:5432/database");
  process.exit(1);
}

const targetDir = path.join(__dirname, "..", "backups");
fs.mkdirSync(targetDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(targetDir, `mch-${stamp}.dump`);
const result = spawnSync("pg_dump", ["--format=custom", "--file", target, databaseUrl], { stdio: "inherit" });
if (result.error) {
  console.error(`Could not run pg_dump: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);
console.log(`PostgreSQL backup created at ${target}`);
