import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody } from "@/lib/api";
export async function GET(request, { params }) {
  const { error } = await requireAuth(undefined, "patients.view");
  if (error) return error;
  const patient = await prisma.patient.findUnique({ where: { id: Number(params.id) }, include: { pregnancies: { orderBy: { createdAt: "desc" } }, ancRecords: { orderBy: { visitDate: "desc" }, include: { recordedBy: { select: { fullName: true } }, pregnancy: true } }, children: { orderBy: { id: "asc" }, include: { immunizations: { include: { administeredBy: { select: { fullName: true } } } }, growthRecords: true, visits: true } }, appointments: { orderBy: { date: "desc" }, include: { child: { select: { name: true } } } }, deliveries: { orderBy: { deliveryDate: "desc" } }, postnatalRecords: { orderBy: { visitDate: "desc" } } } });
  if (!patient) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  return NextResponse.json({ patient });
}
export async function PUT(request, { params }) {
  const { error } = await requireAuth(undefined, "patients.update_demographics");
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { dates: ["dateOfBirth", "estimatedDeliveryDate"], maxLengths: { fullName: 200, phone: 30, address: 1000, previousPregnancies: 4000, pregnancyHistory: 4000, medicalHistory: 4000, riskFactors: 4000, pregnancyInformation: 4000, clinicalObservations: 4000, followUpInformation: 4000, gestationalAgeAtRegistration: 100 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const data = {};
  for (const key of ["fullName", "phone", "address", "bloodGroup", "genotype", "nextOfKin", "previousPregnancies", "pregnancyHistory", "medicalHistory", "riskFactors", "pregnancyInformation", "clinicalObservations", "followUpInformation", "gestationalAgeAtRegistration"]) if (body[key] !== undefined) data[key] = typeof body[key] === "string" ? body[key].trim() : body[key];
  for (const key of ["dateOfBirth", "estimatedDeliveryDate"]) if (body[key] !== undefined) data[key] = parseDate(body[key]);
  try { const patient = await prisma.patient.update({ where: { id: Number(params.id) }, data }); return NextResponse.json({ patient }); }
  catch { return NextResponse.json({ error: "Record not found" }, { status: 404 }); }
}
export async function DELETE(request, { params }) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  try { await prisma.patient.delete({ where: { id: Number(params.id) } }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Record not found" }, { status: 404 }); }
}
