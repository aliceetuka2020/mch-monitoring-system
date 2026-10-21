import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { requireAuth, validateApiBody } from "@/lib/api";
import { validatePassword } from "@/lib/validation";
import { RBAC_ROLES } from "@/lib/rbac";
export async function PATCH(request, { params }) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  const body = await request.json();
  const validationError = validateApiBody(body, { maxLengths: { password: 200 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (body.password !== undefined) { const policyError = validatePassword(body.password); if (policyError) return NextResponse.json({ error: policyError }, { status: 400 }); }
  if (body.role !== undefined && !new Set(["ADMIN", "HEALTH_WORKER", ...RBAC_ROLES.map((item) => item.id)]).has(body.role)) return NextResponse.json({ error: "Invalid user role" }, { status: 400 });
  if (typeof body.active !== "boolean" && !body.password && !body.role) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  try {
    const user = await prisma.user.update({ where: { id: Number(params.id) }, data: { active: typeof body.active === "boolean" ? body.active : undefined, role: body.role || undefined, password: body.password ? await bcrypt.hash(body.password, 10) : undefined }, select: { id: true, active: true, role: true } });
    return NextResponse.json({ user });
  } catch { return NextResponse.json({ error: "User not found" }, { status: 404 }); }
}
