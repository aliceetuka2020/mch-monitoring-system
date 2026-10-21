import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, num, validateApiBody } from "@/lib/api";
import { calculateAgeInMonths } from "@/lib/health";
export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const childId = Number(new URL(request.url).searchParams.get("childId"));
  const records = await prisma.growthRecord.findMany({ where: childId ? { childId } : {}, orderBy: { measurementDate: "desc" }, include: { child: { select: { name: true, dateOfBirth: true } } } });
  return NextResponse.json({ records });
}
export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: ["childId", "measurementDate", "weight", "height"], dates: ["measurementDate"], numbers: { weight: [0.3, 300], height: [20, 250], headCircumference: [10, 100] } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const childId = Number(body.childId);
  if (!Number.isInteger(childId) || childId <= 0) return NextResponse.json({ error: "A valid child is required" }, { status: 400 });
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { dateOfBirth: true } });
  if (!child) return NextResponse.json({ error: "Child not found" }, { status: 404 });
  const measurementDate = parseDate(body.measurementDate);
  const ageInMonths = calculateAgeInMonths(child.dateOfBirth, measurementDate);
  if (ageInMonths === null) return NextResponse.json({ error: "Measurement date cannot be before the child's date of birth" }, { status: 400 });
  const record = await prisma.growthRecord.create({ data: { childId, measurementDate, ageInMonths, weight: num(body.weight), height: num(body.height), headCircumference: num(body.headCircumference), observation: (body.observation || "").trim() || null } });
  return NextResponse.json({ record }, { status: 201 });
}
