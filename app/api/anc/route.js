import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, num, validateApiBody } from "@/lib/api";
import { calculateGestationalAge, getPregnancyAnchor } from "@/lib/pregnancy";

export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const patientId = Number(new URL(request.url).searchParams.get("patientId"));
  const records = await prisma.ancRecord.findMany({ where: patientId ? { patientId } : {}, orderBy: { visitDate: "desc" }, include: { patient: { select: { fullName: true, cardNo: true } }, pregnancy: true, recordedBy: { select: { fullName: true } } } });
  return NextResponse.json({ records });
}

export async function POST(request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: ["patientId", "visitDate", "weight"], dates: ["visitDate", "nextVisit"], numbers: { weight: [20, 300] }, maxLengths: { gestationalAge: 100, symptoms: 2000, clinicalNotes: 4000, laboratoryInfo: 4000, foetalAssessment: 4000, medicationsSupplements: 4000, healthEducation: 4000, bloodPressure: 20 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const patientId = Number(body.patientId);
  if (!Number.isInteger(patientId) || patientId <= 0) return NextResponse.json({ error: "A valid mother is required" }, { status: 400 });
  const mother = await prisma.patient.findUnique({ where: { id: patientId }, select: { fullName: true } });
  if (!mother) return NextResponse.json({ error: "Mother not found" }, { status: 404 });
  let pregnancy = null;
  if (body.pregnancyId) {
    pregnancy = await prisma.pregnancy.findFirst({ where: { id: Number(body.pregnancyId), patientId } });
    if (!pregnancy) return NextResponse.json({ error: "Selected pregnancy does not belong to this mother" }, { status: 400 });
  } else {
    pregnancy = await prisma.pregnancy.findFirst({ where: { patientId, status: "ONGOING" }, orderBy: { createdAt: "desc" } });
  }
  const visitDate = parseDate(body.visitDate);
  const gestationalAge = pregnancy ? calculateGestationalAge(getPregnancyAnchor(pregnancy), visitDate) : null;
  const nextVisit = parseDate(body.nextVisit);
  const record = await prisma.ancRecord.create({ data: { patientId, pregnancyId: pregnancy?.id ?? null, visitDate, gestationalAge: gestationalAge || (body.gestationalAge || "").trim() || "Not recorded", weight: num(body.weight), bloodPressure: (body.bloodPressure || "").trim(), symptoms: (body.symptoms || "").trim() || null, clinicalNotes: (body.clinicalNotes || "").trim() || null, laboratoryInfo: (body.laboratoryInfo || "").trim() || null, foetalAssessment: (body.foetalAssessment || "").trim() || null, medicationsSupplements: (body.medicationsSupplements || "").trim() || null, healthEducation: (body.healthEducation || "").trim() || null, nextVisit, recordedById: session.id } });
  if (nextVisit) await prisma.notification.create({ data: { patientId, type: "ANC", message: `Antenatal visit for ${mother.fullName}`, dueDate: nextVisit } });
  return NextResponse.json({ record }, { status: 201 });
}
