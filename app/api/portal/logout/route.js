import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { PORTAL_COOKIE, portalCookieOptions } from "@/lib/portal";
import { hashToken } from "@/lib/sms";
export async function POST() { const store = await cookies(); const token = store.get(PORTAL_COOKIE)?.value; if (token) await prisma.patientPortalSession.deleteMany({ where: { tokenHash: hashToken(token) } }); const response = NextResponse.json({ ok: true }); response.cookies.set(PORTAL_COOKIE, "", { ...portalCookieOptions(), maxAge: 0 }); return response; }
