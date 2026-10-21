import crypto from "crypto";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { hashToken } from "@/lib/sms";

export const PORTAL_COOKIE = "mch_portal_session";
const SESSION_DAYS = 30;

export function portalCookieOptions() {
  return { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86400 };
}

export async function getPortalPatient() {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.patientPortalSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { patient: true } }).catch(() => null);
  if (!session || session.expiresAt <= new Date()) return null;
  return session.patient;
}

export function createPortalToken() {
  return crypto.randomBytes(32).toString("base64url");
}
