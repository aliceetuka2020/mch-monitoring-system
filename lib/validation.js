const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{6,19}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_KEYS = new Set(["date", "dateOfBirth", "visitDate", "measurementDate", "dateGiven", "nextVisit", "nextDueDate", "estimatedDeliveryDate", "deliveryDate", "startDate", "lastMenstrualPeriod"]);
const NUMBER_RULES = {
  weight: [0.3, 300],
  birthWeight: [0.3, 8],
  height: [20, 250],
  headCircumference: [10, 100],
  ageInMonths: [0, 1200],
};

export function isValidDate(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== "string" || value.trim() === "") return false;
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (isoDate) {
    const [, yearText, monthText, dayText] = isoDate;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) return "Password must be at least 8 characters long";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Password must contain at least one letter and one number";
  return null;
}

export function validatePayload(body, rules = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "A valid JSON object is required";
  for (const key of rules.required || []) {
    const value = body[key];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) return `${rules.labels?.[key] || key} is required`;
  }
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      if (value.length > (rules.maxLengths?.[key] || 5000)) return `${key} must be no longer than ${rules.maxLengths?.[key] || 5000} characters`;
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) return `${key} contains unsupported control characters`;
    }
    if (value !== "" && DATE_KEYS.has(key) && !isValidDate(value)) return `${key} must be a valid date`;
    if (value !== "" && NUMBER_RULES[key]) {
      const number = Number(value);
      const [min, max] = NUMBER_RULES[key];
      if (!Number.isFinite(number) || number < min || number > max) return `${key} must be between ${min} and ${max}`;
    }
    if (["phone", "guardianPhone"].includes(key) && value && !PHONE_PATTERN.test(String(value))) return `${key} must be a valid phone number`;
    if (key.toLowerCase().includes("email") && value && !EMAIL_PATTERN.test(String(value))) return `${key} must be a valid email address`;
    if (rules.strings?.includes(key) && value !== null && value !== undefined && typeof value !== "string") return `${key} must be text`;
  }
  for (const key of rules.dates || []) if (body[key] !== undefined && body[key] !== null && body[key] !== "" && !isValidDate(body[key])) return `${key} must be a valid date`;
  for (const [key, range] of Object.entries(rules.numbers || {})) {
    if (body[key] === undefined || body[key] === null || body[key] === "") continue;
    const number = Number(body[key]);
    if (!Number.isFinite(number) || number < range[0] || number > range[1]) return `${key} must be between ${range[0]} and ${range[1]}`;
  }
  return null;
}

export function validateBloodPressure(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\s*\d{2,3}\s*\/\s*\d{2,3}\s*$/.test(value)) return "bloodPressure must be in systolic/diastolic format, for example 110/70";
  const [systolic, diastolic] = value.split("/").map(Number);
  if (systolic < 50 || systolic > 260 || diastolic < 30 || diastolic > 160) return "bloodPressure is outside the allowed clinical range";
  return null;
}
