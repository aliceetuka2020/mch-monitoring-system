import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { dispatchReminders } from "@/lib/reminders";

export async function POST() {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  const result = await dispatchReminders();
  return NextResponse.json(result);
}
