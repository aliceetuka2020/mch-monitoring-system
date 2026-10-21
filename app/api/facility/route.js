import { NextResponse } from "next/server";
import { getFacilityName } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({ facilityName: await getFacilityName() });
}
