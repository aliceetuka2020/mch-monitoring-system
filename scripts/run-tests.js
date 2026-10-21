const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !testDatabaseUrl.startsWith("postgres")) {
  console.error("TEST_DATABASE_URL must point to a disposable PostgreSQL test database. Tests do not fall back to SQLite.");
  process.exit(1);
}
function run(args, env) {
  const result = spawnSync(executable, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const testEnv = { ...process.env, NODE_ENV: "test", AUTH_SECRET: process.env.AUTH_SECRET || "test-only-session-secret", DATABASE_URL: testDatabaseUrl };
run(["prisma", "db", "push", "--skip-generate"], testEnv);
run(["vitest", "run"], testEnv);
