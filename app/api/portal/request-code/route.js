import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createOtp, hashToken, maskPhone, normalizePhone, smsProviderConfigured, twilioProvider } from "@/lib/sms";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const cardNo = String(body.cardNo || "").trim();
  const phone = normalizePhone(body.phone);
  if (!cardNo || !phone) return NextResponse.json({ error: "Card number and phone number are required" }, { status: 400 });
  const patient = await prisma.patient.findUnique({ where: { cardNo }, include: { children: { select: { guardianPhone: true } } } });
  const registeredPhones = [patient?.phone, ...(patient?.children || []).map((child) => child.guardianPhone)].filter(Boolean).map(normalizePhone);
  if (!patient || !registeredPhones.includes(phone)) return NextResponse.json({ error: "The card number and phone number could not be verified" }, { status: 401 });
  const recent = await prisma.patientPortalOtp.findFirst({ where: { patientId: patient.id, createdAt: { gte: new Date(Date.now() - 60_000) }, usedAt: null } });
  if (recent) return NextResponse.json({ error: "Please wait before requesting another code" }, { status: 429 });
  const code = createOtp();
  await prisma.patientPortalOtp.create({ data: { patientId: patient.id, codeHash: hashToken(code), expiresAt: new Date(Date.now() + 10 * 60_000) } });
  const message = `Karu PHC portal verification code: ${code}. It expires in 10 minutes. Do not share this code.`;
  try { if (smsProviderConfigured()) await twilioProvider.send({ to: patient.phone, message }); else if (process.env.NODE_ENV === "production") throw new Error("SMS_PROVIDER=twilio and Twilio credentials are required in production"); else console.log(`[portal-otp-development] to=${patient.phone} code=${code}`); } catch (error) { await prisma.patientPortalOtp.deleteMany({ where: { patientId: patient.id, codeHash: hashToken(code) } }); return NextResponse.json({ error: error.message }, { status: 503 }); }
  return NextResponse.json({ message: `A verification code was sent to ${maskPhone(patient.phone)}` });
}
