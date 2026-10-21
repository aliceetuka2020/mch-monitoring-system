import prisma from "@/lib/prisma";

export const DEFAULT_FACILITY_NAME = "Karu Primary Healthcare Centre";
export const DEFAULT_INACTIVITY_MINUTES = 30;

export async function getSettingValue(key, fallback) {
  try {
    const setting = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
    return setting?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getFacilityName() {
  const value = await getSettingValue("facilityName", DEFAULT_FACILITY_NAME);
  return value.trim() || DEFAULT_FACILITY_NAME;
}

export async function getReminderWindowDays() {
  const value = Number(await getSettingValue("reminderWindowDays", "14"));
  return Number.isInteger(value) && value >= 1 && value <= 365 ? value : 14;
}
