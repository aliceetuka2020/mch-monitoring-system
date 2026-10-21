import { NextResponse } from "next/server";
import { getSession } from "./auth";
import { isValidDate, validatePayload, validateBloodPressure } from "./validation";
import { hasPermission, isRoleAllowed } from "./rbac";

export async function requireAuth(roles, permission) {
  const session = await getSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  if (roles && roles.length > 0 && !isRoleAllowed(session.role, roles)) {
    return { session: null, error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  }
  if (permission && !hasPermission(session.role, permission)) {
    return { session: null, error: NextResponse.json({ error: "Forbidden", permission }, { status: 403 }) };
  }
  return { session, error: null };
}

export async function requirePermission(permission) {
  return requireAuth(undefined, permission);
}

export function parseDate(value) {
  if (!isValidDate(value)) return null;
  const d = new Date(value);
  return d;
}

export function num(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function startOfDay(value) {
  const date = parseDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value) {
  const date = parseDate(value);
  if (!date) return null;
  date.setHours(23, 59, 59, 999);
  return date;
}

export function getPagination(searchParams, defaultPageSize = 25) {
  const requestedPage = Number(searchParams.get("page"));
  const requestedSize = Number(searchParams.get("pageSize"));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Number.isInteger(requestedSize) && requestedSize > 0 ? Math.min(100, requestedSize) : defaultPageSize;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginationResult(page, pageSize, total) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function validateApiBody(body, rules = {}) {
  const message = validatePayload(body, rules);
  if (message) return message;
  if (body.bloodPressure !== undefined) return validateBloodPressure(body.bloodPressure);
  return null;
}
