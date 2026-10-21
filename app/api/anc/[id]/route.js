import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, num, validateApiBody } from "@/lib/api";
import { calculateGestationalAge, getPregnancyAnchor } from "@/lib/pregnancy";

export async function PATCH(request, { params }) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { dates: ["visitDate", "nextVisit"], numbers: { weight: [20, 300] }, maxLengths: { gestationalAge: 100, symptoms: 2000, clinicalNotes: 4000, laboratoryInfo: 4000, foetalAssessment: 4000, medicationsSupplements: 4000, healthEducation: 4000, bloodPressure: 20 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  try {
    const current = await prisma.ancRecord.findUnique({ where: { id: Number(params.id) } });
    if (!current) return NextResponse.json({ error: "ANC record not found" }, { status: 404 });
    const data = { recordedById: session.id };
    const visitDate = body.visitDate !== undefined ? parseDate(body.visitDate) : current.visitDate;
    if (body.visitDate !== undefined) data.visitDate = visitDate;
    if (body.weight !== undefined) data.weight = num(body.weight);
    for (const key of ["bloodPressure", "symptoms", "clinicalNotes", "laboratoryInfo", "foetalAssessment", "medicationsSupplements", "healthEducation"]) if (body[key] !== undefined) data[key] = (body[key] || "").trim() || (key === "bloodPressure" ? "" : null);
    if (body.nextVisit !== undefined) data.nextVisit = parseDate(body.nextVisit);
    let pregnancyId = body.pregnancyId !== undefined ? (body.pregnancyId ? Number(body.pregnancyId) : null) : current.pregnancyId;
    let pregnancy = pregnancyId ? await prisma.pregnancy.findFirst({ where: { id: pregnancyId, patientId: current.patientId } }) : null;
    if (pregnancyId && !pregnancy) return NextResponse.json({ error: "Selected pregnancy does not belong to this mother" }, { status: 400 });
    if (body.pregnancyId !== undefined) data.pregnancyId = pregnancyId;
    if (pregnancy) data.gestationalAge = calculateGestationalAge(getPregnancyAnchor(pregnancy), visitDate) || (body.gestationalAge || current.gestationalAge);
    else if (body.gestationalAge !== undefined) data.gestationalAge = (body.gestationalAge || "").trim() || "Not recorded";
    const record = await prisma.ancRecord.update({ where: { id: current.id }, data });
    return NextResponse.json({ record });
  } catch { return NextResponse.json({ error: "ANC record not found" }, { status: 404 }); }
}

export async function DELETE(request, { params }) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  try { await prisma.ancRecord.delete({ where: { id: Number(params.id) } }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "ANC record not found" }, { status: 404 }); }
}
