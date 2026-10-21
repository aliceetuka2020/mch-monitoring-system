import crypto from "crypto";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { DEFAULT_INACTIVITY_MINUTES } from "@/lib/settings";

if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  throw new Error("AUTH_SECRET is required when NODE_ENV is production. Configure a strong secret before starting the application.");
}

const SECRET = process.env.AUTH_SECRET || "karu-phc-mch-development-secret";
export const COOKIE_NAME = "mch_session";
const MAX_AGE = 60 * 60 * 8;
export const INACTIVITY_LIMIT = 30 * 60;

function sign(body) {
  return crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

export function getInactivityLimitSeconds(value) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 5 && minutes <= 365 ? minutes * 60 : INACTIVITY_LIMIT;
}

export function resolveDatabaseSession(session, user) {
  if (!session || !user || !user.active) return null;
  return { ...session, id: user.id, name: user.fullName, role: user.role };
}

export function createSessionToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token, nowSeconds = Math.floor(Date.now() / 1000), inactivityLimit = INACTIVITY_LIMIT) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!session || typeof session.id !== "number") return null;
    if (session.exp && session.exp <= nowSeconds) return null;
    if (session.lastActivity && session.lastActivity + inactivityLimit <= nowSeconds) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const configuredMinutes = await prisma.setting.findUnique({ where: { key: "inactivityMinutes" }, select: { value: true } }).then((row) => row?.value ?? DEFAULT_INACTIVITY_MINUTES).catch(() => DEFAULT_INACTIVITY_MINUTES);
  const inactivitySeconds = getInactivityLimitSeconds(configuredMinutes);
  const session = verifySessionToken(token, Math.floor(Date.now() / 1000), inactivitySeconds);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.id }, select: { id: true, fullName: true, role: true, active: true } });
  return resolveDatabaseSession(session, user);
}

export function sessionCookieOptions() {
  return { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE };
}
