import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody } from "@/lib/api";
export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const patientId = Number(new URL(request.url).searchParams.get("patientId"));
  const [deliveries, postnatal] = await Promise.all([prisma.deliveryRecord.findMany({ where: { patientId }, orderBy: { deliveryDate: "desc" } }), prisma.postnatalRecord.findMany({ where: { patientId }, orderBy: { visitDate: "desc" } })]);
  return NextResponse.json({ deliveries, postnatal });
}
export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const commonError = validateApiBody(body, { required: ["patientId", "kind"], dates: ["deliveryDate", "visitDate", "nextVisit"], maxLengths: { deliveryMode: 200, outcome: 500, facility: 300, complications: 4000, notes: 4000, motherCondition: 4000, babyCondition: 4000, feeding: 500 } });
  if (commonError) return NextResponse.json({ error: commonError }, { status: 400 });
  const patientId = Number(body.patientId);
  if (!Number.isInteger(patientId) || patientId <= 0 || !await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })) return NextResponse.json({ error: "A valid mother is required" }, { status: 400 });
  if (body.kind === "delivery") {
    const deliveryError = validateApiBody(body, { required: ["deliveryDate", "deliveryMode", "outcome"], dates: ["deliveryDate"] });
    if (deliveryError) return NextResponse.json({ error: deliveryError }, { status: 400 });
    const row = await prisma.deliveryRecord.create({ data: { patientId, deliveryDate: parseDate(body.deliveryDate), deliveryMode: body.deliveryMode.trim(), outcome: body.outcome.trim(), facility: (body.facility || "").trim() || null, complications: (body.complications || "").trim() || null, notes: (body.notes || "").trim() || null } });
    return NextResponse.json({ row }, { status: 201 });
  }
  if (body.kind !== "postnatal") return NextResponse.json({ error: "kind must be delivery or postnatal" }, { status: 400 });
  const postnatalError = validateApiBody(body, { required: ["visitDate"], dates: ["visitDate", "nextVisit"] });
  if (postnatalError) return NextResponse.json({ error: postnatalError }, { status: 400 });
  const row = await prisma.postnatalRecord.create({ data: { patientId, visitDate: parseDate(body.visitDate), motherCondition: body.motherCondition || null, babyCondition: body.babyCondition || null, feeding: body.feeding || null, complications: body.complications || null, notes: body.notes || null, nextVisit: parseDate(body.nextVisit) } });
  return NextResponse.json({ row }, { status: 201 });
}
