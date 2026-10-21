import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ST-02: records pregnancy and ANC follow-up for a synthetic mother", async ({
  page,
}, testInfo) => {
  const email = process.env.ST02_EMAIL;
  const password = process.env.ST02_PASSWORD;

  expect(email, "Set ST02_EMAIL to an active synthetic account allowed to register patients.").toBeTruthy();
  expect(password, "Set ST02_PASSWORD for the synthetic test account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true, fullName: true },
  });
  expect(account, "The configured synthetic account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured synthetic account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  const uniqueId = randomUUID();
  const fullName = `Synthetic ST-02 ${uniqueId}`;
  const phone = "0000000000";
  const lastMenstrualPeriod = "2026-08-03";
  const visitDate = "2026-10-19";
  const nextVisit = "2026-11-02";
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
    await expect(page.getByRole("heading", { name: "Mothers", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Register mother" }).click();
    await page.getByLabel("Full name").fill(fullName);
    await page.getByLabel("Phone").fill(phone);
    const createPatientPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/patients") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const patientResponse = await createPatientPromise;
    expect(patientResponse.status(), "Synthetic mother registration must succeed.").toBe(201);
    const patient = (await patientResponse.json()).patient;
    patientId = patient.id;
    expect(patient).toMatchObject({ fullName, phone });

    await expect(page.getByText(`${fullName} registered with card number ${patient.cardNo}`)).toBeVisible();
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
    expect(pregnancyResponse.status(), "Pregnancy registration from the profile must succeed.").toBe(201);
    const pregnancy = (await pregnancyResponse.json()).pregnancy;
    expect(pregnancy).toMatchObject({
      patientId,
      lastMenstrualPeriod: `${lastMenstrualPeriod}T00:00:00.000Z`,
      gravida: 2,
      parity: 1,
      status: "ONGOING",
    });
    expect(pregnancy.estimatedDeliveryDate).toBeTruthy();
    await expect(page.getByText("Pregnancy registered", { exact: true })).toBeVisible();

    await page.getByLabel("Visit date").fill(visitDate);
    await page.getByLabel("Weight (kg)").fill("64.2");
    await page.getByLabel("Blood pressure").fill("110/70");
    await page.getByLabel("Symptoms").fill("Synthetic routine antenatal check");
    await page.getByLabel("Next visit").fill(nextVisit);
    const ancResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/anc") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save visit" }).click();
    const ancResponse = await ancResponsePromise;
    expect(ancResponse.status(), "ANC visit and follow-up date must be accepted.").toBe(201);
    const anc = (await ancResponse.json()).record;
    expect(anc).toMatchObject({
      patientId,
      pregnancyId: pregnancy.id,
      recordedById: account!.id,
      weight: 64.2,
      bloodPressure: "110/70",
      symptoms: "Synthetic routine antenatal check",
      nextVisit: `${nextVisit}T00:00:00.000Z`,
    });
    expect(anc.gestationalAge).toBe("11 weeks");
    await expect(page.getByText("Antenatal visit saved", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: fullName, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pregnancy registration" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Antenatal care" })).toBeVisible();
    await expect(page.getByText("ONGOING", { exact: true })).toBeVisible();
    await expect(page.getByText("110/70", { exact: true })).toBeVisible();
    await expect(page.getByText("Synthetic routine antenatal check", { exact: true })).toBeVisible();

    const [persistedPatient, persistedPregnancy, persistedAnc, followUpNotification] =
      await Promise.all([
        prisma.patient.findUnique({
          where: { id: patientId },
          select: { id: true, fullName: true, cardNo: true },
        }),
        prisma.pregnancy.findUnique({
          where: { id: pregnancy.id },
          select: {
            id: true,
            patientId: true,
            gravida: true,
            parity: true,
            lastMenstrualPeriod: true,
            estimatedDeliveryDate: true,
            status: true,
          },
        }),
        prisma.ancRecord.findUnique({
          where: { id: anc.id },
          select: {
            id: true,
            patientId: true,
            pregnancyId: true,
            recordedById: true,
            gestationalAge: true,
            nextVisit: true,
            symptoms: true,
          },
        }),
        prisma.notification.findFirst({
          where: { patientId, type: "ANC", dueDate: new Date(`${nextVisit}T00:00:00.000Z`) },
          select: { patientId: true, type: true, dueDate: true, status: true },
        }),
      ]);

    expect(persistedPatient).toMatchObject({ id: patientId, fullName, cardNo: patient.cardNo });
    expect(persistedPregnancy).toMatchObject({
      id: pregnancy.id,
      patientId,
      gravida: 2,
      parity: 1,
      status: "ONGOING",
    });
    expect(persistedPregnancy?.lastMenstrualPeriod?.toISOString()).toBe(
      `${lastMenstrualPeriod}T00:00:00.000Z`,
    );
    expect(persistedPregnancy?.estimatedDeliveryDate?.toISOString()).toBe(
      pregnancy.estimatedDeliveryDate,
    );
    expect(persistedAnc).toMatchObject({
      id: anc.id,
      patientId,
      pregnancyId: pregnancy.id,
      recordedById: account!.id,
      gestationalAge: "11 weeks",
      symptoms: "Synthetic routine antenatal check",
    });
    expect(persistedAnc?.nextVisit?.toISOString()).toBe(`${nextVisit}T00:00:00.000Z`);
    expect(followUpNotification).toMatchObject({
      patientId,
      type: "ANC",
      status: "PENDING",
    });
    expect(followUpNotification?.dueDate.toISOString()).toBe(`${nextVisit}T00:00:00.000Z`);

    const profileResponse = await page.request.get(`/api/patients/${patientId}`);
    expect(profileResponse.status()).toBe(200);
    const profile = (await profileResponse.json()).patient;
    expect(profile.pregnancies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pregnancy.id,
          patientId,
          gravida: 2,
          parity: 1,
        }),
      ]),
    );
    expect(profile.ancRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: anc.id,
          patientId,
          pregnancyId: pregnancy.id,
          nextVisit: `${nextVisit}T00:00:00.000Z`,
          recordedBy: { fullName: account!.fullName },
        }),
      ]),
    );

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "system",
      "ST-02",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "ST-02-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("ST-02 maternal and ANC follow-up evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
