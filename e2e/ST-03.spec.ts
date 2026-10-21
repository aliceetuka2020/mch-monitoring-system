import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ST-03: registers a synthetic child and verifies vaccine history and due statuses", async ({
  page,
}, testInfo) => {
  const email = process.env.ST03_EMAIL;
  const password = process.env.ST03_PASSWORD;

  expect(email, "Set ST03_EMAIL to an active synthetic account that can register patients.").toBeTruthy();
  expect(password, "Set ST03_PASSWORD for the synthetic test account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true, fullName: true },
  });
  expect(account, "The configured synthetic account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured synthetic account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  await page.clock.install({ time: new Date("2026-04-01T12:00:00") });
  const uniqueId = randomUUID();
  const motherName = `Synthetic ST-03 Mother ${uniqueId}`;
  const childName = `Synthetic ST-03 Child ${uniqueId}`;
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
    expect(patientResponse.status(), "The synthetic mother must register successfully.").toBe(201);
    const patient = (await patientResponse.json()).patient;
    patientId = patient.id;
    expect(patient.fullName).toBe(motherName);

    await page.goto("/children");
    await expect(page.getByRole("heading", { name: "Children", exact: true })).toBeVisible();
    await page.getByLabel("Mother").selectOption(String(patientId));
    await page.getByLabel("Child name").fill(childName);
    await page.getByLabel("Date of birth").fill(dateOfBirth);
    await page.getByLabel("Birth weight, kg").fill("3.2");
    const childResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/children") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const childResponse = await childResponsePromise;
    expect(childResponse.status(), "The synthetic child must register successfully.").toBe(201);
    const child = (await childResponse.json()).child;
    expect(child).toMatchObject({
      name: childName,
      patientId,
      birthWeight: 3.2,
      patient: { id: patientId, fullName: motherName },
    });
    expect(child.childNo).toMatch(/^KPHC-CH-\d+$/);
    await expect(page.getByText("Child registered", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: childName, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: `Immunization record for ${childName}` }),
    ).toBeVisible();
    await page.getByLabel("Vaccine and dose").selectOption({ label: "Penta, Penta 1" });
    await expect(page.getByLabel("Next due")).toHaveValue(expectedNextDueDate);
    await page.getByLabel("Date given").fill(dateGiven);
    const immunizationResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/immunizations") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Record vaccine", exact: true }).click();
    const immunizationResponse = await immunizationResponsePromise;
    expect(immunizationResponse.status(), "Scheduled vaccine administration must succeed.").toBe(201);
    const immunization = (await immunizationResponse.json()).record;
    expect(immunization).toMatchObject({
      childId: child.id,
      vaccineName: "Penta",
      dose: "Penta 1",
      administeredBy: { fullName: account!.fullName },
    });
    expect(immunization.dateGiven.slice(0, 10)).toBe(dateGiven);
    expect(immunization.nextDueDate.slice(0, 10)).toBe(expectedNextDueDate);
    await expect(page.getByText("Immunization recorded", { exact: true })).toBeVisible();

    const scheduleTable = page
      .getByRole("heading", { name: "Scheduled doses and status" })
      .locator("xpath=following-sibling::table[1]");
    const givenDoseRow = scheduleTable.getByRole("row").filter({ hasText: "Penta 1" });
    await expect(givenDoseRow).toContainText("Given");
    const overdueDoseRow = scheduleTable.getByRole("row").filter({ hasText: "Penta 2" });
    await expect(overdueDoseRow).toContainText("Overdue");
    const dueDoseRow = scheduleTable.getByRole("row").filter({ hasText: "Penta 3" });
    await expect(dueDoseRow).toContainText("Due");

    const immunizationHistory = page
      .getByRole("heading", { name: "Recorded immunizations" })
      .locator("xpath=following-sibling::table[1]");
    const recordedDoseRow = immunizationHistory.getByRole("row").filter({ hasText: "Penta 1" });
    await expect(recordedDoseRow).toHaveCount(1);
    await expect(recordedDoseRow).toContainText(dateGiven);
    await expect(recordedDoseRow).toContainText(expectedNextDueDate);
    await expect(recordedDoseRow).toContainText(account!.fullName);
    await expect(recordedDoseRow).toContainText("Given");

    const [persistedChild, persistedImmunization, matchingRecords, reminder] = await Promise.all([
      prisma.child.findUnique({
        where: { id: child.id },
        select: { id: true, name: true, patientId: true, dateOfBirth: true },
      }),
      prisma.immunization.findUnique({
        where: { id: immunization.id },
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
      prisma.notification.findFirst({
        where: {
          patientId,
          type: "IMMUNIZATION",
          dueDate: new Date(`${expectedNextDueDate}T00:00:00.000Z`),
        },
        select: { patientId: true, type: true, dueDate: true, status: true },
      }),
    ]);
    expect(persistedChild).toMatchObject({ id: child.id, name: childName, patientId });
    expect(persistedChild?.dateOfBirth.toISOString().slice(0, 10)).toBe(dateOfBirth);
    expect(persistedImmunization).toMatchObject({
      id: immunization.id,
      childId: child.id,
      vaccineName: "Penta",
      dose: "Penta 1",
      administeredById: account!.id,
    });
    expect(persistedImmunization?.dateGiven.toISOString().slice(0, 10)).toBe(dateGiven);
    expect(persistedImmunization?.nextDueDate?.toISOString().slice(0, 10)).toBe(expectedNextDueDate);
    expect(matchingRecords).toBe(1);
    expect(reminder).toMatchObject({ patientId, type: "IMMUNIZATION", status: "PENDING" });
    expect(reminder?.dueDate.toISOString().slice(0, 10)).toBe(expectedNextDueDate);

    const historyResponse = await page.request.get(`/api/immunizations?childId=${child.id}`);
    expect(historyResponse.status()).toBe(200);
    const history = await historyResponse.json();
    expect(history.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: immunization.id,
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
      "system",
      "ST-03",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "ST-03-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("ST-03 child immunization status evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
