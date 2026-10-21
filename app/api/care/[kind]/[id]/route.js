import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, parseDate, validateApiBody } from "@/lib/api";

const deliveryFields = ["deliveryMode", "outcome", "facility", "complications", "notes"];
const postnatalFields = ["motherCondition", "babyCondition", "feeding", "complications", "notes"];

export async function PATCH(request, { params }) {
  const { error } = await requireAuth();
  if (error) return error;
  const model = params.kind === "delivery" ? prisma.deliveryRecord : params.kind === "postnatal" ? prisma.postnatalRecord : null;
  if (!model) return NextResponse.json({ error: "kind must be delivery or postnatal" }, { status: 400 });
  const body = await request.json();
  const isDelivery = params.kind === "delivery";
  const dateKey = isDelivery ? "deliveryDate" : "visitDate";
  const validationError = validateApiBody(body, { dates: [dateKey, "nextVisit"], maxLengths: { deliveryMode: 200, outcome: 500, facility: 300, complications: 4000, notes: 4000, motherCondition: 4000, babyCondition: 4000, feeding: 500 } });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const data = {};
  if (body[dateKey] !== undefined) data[dateKey] = parseDate(body[dateKey]);
  if (!isDelivery && body.nextVisit !== undefined) data.nextVisit = parseDate(body.nextVisit);
  for (const key of isDelivery ? deliveryFields : postnatalFields) if (body[key] !== undefined) data[key] = (body[key] || "").trim() || null;
  try { const row = await model.update({ where: { id: Number(params.id) }, data }); return NextResponse.json({ row }); }
  catch { return NextResponse.json({ error: "Care record not found" }, { status: 404 }); }
}

export async function DELETE(request, { params }) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  const model = params.kind === "delivery" ? prisma.deliveryRecord : params.kind === "postnatal" ? prisma.postnatalRecord : null;
  if (!model) return NextResponse.json({ error: "kind must be delivery or postnatal" }, { status: 400 });
  try { await model.delete({ where: { id: Number(params.id) } }); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Care record not found" }, { status: 404 }); }
}
