import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody } from "@/lib/api";
const allowed = ["SCHEDULED", "COMPLETED", "CANCELLED", "MISSED"];
export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { dates: ["date"], maxLengths: { type: 80, time: 20, notes: 2000 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (body.status && !allowed.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const date = body.date !== undefined ? parseDate(body.date) : undefined;
  const childId = body.childId !== undefined ? (body.childId ? Number(body.childId) : null) : undefined;
  try {
    const existing = await prisma.appointment.findUnique({ where: { id: Number(params.id) }, select: { id: true, patientId: true } });
    if (!existing) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    if (childId) {
      const child = await prisma.child.findFirst({ where: { id: childId, patientId: existing.patientId } });
      if (!child) return NextResponse.json({ error: "Selected child does not belong to the appointment mother" }, { status: 400 });
    }
    const appointment = await prisma.appointment.update({ where: { id: existing.id }, data: { status: body.status || undefined, date, childId, time: body.time !== undefined ? ((body.time || "").trim() || null) : undefined, type: body.type !== undefined ? (body.type || "Antenatal").trim() : undefined, notes: body.notes !== undefined ? ((body.notes || "").trim() || null) : undefined }, include: { patient: { select: { id: true, fullName: true, cardNo: true } }, child: { select: { id: true, name: true } } } });
    return NextResponse.json({ appointment });
  } catch { return NextResponse.json({ error: "Appointment not found" }, { status: 404 }); }
}
