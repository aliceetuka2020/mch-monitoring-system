import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, num, validateApiBody } from "@/lib/api";
export async function PUT(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { dates: ["dateOfBirth"], maxLengths: { name: 200, guardianName: 200, guardianRelationship: 100, placeOfBirth: 300, deliveryType: 100, medicalHistory: 4000 }, numbers: { birthWeight: [0.3, 8] } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const id = Number(params.id);
  try {
    const current = await prisma.child.findUnique({ where: { id }, select: { id: true, patientId: true } });
    if (!current) return NextResponse.json({ error: "Child not found" }, { status: 404 });
    const patientId = body.patientId !== undefined ? Number(body.patientId) : current.patientId;
    const mother = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, fullName: true, phone: true } });
    if (!mother) return NextResponse.json({ error: "Mother not found" }, { status: 404 });
    const child = await prisma.child.update({ where: { id }, data: { name: body.name !== undefined ? body.name.trim() : undefined, patientId: body.patientId !== undefined ? patientId : undefined, dateOfBirth: body.dateOfBirth ? parseDate(body.dateOfBirth) : undefined, gender: body.gender === "Male" ? "Male" : body.gender === "Female" ? "Female" : undefined, birthWeight: body.birthWeight !== undefined ? num(body.birthWeight) : undefined, medicalHistory: body.medicalHistory !== undefined ? ((body.medicalHistory || "").trim() || null) : undefined, guardianName: body.guardianName !== undefined ? ((body.guardianName || "").trim() || mother.fullName) : undefined, guardianPhone: body.guardianPhone !== undefined ? ((body.guardianPhone || "").trim() || mother.phone) : undefined, guardianRelationship: body.guardianRelationship !== undefined ? ((body.guardianRelationship || "").trim() || "Mother") : undefined, placeOfBirth: body.placeOfBirth !== undefined ? ((body.placeOfBirth || "").trim() || null) : undefined, deliveryType: body.deliveryType !== undefined ? ((body.deliveryType || "").trim() || null) : undefined } });
    return NextResponse.json({ child });
  } catch { return NextResponse.json({ error: "Could not update child" }, { status: 404 }); }
}
export async function DELETE(request, { params }) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  try { await prisma.child.delete({ where: { id: Number(params.id) } }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Child not found" }, { status: 404 }); }
}
