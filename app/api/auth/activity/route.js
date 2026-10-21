import { NextResponse } from "next/server";
import { getSession, createSessionToken, COOKIE_NAME, sessionCookieOptions } from "@/lib/auth";
export async function POST() { const session = await getSession(); if (!session) return NextResponse.json({ error: "Session expired" }, { status: 401 }); const response = NextResponse.json({ ok: true }); response.cookies.set(COOKIE_NAME, createSessionToken({ ...session, lastActivity: Math.floor(Date.now() / 1000) }), sessionCookieOptions()); return response; }
