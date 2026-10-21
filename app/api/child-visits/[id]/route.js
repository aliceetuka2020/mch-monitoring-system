import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody } from "@/lib/api";
export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { dates: ["visitDate", "nextVisit"], maxLengths: { reason: 500, findings: 4000, treatment: 4000 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const data = {};
  if (body.visitDate !== undefined) data.visitDate = parseDate(body.visitDate);
  if (body.reason !== undefined) data.reason = body.reason.trim();
  if (body.findings !== undefined) data.findings = (body.findings || "").trim() || null;
  if (body.treatment !== undefined) data.treatment = (body.treatment || "").trim() || null;
  if (body.nextVisit !== undefined) data.nextVisit = parseDate(body.nextVisit);
  try { const visit = await prisma.childVisit.update({ where: { id: Number(params.id) }, data, include: { recordedBy: { select: { fullName: true } } } }); return NextResponse.json({ visit }); }
  catch { return NextResponse.json({ error: "Child visit not found" }, { status: 404 }); }
}
export async function DELETE(request, { params }) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  try { await prisma.childVisit.delete({ where: { id: Number(params.id) } }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Child visit not found" }, { status: 404 }); }
}
