import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody } from "@/lib/api";
import { calculateEstimatedDeliveryDate } from "@/lib/pregnancy";

export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { dates: ["startDate", "lastMenstrualPeriod"], numbers: { gravida: [0, 20], parity: [0, 20] }, maxLengths: { status: 40, outcome: 500 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (body.status && !["ONGOING", "COMPLETED", "LOSS", "LEGACY"].includes(body.status)) return NextResponse.json({ error: "Invalid pregnancy status" }, { status: 400 });
  try {
    const existing = await prisma.pregnancy.findUnique({ where: { id: Number(params.id) } });
    if (!existing) return NextResponse.json({ error: "Pregnancy not found" }, { status: 404 });
    const startDate = body.startDate !== undefined ? parseDate(body.startDate) : existing.startDate;
    const lastMenstrualPeriod = body.lastMenstrualPeriod !== undefined ? parseDate(body.lastMenstrualPeriod) : existing.lastMenstrualPeriod;
    const gravida = body.gravida !== undefined ? (body.gravida === "" || body.gravida === null ? null : Number(body.gravida)) : existing.gravida;
    const parity = body.parity !== undefined ? (body.parity === "" || body.parity === null ? null : Number(body.parity)) : existing.parity;
    if (!startDate && !lastMenstrualPeriod) return NextResponse.json({ error: "A pregnancy start date or last menstrual period is required" }, { status: 400 });
    if (gravida !== null && parity !== null && parity > gravida) return NextResponse.json({ error: "Parity cannot exceed gravida" }, { status: 400 });
    const estimatedDeliveryDate = lastMenstrualPeriod ? calculateEstimatedDeliveryDate(lastMenstrualPeriod) : null;
    const pregnancy = await prisma.pregnancy.update({ where: { id: existing.id }, data: { startDate, lastMenstrualPeriod, estimatedDeliveryDate, gravida, parity, status: body.status || undefined, outcome: body.outcome !== undefined ? ((body.outcome || "").trim() || null) : undefined } });
    if (estimatedDeliveryDate) await prisma.patient.update({ where: { id: existing.patientId }, data: { estimatedDeliveryDate } });
    return NextResponse.json({ pregnancy });
  } catch { return NextResponse.json({ error: "Pregnancy not found" }, { status: 404 }); }
}

export async function DELETE(request, { params }) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  try { await prisma.pregnancy.delete({ where: { id: Number(params.id) } }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Pregnancy not found" }, { status: 404 }); }
}
