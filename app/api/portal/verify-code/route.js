import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashToken } from "@/lib/sms";
import { createPortalToken, PORTAL_COOKIE, portalCookieOptions } from "@/lib/portal";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const cardNo = String(body.cardNo || "").trim(); const code = String(body.code || "").trim();
  if (!cardNo || !/^\d{6}$/.test(code)) return NextResponse.json({ error: "Card number and six-digit code are required" }, { status: 400 });
  const patient = await prisma.patient.findUnique({ where: { cardNo } });
  if (!patient) return NextResponse.json({ error: "Invalid verification details" }, { status: 401 });
  const otp = await prisma.patientPortalOtp.findFirst({ where: { patientId: patient.id, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.expiresAt <= new Date() || otp.attempts >= 5) return NextResponse.json({ error: "The code is invalid or expired" }, { status: 401 });
  if (otp.codeHash !== hashToken(code)) {
    await prisma.patientPortalOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: "The code is invalid or expired" }, { status: 401 });
  }
  await prisma.patientPortalOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
  const token = createPortalToken();
  await prisma.patientPortalSession.create({ data: { patientId: patient.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 86400000) } });
  const response = NextResponse.json({ ok: true }); response.cookies.set(PORTAL_COOKIE, token, portalCookieOptions()); return response;
}
