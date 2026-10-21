import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const sessionState = vi.hoisted(() => ({ id: 1, role: "ADMIN", name: "Test Administrator" }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSession: async () => ({ ...sessionState }) };
});

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { POST as pregnancyPost } from "@/app/api/pregnancies/route";
import { POST as ancPost } from "@/app/api/anc/route";
import { POST as childPost } from "@/app/api/children/route";
import { POST as vaccinePost } from "@/app/api/immunizations/route";
import { GET as patientListGet } from "@/app/api/patients/route";
import { GET as appointmentListGet } from "@/app/api/appointments/route";
import { GET as usersGet } from "@/app/api/users/route";
import { POST as backupPost } from "@/app/api/backups/route";
import { PUT as settingsPut } from "@/app/api/settings/route";
import { GET as facilityGet } from "@/app/api/facility/route";
import { PATCH as carePatch } from "@/app/api/care/[kind]/[id]/route";
import { POST as carePost } from "@/app/api/care/route";
import { GET as reportCsvGet } from "@/app/api/reports/export/route";
import { getReportData } from "@/lib/report-data";

function request(url, method, body) {
  return new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

beforeEach(async () => {
  for (const table of [prisma.notification, prisma.appointment, prisma.postnatalRecord, prisma.deliveryRecord, prisma.childVisit, prisma.growthRecord, prisma.immunization, prisma.ancRecord, prisma.pregnancy, prisma.child, prisma.patient, prisma.setting, prisma.user]) await table.deleteMany();
  const admin = await prisma.user.create({ data: { fullName: "Test Administrator", email: "test-admin@example.test", password: await bcrypt.hash("Admin123!", 4), role: "ADMIN" } });
  sessionState.id = admin.id;
  sessionState.role = "ADMIN";
});

describe("new monitoring features", () => {
  it("registers a pregnancy, derives an EDD, and links ANC with calculated gestational age", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "FEATURE-PREG", fullName: "Feature Mother", phone: "08031234567" } });
    const pregnancyResponse = await pregnancyPost(request("/api/pregnancies", "POST", { patientId: mother.id, lastMenstrualPeriod: "2025-01-01", gravida: 2, parity: 1 }));
    const pregnancy = (await pregnancyResponse.json()).pregnancy;
    expect(pregnancyResponse.status).toBe(201);
    expect(pregnancy.estimatedDeliveryDate.slice(0, 10)).toBe("2025-10-08");
    const ancResponse = await ancPost(request("/api/anc", "POST", { patientId: mother.id, visitDate: "2025-02-12", weight: 62, foetalAssessment: "Normal", medicationsSupplements: "Iron", healthEducation: "Nutrition" }));
    const anc = (await ancResponse.json()).record;
    expect(anc.pregnancyId).toBe(pregnancy.id);
    expect(anc.gestationalAge).toBe("6 weeks");
    expect(anc.healthEducation).toBe("Nutrition");
  });

  it("generates a child number, supports an Other vaccine, and pre-calculates scheduled due dates", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "FEATURE-CHILD", fullName: "Feature Mother", phone: "08031234567" } });
    const childResponse = await childPost(request("/api/children", "POST", { patientId: mother.id, name: "Feature Baby", dateOfBirth: "2025-01-01", gender: "Male", birthWeight: 3.2 }));
    const child = (await childResponse.json()).child;
    expect(child.childNo).toMatch(/^KPHC-CH-/);
    const vaccineResponse = await vaccinePost(request("/api/immunizations", "POST", { childId: child.id, vaccineName: "Penta", dose: "Penta 1", dateGiven: "2025-02-12" }));
    const vaccine = (await vaccineResponse.json()).record;
    expect(vaccine.nextDueDate.slice(0, 10)).toBe("2025-03-12");
    const otherResponse = await vaccinePost(request("/api/immunizations", "POST", { childId: child.id, vaccineName: "Other", otherVaccineName: "Influenza", otherDose: "Annual", dateGiven: "2025-02-12" }));
    expect(otherResponse.status).toBe(201);
    expect((await otherResponse.json()).record.vaccineName).toBe("Influenza");
  });

  it("paginates maternal and user lists and treats appointments due today as upcoming", async () => {
    for (let index = 0; index < 27; index += 1) await prisma.patient.create({ data: { cardNo: `FEATURE-PAGE-${index}`, fullName: `Paged Mother ${index}`, phone: "08031234567" } });
    const pageOne = await patientListGet(request("/api/patients?page=1&pageSize=25", "GET"));
    const first = await pageOne.json();
    expect(first.patients).toHaveLength(25);
    expect(first.pagination.total).toBe(27);
    const pageTwo = await (await patientListGet(request("/api/patients?page=2&pageSize=25", "GET"))).json();
    expect(pageTwo.patients).toHaveLength(2);
    const userResponse = await usersGet(request("/api/users?page=1&pageSize=1", "GET"));
    expect((await userResponse.json()).users).toHaveLength(1);
    const mother = await prisma.patient.findFirst();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    await prisma.appointment.create({ data: { patientId: mother.id, date: today, type: "Antenatal" } });
    const upcoming = await (await appointmentListGet(request("/api/appointments?upcoming=1", "GET"))).json();
    expect(upcoming.appointments).toHaveLength(1);
  });

  it("edits delivery records, saves inactivity and facility settings, and creates a local backup", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "FEATURE-CARE", fullName: "Feature Mother", phone: "08031234567" } });
    const deliveryResponse = await carePost(request("/api/care", "POST", { kind: "delivery", patientId: mother.id, deliveryDate: "2025-04-01", deliveryMode: "Vaginal", outcome: "Live birth" }));
    const delivery = (await deliveryResponse.json()).row;
    const updated = await carePatch(request(`/api/care/delivery/${delivery.id}`, "PATCH", { facility: "Karu PHC", complications: "None" }), { params: { kind: "delivery", id: String(delivery.id) } });
    expect((await updated.json()).row.facility).toBe("Karu PHC");
    const settings = await settingsPut(request("/api/settings", "PUT", { facilityName: "Community Clinic", inactivityMinutes: 45 }));
    expect(settings.status).toBe(200);
    expect(await prisma.setting.findUnique({ where: { key: "inactivityMinutes" } })).toMatchObject({ value: "45" });
    expect((await facilityGet()).status).toBe(200);
    expect((await (await facilityGet()).json()).facilityName).toBe("Community Clinic");
    const response = await backupPost();
    expect(response.status).toBe(201);
    const { backup } = await response.json();
    const backupPath = path.join(process.cwd(), "backups", backup);
    expect((await fs.stat(backupPath)).size).toBeGreaterThan(0);
    await fs.unlink(backupPath);
  });

  it("applies report date and service filters to all maternal event tables", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "FEATURE-REPORT", fullName: "Historical Mother", phone: "08031234567", registrationDate: new Date("2024-06-01") } });
    await prisma.ancRecord.create({ data: { patient: { connect: { id: mother.id } }, recordedBy: { connect: { id: sessionState.id } }, visitDate: new Date("2025-01-15"), gestationalAge: "20 weeks", weight: 60 } });
    await prisma.deliveryRecord.create({ data: { patient: { connect: { id: mother.id } }, deliveryDate: new Date("2025-02-15"), deliveryMode: "Vaginal", outcome: "Live birth" } });
    await prisma.appointment.create({ data: { patientId: mother.id, date: new Date("2025-01-20"), type: "Antenatal" } });
    await prisma.appointment.create({ data: { patientId: mother.id, date: new Date("2025-01-21"), type: "Immunization" } });
    const data = await getReportData({ start: "2025-01-01", end: "2025-01-31", type: "maternal", serviceType: "Antenatal" });
    expect(data.maternalStats.mothers).toHaveLength(1);
    expect(data.maternalStats.registrations).toBe(0);
    expect(data.maternalStats.ancVisits).toBe(1);
    expect(data.maternalStats.deliveries).toBe(0);
    expect(data.deliveryRecords).toHaveLength(0);
    expect(data.maternalStats.mothers[0].ancVisits).toBe(1);
    const csv = await (await reportCsvGet(request("/api/reports/export?start=2025-01-01&end=2025-01-31&type=appointments&serviceType=Antenatal", "GET"))).text();
    expect(csv).toContain("Antenatal");
    expect(csv).not.toContain("Immunization");
  });

  it("requires PostgreSQL for database restore operations", async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mch-restore-test-"));
    const source = path.join(temporaryDirectory, "source.dump");
    await fs.writeFile(source, "not a PostgreSQL dump");
    const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts/restore.js"), source], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: "mysql://not-supported" }, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("PostgreSQL connection string");
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  });
});
