import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("IT-03: registers a synthetic patient, persists it, and finds exactly one list result", async ({
  page,
}, testInfo) => {
  const email = process.env.IT03_EMAIL;
  const password = process.env.IT03_PASSWORD;

  expect(email, "Set IT03_EMAIL to an active synthetic account with patient registration permission.").toBeTruthy();
  expect(password, "Set IT03_PASSWORD for the synthetic registration account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true },
  });
  expect(account, "The configured registration account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured registration account must be active.").toBe(true);
  expect(account?.role, "Use the seeded community health extension worker role.").toBe(
    "community_health_extension_worker",
  );

  const uniqueToken = randomUUID();
  const fullName = `Synthetic IT-03 ${uniqueToken}`;
  const phone = `080${uniqueToken.replaceAll("-", "").slice(0, 10)}`;
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
    expect((await loginResponsePromise).status(), "The test account must sign in.").toBe(200);
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

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/patients") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status(), "Patient registration must persist successfully.").toBe(201);
    const created = await createResponse.json();
    expect(created.patient).toMatchObject({ fullName, phone });
    expect(created.patient.cardNo).toMatch(/^KPHC-\d+$/);
    patientId = created.patient.id;

    const persisted = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, fullName: true, phone: true, cardNo: true },
    });
    expect(persisted).toMatchObject({
      id: patientId,
      fullName,
      phone,
      cardNo: created.patient.cardNo,
    });

    await expect(page.getByText(`${fullName} registered with card number ${created.patient.cardNo}`)).toBeVisible();
    const searchInput = page.getByPlaceholder("Search by name, card number or phone");
    await searchInput.fill(fullName);
    const searchResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/patients?") &&
        new URL(response.url()).searchParams.get("q") === fullName,
    );
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const searchResponse = await searchResponsePromise;
    expect(searchResponse.status()).toBe(200);

    const searchResults = await searchResponse.json();
    expect(searchResults.pagination.total).toBe(1);
    expect(searchResults.patients).toHaveLength(1);
    expect(searchResults.patients[0]).toMatchObject({
      id: patientId,
      fullName,
      phone,
      cardNo: created.patient.cardNo,
    });

    const patientRows = page.locator("tbody tr");
    await expect(patientRows).toHaveCount(1);
    await expect(patientRows.first()).toContainText(fullName);
    await expect(patientRows.first()).toContainText(created.patient.cardNo);

    const databaseMatches = await prisma.patient.count({ where: { fullName, phone } });
    expect(databaseMatches, "Exactly one matching synthetic record must be stored.").toBe(1);

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "integration_tests",
      "IT-03",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "IT-03-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("IT-03 patient search evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
