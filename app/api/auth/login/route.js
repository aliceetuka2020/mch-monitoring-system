import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { createSessionToken, COOKIE_NAME, sessionCookieOptions } from "@/lib/auth";
import { validatePayload } from "@/lib/validation";
import { clearLoginFailures, getLoginLock, recordLoginFailure } from "@/lib/login-limiter";
function loginKeys(request, email) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return [`account:${email}`, `ip:${ip}`];
}
export async function POST(request) {
  const body = await request.json();
  const validationError = validatePayload(body, { required: ["email", "password"], maxLengths: { email: 254, password: 200 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const email = body.email.trim().toLowerCase();
  const password = body.password;
  const emailIssue = validatePayload({ email });
  if (emailIssue) return NextResponse.json({ error: emailIssue }, { status: 400 });
  const keys = loginKeys(request, email);
  const lockedUntil = getLoginLock(keys);
  if (lockedUntil) return NextResponse.json({ error: "Too many failed sign-in attempts. Try again in 15 minutes." }, { status: 429 });
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user && user.active ? await bcrypt.compare(password, user.password) : false;
  if (!valid) {
    recordLoginFailure(keys);
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  clearLoginFailures(keys);
  const now = Math.floor(Date.now() / 1000);
  const token = createSessionToken({ id: user.id, name: user.fullName, role: user.role, lastActivity: now, exp: now + 60 * 60 * 8 });
  const response = NextResponse.json({ user: { id: user.id, name: user.fullName, role: user.role } });
  response.cookies.set(COOKIE_NAME, token, sessionCookieOptions());
  return response;
}
