import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { requireAuth, validateApiBody, getPagination, paginationResult } from "@/lib/api";
import { validatePassword } from "@/lib/validation";
import { RBAC_ROLES } from "@/lib/rbac";
export async function GET(request) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  const pagination = getPagination(new URL(request.url).searchParams);
  const [users, total] = await Promise.all([
    prisma.user.findMany({ orderBy: { id: "asc" }, skip: pagination.skip, take: pagination.take, select: { id: true, fullName: true, email: true, role: true, active: true, createdAt: true } }),
    prisma.user.count(),
  ]);
  return NextResponse.json({ users, pagination: paginationResult(pagination.page, pagination.pageSize, total) });
}
export async function POST(request) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { required: ["fullName", "email", "password"], maxLengths: { fullName: 200, email: 254, password: 200 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const fullName = body.fullName.trim();
  const email = body.email.trim().toLowerCase();
  const policyError = validatePassword(body.password);
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });
  const allowedRoles = new Set(["ADMIN", "HEALTH_WORKER", ...RBAC_ROLES.map((item) => item.id)]);
  const role = allowedRoles.has(body.role) ? body.role : "HEALTH_WORKER";
  if (await prisma.user.findUnique({ where: { email } })) return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  const user = await prisma.user.create({ data: { fullName, email, password: await bcrypt.hash(body.password, 10), role } });
  return NextResponse.json({ user: { id: user.id, fullName, email, role, active: user.active } }, { status: 201 });
}
