import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody } from "@/lib/api";
import { calculateEstimatedDeliveryDate } from "@/lib/pregnancy";

export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const patientId = Number(new URL(request.url).searchParams.get("patientId"));
  if (!Number.isInteger(patientId) || patientId <= 0) return NextResponse.json({ error: "A valid patientId is required" }, { status: 400 });
  const pregnancies = await prisma.pregnancy.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { ancRecords: true } } } });
  return NextResponse.json({ pregnancies });
}

export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: ["patientId"], dates: ["startDate", "lastMenstrualPeriod"], numbers: { gravida: [0, 20], parity: [0, 20] }, maxLengths: { status: 40, outcome: 500 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (body.status && !["ONGOING", "COMPLETED", "LOSS", "LEGACY"].includes(body.status)) return NextResponse.json({ error: "Invalid pregnancy status" }, { status: 400 });
  const patientId = Number(body.patientId);
  if (!Number.isInteger(patientId) || patientId <= 0) return NextResponse.json({ error: "A valid mother is required" }, { status: 400 });
  const startDate = parseDate(body.startDate);
  const lastMenstrualPeriod = parseDate(body.lastMenstrualPeriod);
  if (!startDate && !lastMenstrualPeriod) return NextResponse.json({ error: "Provide a pregnancy start date or last menstrual period" }, { status: 400 });
  const gravida = body.gravida === "" || body.gravida === undefined || body.gravida === null ? null : Number(body.gravida);
  const parity = body.parity === "" || body.parity === undefined || body.parity === null ? null : Number(body.parity);
  if (gravida !== null && parity !== null && parity > gravida) return NextResponse.json({ error: "Parity cannot exceed gravida" }, { status: 400 });
  const estimatedDeliveryDate = lastMenstrualPeriod ? calculateEstimatedDeliveryDate(lastMenstrualPeriod) : null;
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) return NextResponse.json({ error: "Mother not found" }, { status: 404 });
  const pregnancy = await prisma.pregnancy.create({ data: { patientId, startDate, lastMenstrualPeriod, estimatedDeliveryDate, gravida, parity, status: body.status || "ONGOING", outcome: (body.outcome || "").trim() || null } });
  if (estimatedDeliveryDate) await prisma.patient.update({ where: { id: patientId }, data: { estimatedDeliveryDate } });
  return NextResponse.json({ pregnancy }, { status: 201 });
}
