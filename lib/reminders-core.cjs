const { PrismaClient } = require("@prisma/client");
const defaultPrisma = new PrismaClient(process.env.DATABASE_URL ? { datasources: { db: { url: process.env.DATABASE_URL } } } : {});
function formatPatientReminder(notification, locale = "en-GB") {
  const date = new Date(notification.dueDate).toLocaleDateString(locale);
  const service = notification.message || notification.type;
  return `Hello ${notification.patient.fullName}, reminder for ${service} on ${date}. Please contact Karu Primary Healthcare Centre if you need to reschedule.`;
}
const consoleProvider = { channel: "console", async send({ to, message }) { console.log(`[patient-reminder] to=${to} message=${message}`); return { accepted: true }; } };
function twilioProvider() {
  return { channel: "sms", async send({ to, message }) {
    const recipient = String(to || "").replace(/[\s().-]/g, "");
    const normalized = recipient.startsWith("+") ? recipient : recipient.startsWith("0") ? `${process.env.SMS_DEFAULT_COUNTRY_CODE || "+234"}${recipient.slice(1)}` : recipient;
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error("Recipient phone number must be in international format");
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!accountSid || !authToken || !from) throw new Error("Twilio SMS configuration is incomplete");
    const body = new URLSearchParams({ To: normalized, From: from, Body: message });
    return fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body }).then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || `SMS provider rejected the message (${response.status})`); return { accepted: true, id: data.sid }; });
  } };
}
function configuredProvider() { return process.env.SMS_PROVIDER === "twilio" ? twilioProvider() : consoleProvider; }
async function dispatchReminders({ prismaClient = defaultPrisma, provider = configuredProvider(), now = new Date(), force = false } = {}) {
  const settings = await prismaClient.setting.findMany({ where: { key: { in: ["patientRemindersEnabled", "reminderWindowDays"] } } });
  const config = Object.fromEntries(settings.map((row) => [row.key, row.value]));
  if (!force && config.patientRemindersEnabled !== "true") return { sent: 0, skipped: "Patient reminders are disabled in settings" };
  const days = Number(config.reminderWindowDays || 14); const windowDays = Number.isFinite(days) ? Math.max(1, Math.min(365, days)) : 14; const until = new Date(now.getTime() + windowDays * 86400000);
  const notifications = await prismaClient.notification.findMany({ where: { status: "PENDING", dueDate: { gte: now, lte: until } }, orderBy: { dueDate: "asc" }, include: { patient: { select: { fullName: true, phone: true } } } });
  let sent = 0; const failures = [];
  for (const notification of notifications) { try { const message = formatPatientReminder(notification); await provider.send({ to: notification.patient.phone, message, notification }); await prismaClient.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date(), channel: provider.channel || "custom" } }); sent += 1; } catch (error) { failures.push({ id: notification.id, error: error instanceof Error ? error.message : "Provider delivery failed" }); } }
  return { sent, considered: notifications.length, failures, channel: provider.channel || "custom" };
}
module.exports = { dispatchReminders, formatPatientReminder, consoleProvider, defaultPrisma };
