import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody } from "@/lib/api";
export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const childId = Number(new URL(request.url).searchParams.get("childId"));
  if (!Number.isInteger(childId) || childId <= 0) return NextResponse.json({ error: "A valid childId is required" }, { status: 400 });
  const visits = await prisma.childVisit.findMany({ where: { childId }, orderBy: { visitDate: "desc" }, include: { recordedBy: { select: { fullName: true } } } });
  return NextResponse.json({ visits });
}
export async function POST(request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: ["childId", "visitDate", "reason"], dates: ["visitDate", "nextVisit"], maxLengths: { reason: 500, findings: 4000, treatment: 4000 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const childId = Number(body.childId);
  if (!Number.isInteger(childId) || childId <= 0) return NextResponse.json({ error: "A valid childId is required" }, { status: 400 });
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { id: true } });
  if (!child) return NextResponse.json({ error: "Child not found" }, { status: 404 });
  const visit = await prisma.childVisit.create({ data: { childId, visitDate: parseDate(body.visitDate), reason: body.reason.trim(), findings: (body.findings || "").trim() || null, treatment: (body.treatment || "").trim() || null, nextVisit: parseDate(body.nextVisit), recordedById: session.id }, include: { recordedBy: { select: { fullName: true } } } });
  return NextResponse.json({ visit }, { status: 201 });
}
