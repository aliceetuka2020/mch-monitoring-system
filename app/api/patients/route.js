import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody, getPagination, paginationResult } from "@/lib/api";

export async function GET(request) {
  const { error } = await requireAuth(undefined, "patients.view");
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") || "").trim();
  const where = query ? { OR: [{ fullName: { contains: query } }, { cardNo: { contains: query } }, { phone: { contains: query } }] } : {};
  const pagination = getPagination(params);
  const [patients, total] = await Promise.all([
    prisma.patient.findMany({ where, orderBy: { id: "desc" }, skip: pagination.skip, take: pagination.take, include: { _count: { select: { children: true, ancRecords: true } } } }),
    prisma.patient.count({ where }),
  ]);
  return NextResponse.json({ patients, pagination: paginationResult(pagination.page, pagination.pageSize, total) });
}

export async function POST(request) {
  const { error } = await requireAuth(undefined, "patients.register");
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: ["fullName", "phone"], dates: ["dateOfBirth"], maxLengths: { fullName: 200, phone: 30, address: 1000, previousPregnancies: 4000, pregnancyHistory: 4000, medicalHistory: 4000, riskFactors: 4000, pregnancyInformation: 4000, clinicalObservations: 4000, followUpInformation: 4000, gestationalAgeAtRegistration: 100 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const created = await prisma.patient.create({ data: { fullName: body.fullName.trim(), phone: body.phone.trim(), address: (body.address || "").trim(), bloodGroup: (body.bloodGroup || "").trim() || null, genotype: (body.genotype || "").trim() || null, nextOfKin: (body.nextOfKin || "").trim() || null, previousPregnancies: (body.previousPregnancies || "").trim() || null, pregnancyHistory: (body.pregnancyHistory || "").trim() || null, medicalHistory: (body.medicalHistory || "").trim() || null, riskFactors: (body.riskFactors || "").trim() || null, pregnancyInformation: (body.pregnancyInformation || "").trim() || null, clinicalObservations: (body.clinicalObservations || "").trim() || null, followUpInformation: (body.followUpInformation || "").trim() || null, gestationalAgeAtRegistration: (body.gestationalAgeAtRegistration || "").trim() || null, dateOfBirth: parseDate(body.dateOfBirth), cardNo: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } });
  const patient = await prisma.patient.update({ where: { id: created.id }, data: { cardNo: `KPHC-${1000 + created.id}` } });
  return NextResponse.json({ patient }, { status: 201 });
}
