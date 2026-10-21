import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ST-04: records and revisits a child's growth measurements over time", async ({
  page,
}, testInfo) => {
  const email = process.env.ST04_EMAIL;
  const password = process.env.ST04_PASSWORD;

  expect(email, "Set ST04_EMAIL to an active synthetic account that can register patients.").toBeTruthy();
  expect(password, "Set ST04_PASSWORD for the synthetic test account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true },
  });
  expect(account, "The configured synthetic account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured synthetic account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  const uniqueId = randomUUID();
  const motherName = `Synthetic ST-04 Mother ${uniqueId}`;
  const childName = `Synthetic ST-04 Child ${uniqueId}`;
  const birthDate = "2025-01-15";
  const measurements = [
    {
      measurementDate: "2025-03-01",
      weight: "6.1",
      height: "58.4",
      headCircumference: "39.2",
      observation: "Synthetic earlier growth measurement",
      ageInMonths: 1,
    },
    {
      measurementDate: "2025-05-20",
      weight: "6.8",
      height: "62.1",
      headCircumference: "40.5",
      observation: "Synthetic later growth measurement",
      ageInMonths: 4,
    },
  ];
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
    expect(session.user.permissions).toContain("patients.register");
    expect(session.user.permissions).toContain("patients.view");

    await page.goto("/patients");
    await page.getByRole("button", { name: "Register mother" }).click();
    await page.getByLabel("Full name").fill(motherName);
    await page.getByLabel("Phone").fill("0000000000");
    const patientResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/patients") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const patientResponse = await patientResponsePromise;
    expect(patientResponse.status(), "Synthetic mother registration must succeed.").toBe(201);
    const patient = (await patientResponse.json()).patient;
    patientId = patient.id;
    expect(patient.fullName).toBe(motherName);

    await page.goto("/children");
    await expect(page.getByRole("heading", { name: "Children", exact: true })).toBeVisible();
    await page.getByLabel("Mother").selectOption(String(patientId));
    await page.getByLabel("Child name").fill(childName);
    await page.getByLabel("Date of birth").fill(birthDate);
    const childResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/children") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const childResponse = await childResponsePromise;
    expect(childResponse.status(), "Synthetic child registration must succeed.").toBe(201);
    const child = (await childResponse.json()).child;
    expect(child).toMatchObject({ name: childName, patientId });

    await page.getByRole("button", { name: childName, exact: true }).click();
    const growthPanel = page
      .locator(".panel")
      .filter({ has: page.getByRole("heading", { name: `Growth records for ${childName}` }) });
    await expect(growthPanel).toBeVisible();

    const createdRecords: Array<{
      id: number;
      childId: number;
      ageInMonths: number;
      weight: number;
      height: number;
      headCircumference: number;
      observation: string;
    }> = [];

    for (const measurement of measurements) {
      await growthPanel.getByLabel("Date", { exact: true }).fill(measurement.measurementDate);
      await growthPanel.getByLabel("Weight, kg").fill(measurement.weight);
      await growthPanel.getByLabel("Height, cm").fill(measurement.height);
      await growthPanel.getByLabel("Head circumference, cm").fill(measurement.headCircumference);
      await growthPanel.getByLabel("Observation").fill(measurement.observation);
      const growthResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/growth") &&
          response.request().method() === "POST",
      );
      await growthPanel.getByRole("button", { name: "Save measurement" }).click();
      const growthResponse = await growthResponsePromise;
      expect(growthResponse.status(), "Each growth measurement must be saved successfully.").toBe(201);
      const record = (await growthResponse.json()).record;
      expect(record).toMatchObject({
        childId: child.id,
        ageInMonths: measurement.ageInMonths,
        weight: Number(measurement.weight),
        height: Number(measurement.height),
        headCircumference: Number(measurement.headCircumference),
        observation: measurement.observation,
      });
      createdRecords.push(record);
      await expect(page.getByText("Growth record saved", { exact: true })).toBeVisible();
    }

    const historyTable = growthPanel.locator("table").last();
    const historyRows = historyTable.getByRole("row");
    await expect(historyRows).toHaveCount(3);
    await expect(historyRows.nth(1)).toContainText("20 May 2025");
    await expect(historyRows.nth(1)).toContainText("4 months");
    await expect(historyRows.nth(1)).toContainText("6.8 kg");
    await expect(historyRows.nth(1)).toContainText("62.1 cm");
    await expect(historyRows.nth(1)).toContainText("Synthetic later growth measurement");
    await expect(historyRows.nth(2)).toContainText("01 Mar 2025");
    await expect(historyRows.nth(2)).toContainText("1 month");
    await expect(historyRows.nth(2)).toContainText("6.1 kg");
    await expect(historyRows.nth(2)).toContainText("58.4 cm");
    await expect(historyRows.nth(2)).toContainText("Synthetic earlier growth measurement");

    const historyResponse = await page.request.get(`/api/growth?childId=${child.id}`);
    expect(historyResponse.status()).toBe(200);
    const history = await historyResponse.json();
    expect(history.records).toHaveLength(2);
    expect(history.records.map((record: { id: number }) => record.id)).toEqual([
      createdRecords[1].id,
      createdRecords[0].id,
    ]);
    expect(history.records.map((record: { childId: number }) => record.childId)).toEqual([
      child.id,
      child.id,
    ]);
    expect(
      history.records.map((record: { child: { name: string; dateOfBirth: string } }) => ({
        name: record.child.name,
        dateOfBirth: record.child.dateOfBirth.slice(0, 10),
      })),
    ).toEqual([
      { name: childName, dateOfBirth: birthDate },
      { name: childName, dateOfBirth: birthDate },
    ]);

    const persistedRecords = await prisma.growthRecord.findMany({
      where: { childId: child.id },
      orderBy: { measurementDate: "desc" },
      select: {
        id: true,
        childId: true,
        measurementDate: true,
        ageInMonths: true,
        weight: true,
        height: true,
        headCircumference: true,
        observation: true,
      },
    });
    expect(persistedRecords).toHaveLength(2);
    expect(persistedRecords.map((record) => record.id)).toEqual([
      createdRecords[1].id,
      createdRecords[0].id,
    ]);
    expect(persistedRecords[0]).toMatchObject({
      childId: child.id,
      ageInMonths: 4,
      weight: 6.8,
      height: 62.1,
      headCircumference: 40.5,
      observation: "Synthetic later growth measurement",
    });
    expect(persistedRecords[1]).toMatchObject({
      childId: child.id,
      ageInMonths: 1,
      weight: 6.1,
      height: 58.4,
      headCircumference: 39.2,
      observation: "Synthetic earlier growth measurement",
    });

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "system",
      "ST-04",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "ST-04-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("ST-04 child growth history evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
