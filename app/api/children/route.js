import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, num, validateApiBody, getPagination, paginationResult } from "@/lib/api";

const childInclude = { patient: { select: { id: true, fullName: true, cardNo: true, phone: true } }, immunizations: { orderBy: { dateGiven: "desc" }, include: { administeredBy: { select: { fullName: true } } } }, growthRecords: { orderBy: { measurementDate: "desc" } }, visits: { orderBy: { visitDate: "desc" }, include: { recordedBy: { select: { fullName: true } } } } };

export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") || "").trim();
  const where = query ? { OR: [{ name: { contains: query } }, { childNo: { contains: query } }, { patient: { fullName: { contains: query } } }] } : {};
  const pagination = getPagination(params);
  const [children, total] = await Promise.all([
    prisma.child.findMany({ where, orderBy: { id: "desc" }, skip: pagination.skip, take: pagination.take, include: childInclude }),
    prisma.child.count({ where }),
  ]);
  return NextResponse.json({ children, pagination: paginationResult(pagination.page, pagination.pageSize, total) });
}

export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: ["patientId", "name", "dateOfBirth"], dates: ["dateOfBirth"], maxLengths: { name: 200, guardianName: 200, guardianRelationship: 100, placeOfBirth: 300, deliveryType: 100, medicalHistory: 4000 }, numbers: { birthWeight: [0.3, 8] } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const patientId = Number(body.patientId);
  if (!Number.isInteger(patientId) || patientId <= 0) return NextResponse.json({ error: "A valid mother is required" }, { status: 400 });
  const mother = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, fullName: true, phone: true } });
  if (!mother) return NextResponse.json({ error: "Mother not found" }, { status: 404 });
  const created = await prisma.child.create({ data: { patientId, name: body.name.trim(), dateOfBirth: parseDate(body.dateOfBirth), gender: body.gender === "Male" ? "Male" : "Female", birthWeight: num(body.birthWeight), medicalHistory: (body.medicalHistory || "").trim() || null, guardianName: (body.guardianName || "").trim() || mother.fullName, guardianPhone: (body.guardianPhone || "").trim() || mother.phone, guardianRelationship: (body.guardianRelationship || "").trim() || "Mother", placeOfBirth: (body.placeOfBirth || "").trim() || null, deliveryType: (body.deliveryType || "").trim() || null, childNo: `TMP-${randomUUID()}` } });
  const child = await prisma.child.update({ where: { id: created.id }, data: { childNo: `KPHC-CH-${1000 + created.id}` }, include: childInclude });
  return NextResponse.json({ child }, { status: 201 });
}
