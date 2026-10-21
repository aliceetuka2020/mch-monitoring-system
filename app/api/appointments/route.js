import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, startOfDay, endOfDay, validateApiBody, getPagination, paginationResult } from "@/lib/api";

export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const today = startOfDay(new Date());
  await prisma.appointment.updateMany({ where: { status: "SCHEDULED", date: { lt: today } }, data: { status: "MISSED" } });
  const status = params.get("status");
  const upcoming = params.get("upcoming") === "1";
  const query = (params.get("q") || "").trim();
  const start = params.get("start") ? startOfDay(params.get("start")) : null;
  const end = params.get("end") ? endOfDay(params.get("end")) : null;
  if ((params.get("start") && !start) || (params.get("end") && !end) || (start && end && start > end)) return NextResponse.json({ error: "A valid date range is required" }, { status: 400 });
  const where = {};
  if (["SCHEDULED", "COMPLETED", "CANCELLED", "MISSED"].includes(status)) where.status = status;
  if (upcoming) { where.status = "SCHEDULED"; where.date = { gte: today }; }
  else if (start || end) where.date = { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
  if (query) where.patient = { fullName: { contains: query } };
  const pagination = getPagination(params);
  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({ where, orderBy: { date: upcoming ? "asc" : "desc" }, skip: pagination.skip, take: pagination.take, include: { patient: { select: { id: true, fullName: true, cardNo: true } }, child: { select: { id: true, name: true } } } }),
    prisma.appointment.count({ where }),
  ]);
  return NextResponse.json({ appointments, pagination: paginationResult(pagination.page, pagination.pageSize, total) });
}

export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: ["patientId", "date"], labels: { patientId: "Mother", date: "Appointment date" }, dates: ["date"], maxLengths: { type: 80, time: 20, notes: 2000 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const patientId = Number(body.patientId);
  const childId = body.childId ? Number(body.childId) : null;
  if (!Number.isInteger(patientId) || patientId <= 0 || (childId !== null && (!Number.isInteger(childId) || childId <= 0))) return NextResponse.json({ error: "Mother and child identifiers must be valid" }, { status: 400 });
  const mother = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, fullName: true } });
  if (!mother) return NextResponse.json({ error: "Mother not found" }, { status: 404 });
  let child = null;
  if (childId) {
    child = await prisma.child.findFirst({ where: { id: childId, patientId }, select: { id: true, name: true } });
    if (!child) return NextResponse.json({ error: "Selected child does not belong to the selected mother" }, { status: 400 });
  }
  const date = parseDate(body.date);
  const appointment = await prisma.appointment.create({ data: { patientId, childId, date, time: (body.time || "").trim() || null, type: (body.type || "Antenatal").trim(), notes: (body.notes || "").trim() || null }, include: { patient: { select: { id: true, fullName: true, cardNo: true } }, child: { select: { id: true, name: true } } } });
  const subject = child ? `${appointment.type} appointment for ${child.name}` : `${appointment.type} appointment`;
  await prisma.notification.create({ data: { patientId, type: "APPOINTMENT", message: subject, dueDate: appointment.date } });
  return NextResponse.json({ appointment }, { status: 201 });
}
