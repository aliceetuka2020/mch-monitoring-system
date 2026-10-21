import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("IT-04: links a pregnancy and ANC visit to a synthetic patient profile", async ({
  page,
}, testInfo) => {
  const email = process.env.IT04_EMAIL;
  const password = process.env.IT04_PASSWORD;

  expect(email, "Set IT04_EMAIL to an active synthetic account allowed to register patients.").toBeTruthy();
  expect(password, "Set IT04_PASSWORD for the synthetic test account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true, fullName: true },
  });
  expect(account, "The configured synthetic account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured synthetic account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  const token = randomUUID();
  const fullName = `Synthetic IT-04 ${token}`;
  const phone = `080${token.replaceAll("-", "").slice(0, 10)}`;
  const lastMenstrualPeriod = "2025-01-06";
  const visitDate = "2025-04-07";
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
    expect((await loginResponsePromise).status(), "The synthetic user must sign in.").toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);

    const sessionResponse = await page.request.get("/api/auth/me");
    expect(sessionResponse.status()).toBe(200);
    const session = await sessionResponse.json();
    expect(session.user.role).toBe("community_health_extension_worker");
    expect(session.user.permissions).toContain("patients.register");
    expect(session.user.permissions).toContain("patients.view");

    await page.goto("/patients");
    await page.getByRole("button", { name: "Register mother" }).click();
    await page.getByLabel("Full name").fill(fullName);
    await page.getByLabel("Phone").fill(phone);
    const patientResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/patients") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const patientResponse = await patientResponsePromise;
    expect(patientResponse.status()).toBe(201);
    const patientResult = await patientResponse.json();
    patientId = patientResult.patient.id;
    expect(patientResult.patient).toMatchObject({ fullName, phone });

    await page.getByRole("link", { name: fullName, exact: true }).click();
    await expect(page.getByRole("heading", { name: fullName, exact: true })).toBeVisible();

    await page.getByLabel("Last menstrual period").fill(lastMenstrualPeriod);
    await page.getByLabel("Gravida").fill("2");
    await page.getByLabel("Parity").fill("1");
    const pregnancyResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/pregnancies") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Register pregnancy" }).click();
    const pregnancyResponse = await pregnancyResponsePromise;
    expect(pregnancyResponse.status(), "Pregnancy must be created from the patient profile.").toBe(201);
    const pregnancyResult = await pregnancyResponse.json();
    expect(pregnancyResult.pregnancy).toMatchObject({
      patientId,
      gravida: 2,
      parity: 1,
      status: "ONGOING",
    });
    const pregnancyId = pregnancyResult.pregnancy.id;

    await expect(page.getByText("Pregnancy registered", { exact: true })).toBeVisible();
    await page.getByLabel("Visit date").fill(visitDate);
    await page.getByLabel("Weight (kg)").fill("64.2");
    await page.getByLabel("Blood pressure").fill("110/70");
    await page.getByLabel("Symptoms").fill("Synthetic routine visit");
    const ancResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/anc") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save visit" }).click();
    const ancResponse = await ancResponsePromise;
    expect(ancResponse.status(), "ANC visit must save from the patient profile.").toBe(201);
    const ancResult = await ancResponse.json();
    expect(ancResult.record).toMatchObject({
      patientId,
      pregnancyId,
      recordedById: account!.id,
      weight: 64.2,
      bloodPressure: "110/70",
    });
    const ancId = ancResult.record.id;

    await expect(page.getByText("Antenatal visit saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: fullName, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pregnancy registration" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Antenatal care" })).toBeVisible();
    await expect(page.getByText("ONGOING", { exact: true })).toBeVisible();
    await expect(page.getByText("110/70", { exact: true })).toBeVisible();
    await expect(page.getByText("Synthetic routine visit", { exact: true })).toBeVisible();

    const [persistedPatient, persistedPregnancy, persistedAnc] = await Promise.all([
      prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, fullName: true } }),
      prisma.pregnancy.findUnique({
        where: { id: pregnancyId },
        select: { id: true, patientId: true, gravida: true, parity: true },
      }),
      prisma.ancRecord.findUnique({
        where: { id: ancId },
        select: { id: true, patientId: true, pregnancyId: true, recordedById: true, weight: true },
      }),
    ]);
    expect(persistedPatient).toMatchObject({ id: patientId, fullName });
    expect(persistedPregnancy).toMatchObject({ id: pregnancyId, patientId, gravida: 2, parity: 1 });
    expect(persistedAnc).toMatchObject({
      id: ancId,
      patientId,
      pregnancyId,
      recordedById: account!.id,
      weight: 64.2,
    });

    const profileResponse = await page.request.get(`/api/patients/${patientId}`);
    expect(profileResponse.status()).toBe(200);
    const profile = await profileResponse.json();
    expect(profile.patient.pregnancies).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: pregnancyId, patientId })]),
    );
    expect(profile.patient.ancRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ancId, patientId, pregnancyId, recordedBy: { fullName: account!.fullName } }),
      ]),
    );

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "integration_tests",
      "IT-04",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "IT-04-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("IT-04 patient profile evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
