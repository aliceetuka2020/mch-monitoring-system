import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { requireAuth } from "@/lib/api";

const backupDirectory = path.join(process.cwd(), "backups");

function createDump(target) {
  return new Promise((resolve, reject) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || !databaseUrl.startsWith("postgres")) return reject(new Error("DATABASE_URL is not configured for PostgreSQL"));
    const child = spawn("pg_dump", ["--format=custom", "--file", target, databaseUrl]);
    let errorText = "";
    child.stderr.on("data", (chunk) => { errorText += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(errorText || `pg_dump exited with code ${code}`)));
  });
}

export async function GET() {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  await fs.mkdir(backupDirectory, { recursive: true });
  const names = (await fs.readdir(backupDirectory)).filter((name) => name.endsWith(".dump"));
  const backups = await Promise.all(names.map(async (name) => {
    const stats = await fs.stat(path.join(backupDirectory, name));
    return { name, size: stats.size, modifiedAt: stats.mtime.toISOString() };
  }));
  backups.sort((first, second) => second.modifiedAt.localeCompare(first.modifiedAt));
  return NextResponse.json({ backups });
}

export async function POST() {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  try {
    await fs.mkdir(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `mch-${stamp}.dump`;
    await createDump(path.join(backupDirectory, name));
    return NextResponse.json({ ok: true, backup: name }, { status: 201 });
  } catch (backupError) {
    return NextResponse.json({ error: backupError instanceof Error ? backupError.message : "Could not create PostgreSQL backup" }, { status: 500 });
  }
}
