import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { permissionsForRole } from "@/lib/rbac";
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ user: { id: session.id, name: session.name, role: session.role, permissions: permissionsForRole(session.role) } });
}
