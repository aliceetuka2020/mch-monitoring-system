import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("IT-06: records a scheduled vaccine and verifies history and due status", async ({
  page,
}, testInfo) => {
  const email = process.env.IT06_EMAIL;
  const password = process.env.IT06_PASSWORD;

  expect(email, "Set IT06_EMAIL to an active synthetic account that can register patients.").toBeTruthy();
  expect(password, "Set IT06_PASSWORD for the synthetic test account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true, fullName: true },
  });
  expect(account, "The configured synthetic account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured synthetic account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  await page.clock.install({ time: new Date("2026-04-01T12:00:00") });
  const token = randomUUID();
  const motherName = `Synthetic IT-06 Mother ${token}`;
  const motherPhone = `080${token.replaceAll("-", "").slice(0, 10)}`;
  const childName = `Synthetic IT-06 Child ${token}`;
  const dateOfBirth = "2026-01-01";
  const dateGiven = "2026-02-12";
  const expectedNextDueDate = "2026-03-12";
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
    await page.getByLabel("Date of birth").fill(dateOfBirth);
    await page.getByLabel("Birth weight, kg").fill("3.4");
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
    await expect(page.getByRole("heading", { name: `Immunization record for ${childName}` })).toBeVisible();
    await page.getByLabel("Vaccine and dose").selectOption({ label: "Penta, Penta 1" });
    await page.getByLabel("Date given").fill(dateGiven);

    const immunizationResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/immunizations") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Record vaccine", exact: true }).click();
    const immunizationResponse = await immunizationResponsePromise;
    expect(immunizationResponse.status(), "Scheduled vaccine administration should be accepted.").toBe(201);
    const created = (await immunizationResponse.json()).record;
    expect(created).toMatchObject({
      childId: child.id,
      vaccineName: "Penta",
      dose: "Penta 1",
      administeredBy: { fullName: account!.fullName },
    });
    expect(created.dateGiven.slice(0, 10)).toBe(dateGiven);
    expect(created.nextDueDate.slice(0, 10)).toBe(expectedNextDueDate);

    const scheduleTable = page
      .getByRole("heading", { name: "Scheduled doses and status" })
      .locator("xpath=following-sibling::table[1]");
    const givenDoseRow = scheduleTable.getByRole("row").filter({ hasText: "Penta 1" });
    await expect(givenDoseRow).toContainText("Given");
    const nextDoseRow = scheduleTable.getByRole("row").filter({ hasText: "Penta 2" });
    await expect(nextDoseRow).toContainText("Overdue");

    const historyTable = page
      .getByRole("heading", { name: "Recorded immunizations" })
      .locator("xpath=following-sibling::table[1]");
    const historyRow = historyTable.getByRole("row").filter({ hasText: "Penta 1" });
    await expect(historyRow).toHaveCount(1);
    await expect(historyRow).toContainText(dateGiven);
    await expect(historyRow).toContainText(expectedNextDueDate);
    await expect(historyRow).toContainText(account!.fullName);
    await expect(historyRow).toContainText("Given");

    const [persistedImmunization, matchingRecords] = await Promise.all([
      prisma.immunization.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          childId: true,
          vaccineName: true,
          dose: true,
          dateGiven: true,
          nextDueDate: true,
          administeredById: true,
        },
      }),
      prisma.immunization.count({
        where: { childId: child.id, vaccineName: "Penta", dose: "Penta 1" },
      }),
    ]);
    expect(persistedImmunization).toMatchObject({
      id: created.id,
      childId: child.id,
      vaccineName: "Penta",
      dose: "Penta 1",
      administeredById: account!.id,
    });
    expect(persistedImmunization?.dateGiven.toISOString().slice(0, 10)).toBe(dateGiven);
    expect(persistedImmunization?.nextDueDate?.toISOString().slice(0, 10)).toBe(expectedNextDueDate);
    expect(matchingRecords).toBe(1);

    const historyResponse = await page.request.get(`/api/immunizations?childId=${child.id}`);
    expect(historyResponse.status()).toBe(200);
    const history = await historyResponse.json();
    expect(history.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          childId: child.id,
          vaccineName: "Penta",
          dose: "Penta 1",
          administeredBy: { fullName: account!.fullName },
        }),
      ]),
    );

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "integration_tests",
      "IT-06",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "IT-06-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("IT-06 immunization status evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
