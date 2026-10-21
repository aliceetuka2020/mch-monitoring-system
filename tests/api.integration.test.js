import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const sessionState = vi.hoisted(() => ({ id: 1, role: "ADMIN", name: "System Administrator" }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSession: async () => ({ ...sessionState }) };
});

import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { resetLoginLimiter } from "@/lib/login-limiter";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as patientPost } from "@/app/api/patients/route";
import { DELETE as patientDelete } from "@/app/api/patients/[id]/route";
import { POST as childPost } from "@/app/api/children/route";
import { DELETE as childDelete } from "@/app/api/children/[id]/route";
import { POST as ancPost } from "@/app/api/anc/route";
import { DELETE as ancDelete } from "@/app/api/anc/[id]/route";
import { POST as vaccinePost } from "@/app/api/immunizations/route";
import { DELETE as vaccineDelete } from "@/app/api/immunizations/[id]/route";
import { POST as growthPost } from "@/app/api/growth/route";
import { DELETE as growthDelete } from "@/app/api/growth/[id]/route";
import { POST as appointmentPost } from "@/app/api/appointments/route";
import { POST as childVisitPost } from "@/app/api/child-visits/route";
import { PATCH as childVisitPatch, DELETE as childVisitDelete } from "@/app/api/child-visits/[id]/route";
import { POST as reminderDispatchPost } from "@/app/api/reminders/dispatch/route";
import { PUT as settingsPut } from "@/app/api/settings/route";
import { GET as usersGet, POST as usersPost } from "@/app/api/users/route";
import { GET as reportExportGet } from "@/app/api/reports/export/route";

