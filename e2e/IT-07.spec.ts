import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("IT-07: stores two linked growth measurements and displays newest first", async ({
  page,
}, testInfo) => {
  const email = process.env.IT07_EMAIL;
  const password = process.env.IT07_PASSWORD;

  expect(email, "Set IT07_EMAIL to an active synthetic account with patient registration access.").toBeTruthy();
  expect(password, "Set IT07_PASSWORD for the synthetic test account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true },
  });
  expect(account, "The configured test account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured test account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  const token = randomUUID();
  const motherName = `Synthetic IT-07 Mother ${token}`;
  const motherPhone = `080${token.replaceAll("-", "").slice(0, 10)}`;
  const childName = `Synthetic IT-07 Child ${token}`;
  const birthDate = "2025-01-15";
  const earlierMeasurement = {
    measurementDate: "2025-03-01",
    weight: "6.1",
    height: "58.4",
    headCircumference: "39.2",
    observation: "Synthetic earlier measurement",
  };
  const laterMeasurement = {
    measurementDate: "2025-05-20",
    weight: "6.8",
    height: "62.1",
    headCircumference: "40.5",
    observation: "Synthetic later measurement",
  };
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

    await page.goto("/patients");
    await page.getByRole("button", { name: "Register mother" }).click();
    await page.getByLabel("Full name").fill(motherName);
    await page.getByLabel("Phone").fill(motherPhone);
    const patientResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/patients") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const patientResponse = await patientResponsePromise;
    expect(patientResponse.status()).toBe(201);
    patientId = (await patientResponse.json()).patient.id;

    await page.goto("/children");
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
    expect(childResponse.status()).toBe(201);
    const child = (await childResponse.json()).child;
    expect(child).toMatchObject({ name: childName, patientId });

    await page.getByRole("button", { name: childName, exact: true }).click();
    const growthPanel = page
      .locator(".panel")
      .filter({ has: page.getByRole("heading", { name: `Growth records for ${childName}` }) });

    async function addMeasurement(measurement: typeof earlierMeasurement) {
      await growthPanel.getByLabel("Date", { exact: true }).fill(measurement.measurementDate);
      await growthPanel.getByLabel("Weight, kg").fill(measurement.weight);
      await growthPanel.getByLabel("Height, cm").fill(measurement.height);
      await growthPanel.getByLabel("Head circumference, cm").fill(measurement.headCircumference);
      await growthPanel.getByLabel("Observation").fill(measurement.observation);
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/growth") &&
          response.request().method() === "POST",
      );
      await growthPanel.getByRole("button", { name: "Save measurement" }).click();
      const response = await responsePromise;
      expect(response.status(), "Growth measurement should save successfully.").toBe(201);
      return (await response.json()).record;
    }

    const earlierResult = await addMeasurement(earlierMeasurement);
    expect(earlierResult).toMatchObject({
      childId: child.id,
      ageInMonths: 1,
      weight: 6.1,
      height: 58.4,
      headCircumference: 39.2,
      observation: earlierMeasurement.observation,
    });
    const laterResult = await addMeasurement(laterMeasurement);
    expect(laterResult).toMatchObject({
      childId: child.id,
      ageInMonths: 4,
      weight: 6.8,
      height: 62.1,
      headCircumference: 40.5,
      observation: laterMeasurement.observation,
    });

    const growthTable = growthPanel.locator("table").last();
    const growthRows = growthTable.getByRole("row");
    await expect(growthRows).toHaveCount(3);
    await expect(growthRows.nth(1)).toContainText("20 May 2025");
    await expect(growthRows.nth(1)).toContainText("4 months");
    await expect(growthRows.nth(1)).toContainText("6.8 kg");
    await expect(growthRows.nth(2)).toContainText("01 Mar 2025");
    await expect(growthRows.nth(2)).toContainText("1 month");
    await expect(growthRows.nth(2)).toContainText("6.1 kg");

    const historyResponse = await page.request.get(`/api/growth?childId=${child.id}`);
    expect(historyResponse.status()).toBe(200);
    const history = await historyResponse.json();
    expect(history.records).toHaveLength(2);
    expect(history.records.map((record: { id: number }) => record.id)).toEqual([
      laterResult.id,
      earlierResult.id,
    ]);
    expect(history.records.map((record: { childId: number }) => record.childId)).toEqual([
      child.id,
      child.id,
    ]);
    expect(history.records.map((record: { child: { name: string } }) => record.child.name)).toEqual([
      childName,
      childName,
    ]);

    const persisted = await prisma.growthRecord.findMany({
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
    expect(persisted).toHaveLength(2);
    expect(persisted.map((record) => record.id)).toEqual([laterResult.id, earlierResult.id]);
    expect(persisted[0]).toMatchObject({
      childId: child.id,
      ageInMonths: 4,
      weight: 6.8,
      height: 62.1,
      observation: laterMeasurement.observation,
    });
    expect(persisted[1]).toMatchObject({
      childId: child.id,
      ageInMonths: 1,
      weight: 6.1,
      height: 58.4,
      observation: earlierMeasurement.observation,
    });

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "integration_tests",
      "IT-07",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "IT-07-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("IT-07 growth history evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
