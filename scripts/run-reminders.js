const { dispatchReminders, defaultPrisma } = require("../lib/reminders-core.cjs");
async function main() {
  const result = await dispatchReminders();
  if (result.skipped) console.log(result.skipped);
  else console.log(`Reminder run finished, sent ${result.sent} reminder(s) from ${result.considered} due notifications.`);
  if (result.failures?.length) {
    console.error(`${result.failures.length} reminder(s) could not be delivered.`);
    process.exitCode = 1;
  }
}
main().catch((error) => { console.error("Reminder dispatch failed:", error); process.exitCode = 1; }).finally(async () => defaultPrisma.$disconnect());
