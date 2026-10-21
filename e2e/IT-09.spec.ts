import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("IT-09: report rows and date filters reflect synthetic ANC, immunization, and appointment records", async ({
  page,
}, testInfo) => {
  const email = process.env.IT09_EMAIL;
  const password = process.env.IT09_PASSWORD;

  expect(email, "Set IT09_EMAIL to an active synthetic test account.").toBeTruthy();
  expect(password, "Set IT09_PASSWORD for the synthetic test account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true },
  });
  expect(account, "The configured synthetic account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured synthetic account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  const today = new Date();
  const inRangeDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const displayDate = today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const precedingDay = new Date(today);
  precedingDay.setDate(precedingDay.getDate() - 1);
  const outOfRangeDate = `${precedingDay.getFullYear()}-${String(precedingDay.getMonth() + 1).padStart(2, "0")}-${String(precedingDay.getDate()).padStart(2, "0")}`;
  const token = randomUUID();
  const motherName = `Synthetic IT-09 Mother ${token}`;
  const motherPhone = `080${token.replaceAll("-", "").slice(0, 10)}`;
  const childName = `Synthetic IT-09 Child ${token}`;
  const vaccineName = `Synthetic IT-09 Vaccine ${token}`;
  const vaccineDose = "Test dose";
  const appointmentType = `IT-09 Follow-up ${token}`;
  let patientId: number | undefined;

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    expect((await loginResponsePromise).status(), "The synthetic account must sign in.").toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);

    const sessionResponse = await page.request.get("/api/auth/me");
    expect(sessionResponse.status()).toBe(200);
    const session = await sessionResponse.json();
    expect(session.user.role).toBe("community_health_extension_worker");

    const patientResponse = await page.request.post("/api/patients", {
      data: { fullName: motherName, phone: motherPhone },
    });
    expect(patientResponse.status(), "Synthetic patient creation should succeed.").toBe(201);
    patientId = (await patientResponse.json()).patient.id;

    const childResponse = await page.request.post("/api/children", {
      data: { patientId, name: childName, dateOfBirth: "2024-01-15", gender: "Female" },
    });
    expect(childResponse.status(), "Synthetic child creation should succeed.").toBe(201);
    const child = (await childResponse.json()).child;

    const ancResponse = await page.request.post("/api/anc", {
      data: { patientId, visitDate: inRangeDate, weight: 67.3, clinicalNotes: "Synthetic report record" },
    });
    expect(ancResponse.status(), "Synthetic ANC record creation should succeed.").toBe(201);
    const ancRecord = (await ancResponse.json()).record;

    const immunizationResponse = await page.request.post("/api/immunizations", {
      data: {
        childId: child.id,
        vaccineName: "Other",
        otherVaccineName: vaccineName,
        otherDose: vaccineDose,
        dateGiven: inRangeDate,
        remarks: "Synthetic report record",
      },
    });
    expect(immunizationResponse.status(), "Synthetic immunization creation should succeed.").toBe(201);
    const immunization = (await immunizationResponse.json()).record;

    const appointmentResponse = await page.request.post("/api/appointments", {
      data: {
        patientId,
        childId: child.id,
        date: inRangeDate,
        time: "11:15",
        type: appointmentType,
        notes: "Synthetic report record",
      },
    });
    expect(appointmentResponse.status(), "Synthetic appointment creation should succeed.").toBe(201);
    const appointment = (await appointmentResponse.json()).appointment;

    const persistedRecords = await Promise.all([
      prisma.ancRecord.findUnique({
        where: { id: ancRecord.id },
        select: { id: true, patientId: true, visitDate: true, weight: true },
      }),
      prisma.immunization.findUnique({
        where: { id: immunization.id },
        select: { id: true, childId: true, vaccineName: true, dose: true, dateGiven: true },
      }),
      prisma.appointment.findUnique({
        where: { id: appointment.id },
        select: { id: true, patientId: true, childId: true, type: true, date: true, status: true },
      }),
    ]);
    expect(persistedRecords[0]).toMatchObject({ id: ancRecord.id, patientId, weight: 67.3 });
    expect(persistedRecords[0]?.visitDate.toISOString().slice(0, 10)).toBe(inRangeDate);
    expect(persistedRecords[1]).toMatchObject({
      id: immunization.id,
      childId: child.id,
      vaccineName,
      dose: vaccineDose,
    });
    expect(persistedRecords[1]?.dateGiven.toISOString().slice(0, 10)).toBe(inRangeDate);
    expect(persistedRecords[2]).toMatchObject({
      id: appointment.id,
      patientId,
      childId: child.id,
      type: appointmentType,
      status: "SCHEDULED",
    });
    expect(persistedRecords[2]?.date.toISOString().slice(0, 10)).toBe(inRangeDate);

    await page.goto(`/reports?start=${inRangeDate}&end=${inRangeDate}&type=all`);
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();

    const appointmentSection = page.locator("section.report-section").filter({
      has: page.getByRole("heading", { name: "Appointments", exact: true }),
    });
    const appointmentRow = appointmentSection.getByRole("row").filter({ hasText: appointmentType });
    await expect(appointmentRow).toHaveCount(1);
    await expect(appointmentRow).toContainText(motherName);
    await expect(appointmentRow).toContainText(childName);
    await expect(appointmentRow).toContainText(displayDate);
    await expect(appointmentRow).toContainText("SCHEDULED");

    const ancSection = page.locator("section.report-section").filter({
      has: page.getByRole("heading", { name: "ANC visit detail", exact: true }),
    });
    const ancRow = ancSection.getByRole("row").filter({ hasText: motherName });
    await expect(ancRow).toHaveCount(1);
    await expect(ancRow).toContainText("67.3 kg");

    const vaccineSection = page.locator("section.report-section").filter({
      has: page.getByRole("heading", { name: "Immunization doses administered", exact: true }),
    });
    const vaccineRow = vaccineSection.getByRole("row").filter({ hasText: vaccineName });
    await expect(vaccineRow).toHaveCount(1);
    await expect(vaccineRow).toContainText(vaccineDose);
    await expect(vaccineRow).toContainText("1");

    await page.goto(`/reports?start=${outOfRangeDate}&end=${outOfRangeDate}&type=all`);
    const filteredAppointmentSection = page.locator("section.report-section").filter({
      has: page.getByRole("heading", { name: "Appointments", exact: true }),
    });
    await expect(filteredAppointmentSection.getByRole("row").filter({ hasText: appointmentType })).toHaveCount(0);
    const filteredAncSection = page.locator("section.report-section").filter({
      has: page.getByRole("heading", { name: "ANC visit detail", exact: true }),
    });
    await expect(filteredAncSection.getByRole("row").filter({ hasText: motherName })).toHaveCount(0);
    const filteredVaccineSection = page.locator("section.report-section").filter({
      has: page.getByRole("heading", { name: "Immunization doses administered", exact: true }),
    });
    await expect(filteredVaccineSection.getByRole("row").filter({ hasText: vaccineName })).toHaveCount(0);

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "integration_tests",
      "IT-09",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "IT-09-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("IT-09 report date-filter evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
