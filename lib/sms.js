import crypto from "crypto";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function normalizePhone(phone) {
  const raw = String(phone || "").trim().replace(/[\s().-]/g, "");
  if (!raw) return "";
  if (raw.startsWith("+") && /^\+[1-9]\d{7,14}$/.test(raw)) return raw;
  if (/^0\d{10}$/.test(raw)) return `${process.env.SMS_DEFAULT_COUNTRY_CODE || "+234"}${raw.slice(1)}`;
  return raw;
}

export function smsProviderConfigured() {
  return process.env.SMS_PROVIDER === "twilio" && Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

export const twilioProvider = {
  channel: "sms",
  async send({ to, message }) {
    const recipient = normalizePhone(to);
    if (!/^\+[1-9]\d{7,14}$/.test(recipient)) throw new Error("Recipient phone number must be in international format");
    const accountSid = required("TWILIO_ACCOUNT_SID");
    const auth = Buffer.from(`${accountSid}:${required("TWILIO_AUTH_TOKEN")}`).toString("base64");
    const body = new URLSearchParams({ To: recipient, From: required("TWILIO_FROM"), Body: message });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `SMS provider rejected the message (${response.status})`);
    return { accepted: true, id: data.sid };
  },
};

export function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export function maskPhone(phone) {
  const value = normalizePhone(phone);
  return value.length > 4 ? `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : value;
}
