import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { validatePassword, validatePayload } from "@/lib/validation";
export async function POST(request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const body = await request.json();
  const validationError = validatePayload(body, { required: ["currentPassword", "newPassword"], maxLengths: { currentPassword: 200, newPassword: 200 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const policyError = validatePassword(body.newPassword);
  if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !(await bcrypt.compare(body.currentPassword, user.password))) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(body.newPassword, 10) } });
  return NextResponse.json({ ok: true });
}
