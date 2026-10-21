import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, num, validateApiBody } from "@/lib/api";
import { calculateAgeInMonths } from "@/lib/health";
export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { dates: ["measurementDate"], numbers: { weight: [0.3, 300], height: [20, 250], headCircumference: [10, 100] } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  try {
    const record = await prisma.growthRecord.findUnique({ where: { id: Number(params.id) }, include: { child: { select: { dateOfBirth: true } } } });
    if (!record) return NextResponse.json({ error: "Growth record not found" }, { status: 404 });
    const measurementDate = body.measurementDate !== undefined ? parseDate(body.measurementDate) : record.measurementDate;
    const ageInMonths = calculateAgeInMonths(record.child.dateOfBirth, measurementDate);
    if (ageInMonths === null) return NextResponse.json({ error: "Measurement date cannot be before the child's date of birth" }, { status: 400 });
    const updated = await prisma.growthRecord.update({ where: { id: record.id }, data: { measurementDate: body.measurementDate !== undefined ? measurementDate : undefined, ageInMonths, weight: body.weight !== undefined ? num(body.weight) : undefined, height: body.height !== undefined ? num(body.height) : undefined, headCircumference: body.headCircumference !== undefined ? num(body.headCircumference) : undefined, observation: body.observation !== undefined ? ((body.observation || "").trim() || null) : undefined } });
    return NextResponse.json({ record: updated });
  } catch { return NextResponse.json({ error: "Growth record not found" }, { status: 404 }); }
}
export async function DELETE(request, { params }) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  try { await prisma.growthRecord.delete({ where: { id: Number(params.id) } }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Growth record not found" }, { status: 404 }); }
}
