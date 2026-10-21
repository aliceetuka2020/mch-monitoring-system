import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody } from "@/lib/api";
import { findScheduledDose, getNextScheduledDueDate } from "@/lib/schedule";

function resolveSelection(body) {
  if (body.vaccineName === "Other") {
    const vaccineName = (body.otherVaccineName || "").trim();
    const dose = (body.otherDose || body.dose || "").trim();
    if (!vaccineName || !dose) return { error: "Enter the vaccine and dose for an Other immunization" };
    return { vaccineName, dose, scheduled: null };
  }
  const scheduled = findScheduledDose(body.vaccineName, body.dose);
  if (!scheduled) return { error: "Select a vaccine and dose from the immunization schedule, or choose Other" };
  return { vaccineName: scheduled.vaccineName, dose: scheduled.dose, scheduled };
}

export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const childId = Number(new URL(request.url).searchParams.get("childId"));
  const records = await prisma.immunization.findMany({ where: childId ? { childId } : {}, orderBy: { dateGiven: "desc" }, include: { child: { select: { name: true, childNo: true } }, administeredBy: { select: { fullName: true } } } });
  return NextResponse.json({ records });
}

export async function POST(request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: ["childId", "vaccineName", "dateGiven"], dates: ["dateGiven", "nextDueDate"], maxLengths: { vaccineName: 200, otherVaccineName: 200, dose: 100, otherDose: 100, remarks: 2000 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const childId = Number(body.childId);
  if (!Number.isInteger(childId) || childId <= 0) return NextResponse.json({ error: "A valid child is required" }, { status: 400 });
  const selection = resolveSelection(body);
  if (selection.error) return NextResponse.json({ error: selection.error }, { status: 400 });
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { id: true, name: true, patientId: true, dateOfBirth: true } });
  if (!child) return NextResponse.json({ error: "Child not found" }, { status: 404 });
  const nextDueDate = parseDate(body.nextDueDate) || getNextScheduledDueDate(child.dateOfBirth, selection.vaccineName, selection.dose);
  const record = await prisma.immunization.create({ data: { childId, vaccineName: selection.vaccineName, dose: selection.dose, dateGiven: parseDate(body.dateGiven), nextDueDate, administeredById: session.id, remarks: (body.remarks || "").trim() || null }, include: { administeredBy: { select: { fullName: true } } } });
  if (nextDueDate) await prisma.notification.create({ data: { patientId: child.patientId, type: "IMMUNIZATION", message: `Next dose after ${selection.vaccineName} ${selection.dose} for ${child.name}`, dueDate: nextDueDate } });
  return NextResponse.json({ record }, { status: 201 });
}
