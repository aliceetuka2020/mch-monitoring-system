import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody } from "@/lib/api";
import { findScheduledDose, getNextScheduledDueDate } from "@/lib/schedule";

export async function PATCH(request, { params }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { dates: ["dateGiven", "nextDueDate"], maxLengths: { vaccineName: 200, dose: 100, remarks: 2000 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  try {
    const current = await prisma.immunization.findUnique({ where: { id: Number(params.id) }, include: { child: { select: { dateOfBirth: true } } } });
    if (!current) return NextResponse.json({ error: "Immunization not found" }, { status: 404 });
    const vaccineName = body.vaccineName === "Other" ? (body.otherVaccineName || "").trim() : body.vaccineName !== undefined ? (body.vaccineName || "").trim() : current.vaccineName;
    const dose = body.vaccineName === "Other" ? (body.otherDose || "").trim() : body.dose !== undefined ? (body.dose || "").trim() : current.dose;
    if (!vaccineName || !dose) return NextResponse.json({ error: "Enter the vaccine and dose" }, { status: 400 });
    const scheduled = findScheduledDose(vaccineName, dose);
    if (vaccineName !== "Other" && !scheduled && (body.vaccineName !== undefined || body.dose !== undefined)) return NextResponse.json({ error: "Select a vaccine and dose from the immunization schedule, or choose Other" }, { status: 400 });
    const nextDueDate = body.nextDueDate !== undefined ? parseDate(body.nextDueDate) : (scheduled ? getNextScheduledDueDate(current.child.dateOfBirth, vaccineName, dose) : current.nextDueDate);
    const record = await prisma.immunization.update({ where: { id: current.id }, data: { administeredById: session.id, vaccineName, dose, dateGiven: body.dateGiven !== undefined ? parseDate(body.dateGiven) : undefined, nextDueDate, remarks: body.remarks !== undefined ? ((body.remarks || "").trim() || null) : undefined }, include: { administeredBy: { select: { fullName: true } } } });
    return NextResponse.json({ record });
  } catch { return NextResponse.json({ error: "Immunization not found" }, { status: 404 }); }
}

export async function DELETE(request, { params }) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  try { await prisma.immunization.delete({ where: { id: Number(params.id) } }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Immunization not found" }, { status: 404 }); }
}
