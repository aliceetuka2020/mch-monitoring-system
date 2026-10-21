import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, validateApiBody, getPagination, paginationResult } from "@/lib/api";
const allowedStatuses = ["PENDING", "SENT", "COMPLETED", "DISMISSED"];

export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const pagination = getPagination(params);
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({ orderBy: { dueDate: "asc" }, skip: pagination.skip, take: pagination.take, include: { patient: { select: { id: true, fullName: true, cardNo: true, phone: true } } } }),
    prisma.notification.count(),
  ]);
  return NextResponse.json({ notifications, pagination: paginationResult(pagination.page, pagination.pageSize, total) });
}

export async function PATCH(request) {
  const { error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: ["id", "status"] });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (!Number.isInteger(Number(body.id)) || Number(body.id) <= 0 || !allowedStatuses.includes(body.status)) return NextResponse.json({ error: "Notification id and valid status are required" }, { status: 400 });
  try {
    const notification = await prisma.notification.update({ where: { id: Number(body.id) }, data: { status: body.status, ...(body.status === "SENT" ? { sentAt: new Date(), channel: "manual" } : {}) } });
    return NextResponse.json({ notification });
  } catch { return NextResponse.json({ error: "Notification not found" }, { status: 404 }); }
}