function request(url, method, body, headers = {}) {
  return new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function responseData(response) { return response.json(); }

beforeEach(async () => {
  resetLoginLimiter();
  for (const table of [prisma.notification, prisma.appointment, prisma.postnatalRecord, prisma.deliveryRecord, prisma.childVisit, prisma.growthRecord, prisma.immunization, prisma.ancRecord, prisma.pregnancy, prisma.child, prisma.patient, prisma.setting, prisma.user]) await table.deleteMany();
  const admin = await prisma.user.create({ data: { fullName: "System Administrator", email: "admin@karuphc.gov.ng", password: await bcrypt.hash("Admin123!", 4), role: "ADMIN" } });
  sessionState.id = admin.id;
  sessionState.role = "ADMIN";
});

describe("API integration", () => {
  it("authenticates valid credentials and rejects bad credentials", async () => {
    const good = await loginPost(request("/api/auth/login", "POST", { email: "admin@karuphc.gov.ng", password: "Admin123!" }, { "x-forwarded-for": "192.0.2.10" }));
    expect(good.status).toBe(200);
    expect((await responseData(good)).user.role).toBe("ADMIN");
    const bad = await loginPost(request("/api/auth/login", "POST", { email: "admin@karuphc.gov.ng", password: "incorrect" }, { "x-forwarded-for": "192.0.2.11" }));
    expect(bad.status).toBe(401);
  });

  it("locks login after five unsuccessful attempts", async () => {
    const headers = { "x-forwarded-for": "192.0.2.12" };
    for (let attempt = 0; attempt < 5; attempt += 1) await loginPost(request("/api/auth/login", "POST", { email: "admin@karuphc.gov.ng", password: "incorrect" }, headers));
    const locked = await loginPost(request("/api/auth/login", "POST", { email: "admin@karuphc.gov.ng", password: "Admin123!" }, headers));
    expect(locked.status).toBe(429);
  });

  it("registers a mother, registers a child with mother-default guardian data, and preserves maternal history", async () => {
    const patientResponse = await patientPost(request("/api/patients", "POST", { fullName: "Alice Obute", phone: "08031234567", previousPregnancies: "Two prior pregnancies", pregnancyHistory: "Current pregnancy notes", clinicalObservations: "Stable", followUpInformation: "Review in four weeks" }));
    expect(patientResponse.status).toBe(201);
    const patient = (await responseData(patientResponse)).patient;
    expect(patient.previousPregnancies).toBe("Two prior pregnancies");
    const childResponse = await childPost(request("/api/children", "POST", { patientId: patient.id, name: "Baby Alice", dateOfBirth: "2025-01-01", gender: "Female" }));
    expect(childResponse.status).toBe(201);
    const child = (await responseData(childResponse)).child;
    expect(child.guardianName).toBe("Alice Obute");
    expect(child.guardianPhone).toBe("08031234567");
    expect(child.guardianRelationship).toBe("Mother");
  });

  it("creates an ANC visit and its reminder", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "KPHC-TEST1", fullName: "Test Mother", phone: "08031234567" } });
    const response = await ancPost(request("/api/anc", "POST", { patientId: mother.id, visitDate: "2025-01-01", gestationalAge: "24 weeks", weight: 68, bloodPressure: "110/70", nextVisit: "2025-01-29" }));
    expect(response.status).toBe(201);
    expect(await prisma.notification.count({ where: { patientId: mother.id, type: "ANC" } })).toBe(1);
  });

  it("records an immunization and a child growth record with server-calculated age", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "KPHC-TEST2", fullName: "Test Mother", phone: "08031234567" } });
    const child = await prisma.child.create({ data: { patientId: mother.id, name: "Test Child", dateOfBirth: new Date("2025-01-01") } });
    const vaccine = await vaccinePost(request("/api/immunizations", "POST", { childId: child.id, vaccineName: "BCG", dose: "Birth", dateGiven: "2025-01-01" }));
    expect(vaccine.status).toBe(201);
    const growth = await growthPost(request("/api/growth", "POST", { childId: child.id, measurementDate: "2025-03-02", weight: 6.1, height: 60, headCircumference: 40 }));
    expect(growth.status).toBe(201);
    expect((await responseData(growth)).record.ageInMonths).toBe(2);
  });

  it("creates appointments for a mother and for her child, and names the child in the reminder", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "KPHC-TEST3", fullName: "Test Mother", phone: "08031234567" } });
    const child = await prisma.child.create({ data: { patientId: mother.id, name: "Test Baby", dateOfBirth: new Date("2025-01-01") } });
    const motherAppointment = await appointmentPost(request("/api/appointments", "POST", { patientId: mother.id, date: "2026-12-01", type: "Antenatal" }));
    expect(motherAppointment.status).toBe(201);
    const childAppointment = await appointmentPost(request("/api/appointments", "POST", { patientId: mother.id, childId: child.id, date: "2026-12-02", type: "Immunization" }));
    expect(childAppointment.status).toBe(201);
    expect((await responseData(childAppointment)).appointment.child.name).toBe("Test Baby");
    const notification = await prisma.notification.findFirst({ where: { type: "APPOINTMENT", dueDate: new Date("2026-12-02") } });
    expect(notification.message).toContain("Test Baby");
  });

  it("adds, edits, and administrator-deletes child healthcare visits", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "KPHC-TEST4", fullName: "Test Mother", phone: "08031234567" } });
    const child = await prisma.child.create({ data: { patientId: mother.id, name: "Test Child", dateOfBirth: new Date("2025-01-01") } });
    const created = await childVisitPost(request("/api/child-visits", "POST", { childId: child.id, visitDate: "2025-04-01", reason: "Fever", findings: "Mild fever" }));
    const visit = (await responseData(created)).visit;
    const updated = await childVisitPatch(request(`/api/child-visits/${visit.id}`, "PATCH", { treatment: "Oral fluids" }), { params: { id: String(visit.id) } });
    expect((await responseData(updated)).visit.treatment).toBe("Oral fluids");
    const deleted = await childVisitDelete(request(`/api/child-visits/${visit.id}`, "DELETE", {}), { params: { id: String(visit.id) } });
    expect(deleted.status).toBe(200);
  });

  it("dispatches due reminders through the configured console provider and records SENT status", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "KPHC-TEST5", fullName: "Reminder Mother", phone: "08031234567" } });
    await prisma.setting.createMany({ data: [{ key: "patientRemindersEnabled", value: "true" }, { key: "reminderWindowDays", value: "14" }] });
    const dueDate = new Date(Date.now() + 2 * 86400000);
    const notification = await prisma.notification.create({ data: { patientId: mother.id, type: "ANC", message: "Antenatal appointment", dueDate } });
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await reminderDispatchPost();
    expect((await responseData(response)).sent).toBe(1);
    const updated = await prisma.notification.findUnique({ where: { id: notification.id } });
    expect(updated.status).toBe("SENT");
    expect(updated.channel).toBe("console");
    expect(updated.sentAt).toBeInstanceOf(Date);
    expect(output).toHaveBeenCalled();
    output.mockRestore();
  });

  it("returns report CSV for administrators and blocks report export and deletion for health workers", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "KPHC-TEST6", fullName: "Report Mother", phone: "08031234567" } });
    await prisma.appointment.create({ data: { patientId: mother.id, date: new Date(Date.now() - 86400000), type: "Antenatal" } });
    const csvResponse = await reportExportGet(request("/api/reports/export", "GET"));
    expect(csvResponse.status).toBe(200);
    expect(await csvResponse.text()).toContain("Report Mother");
    const child = await prisma.child.create({ data: { patientId: mother.id, name: "Protected Child", dateOfBirth: new Date("2025-01-01") } });
    const anc = await prisma.ancRecord.create({ data: { patientId: mother.id, visitDate: new Date(), gestationalAge: "24 weeks", weight: 68, recordedById: sessionState.id } });
    const vaccine = await prisma.immunization.create({ data: { childId: child.id, vaccineName: "BCG", dose: "Birth", dateGiven: child.dateOfBirth, administeredById: sessionState.id } });
    const growth = await prisma.growthRecord.create({ data: { childId: child.id, measurementDate: new Date(), ageInMonths: 2, weight: 6, height: 60 } });
    const visit = await prisma.childVisit.create({ data: { childId: child.id, visitDate: new Date(), reason: "Check-up", recordedById: sessionState.id } });
    sessionState.role = "HEALTH_WORKER";
    expect((await childDelete(request(`/api/children/${child.id}`, "DELETE", {}), { params: { id: String(child.id) } })).status).toBe(403);
    expect((await patientDelete(request(`/api/patients/${mother.id}`, "DELETE", {}), { params: { id: String(mother.id) } })).status).toBe(403);
    expect((await ancDelete(request(`/api/anc/${anc.id}`, "DELETE", {}), { params: { id: String(anc.id) } })).status).toBe(403);
    expect((await vaccineDelete(request(`/api/immunizations/${vaccine.id}`, "DELETE", {}), { params: { id: String(vaccine.id) } })).status).toBe(403);
    expect((await growthDelete(request(`/api/growth/${growth.id}`, "DELETE", {}), { params: { id: String(growth.id) } })).status).toBe(403);
    expect((await childVisitDelete(request(`/api/child-visits/${visit.id}`, "DELETE", {}), { params: { id: String(visit.id) } })).status).toBe(403);
    expect((await settingsPut(request("/api/settings", "PUT", { patientRemindersEnabled: true }))).status).toBe(403);
    expect((await usersGet()).status).toBe(403);
    expect((await usersPost(request("/api/users", "POST", { fullName: "Unauthorized", email: "unauthorized@example.test", password: "Worker123!", role: "HEALTH_WORKER" }))).status).toBe(403);
    expect((await reportExportGet(request("/api/reports/export", "GET"))).status).toBe(403);
  });

  it("backfills legacy pregnancy history, guardian defaults, growth age, and reminder settings without data loss", async () => {
    const mother = await prisma.patient.create({ data: { cardNo: "KPHC-MIGRATE", fullName: "Legacy Mother", phone: "08031234567", pregnancyHistory: "Legacy previous pregnancies", pregnancyInformation: "Existing current pregnancy notes" } });
    const child = await prisma.child.create({ data: { patientId: mother.id, name: "Legacy Child", dateOfBirth: new Date("2025-01-01") } });
    const measurement = await prisma.growthRecord.create({ data: { childId: child.id, measurementDate: new Date("2025-04-01"), ageInMonths: 0, weight: 6, height: 60 } });
    const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts/migrate-data.js")], { cwd: process.cwd(), env: process.env, encoding: "utf8" });
    expect(result.status).toBe(0);
    const updatedMother = await prisma.patient.findUnique({ where: { id: mother.id } });
    const updatedChild = await prisma.child.findUnique({ where: { id: child.id } });
    const legacyPregnancy = await prisma.pregnancy.findFirst({ where: { patientId: mother.id } });
    const updatedMeasurement = await prisma.growthRecord.findUnique({ where: { id: measurement.id } });
    expect(updatedMother.previousPregnancies).toBe("Legacy previous pregnancies");
    expect(updatedMother.pregnancyHistory).toBe("Existing current pregnancy notes");
    expect(updatedChild.guardianName).toBe("Legacy Mother");
    expect(updatedChild.guardianPhone).toBe("08031234567");
    expect(updatedChild.childNo).toMatch(/^KPHC-CH-/);
    expect(legacyPregnancy.status).toBe("LEGACY");
    expect(updatedMeasurement.ageInMonths).toBe(3);
    expect(await prisma.setting.findUnique({ where: { key: "patientRemindersEnabled" } })).toMatchObject({ value: "false" });
  });

  it("returns clear validation errors for malformed patient, child, and measurement requests", async () => {
    const badPatient = await patientPost(request("/api/patients", "POST", { fullName: "No phone", phone: "bad" }));
    expect(badPatient.status).toBe(400);
    expect((await responseData(badPatient)).error).toContain("phone");
    const noPatient = await childPost(request("/api/children", "POST", { name: "No mother", dateOfBirth: "not-date" }));
    expect(noPatient.status).toBe(400);
    const invalidGrowth = await growthPost(request("/api/growth", "POST", { childId: 999, measurementDate: "2025-01-01", weight: 0, height: 1 }));
    expect(invalidGrowth.status).toBe(400);
  });
});
