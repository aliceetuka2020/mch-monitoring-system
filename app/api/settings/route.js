import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, validateApiBody } from "@/lib/api";
import { DEFAULT_FACILITY_NAME, DEFAULT_INACTIVITY_MINUTES } from "@/lib/settings";

const allowed = new Set(["facilityName", "reminderWindowDays", "inactivityMinutes", "patientRemindersEnabled"]);

export async function GET() {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  const rows = await prisma.setting.findMany();
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  if (settings.facilityName === undefined) settings.facilityName = DEFAULT_FACILITY_NAME;
  if (settings.patientRemindersEnabled === undefined) settings.patientRemindersEnabled = "false";
  if (settings.reminderWindowDays === undefined) settings.reminderWindowDays = "14";
  if (settings.inactivityMinutes === undefined) settings.inactivityMinutes = String(DEFAULT_INACTIVITY_MINUTES);
  return NextResponse.json({ settings });
}

export async function PUT(request) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: [], maxLengths: { facilityName: 200 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.has(key)) return NextResponse.json({ error: `Setting ${key} cannot be changed` }, { status: 400 });
    if (key === "facilityName" && (typeof value !== "string" || !value.trim())) return NextResponse.json({ error: "facilityName must not be empty" }, { status: 400 });
    if (key === "patientRemindersEnabled" && ![true, false, "true", "false"].includes(value)) return NextResponse.json({ error: "patientRemindersEnabled must be true or false" }, { status: 400 });
    if (["reminderWindowDays", "inactivityMinutes"].includes(key) && (!Number.isInteger(Number(value)) || Number(value) < (key === "reminderWindowDays" ? 1 : 5) || Number(value) > 365)) return NextResponse.json({ error: `${key} must be a valid number` }, { status: 400 });
  }
  for (const [key, value] of Object.entries(body)) await prisma.setting.upsert({ where: { key }, create: { key, value: key === "facilityName" ? value.trim() : String(value) }, update: { value: key === "facilityName" ? value.trim() : String(value) } });
  return NextResponse.json({ ok: true });
}
