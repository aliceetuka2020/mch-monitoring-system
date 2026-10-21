import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("IT-05: registers a child for a synthetic patient and verifies the linked list/profile record", async ({
  page,
}, testInfo) => {
  const email = process.env.IT05_EMAIL;
  const password = process.env.IT05_PASSWORD;

  expect(email, "Set IT05_EMAIL to an active synthetic account that can register patients.").toBeTruthy();
  expect(password, "Set IT05_PASSWORD for the synthetic test account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true },
  });
  expect(account, "The configured test account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured test account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  const token = randomUUID();
  const motherName = `Synthetic IT-05 Mother ${token}`;
  const childName = `Synthetic IT-05 Child ${token}`;
  const motherPhone = `080${token.replaceAll("-", "").slice(0, 10)}`;
  const dateOfBirth = "2024-06-15";
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
    await page.getByLabel("Phone").fill(motherPhone);
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
    expect(patientResult.patient).toMatchObject({ fullName: motherName, phone: motherPhone });

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
    expect(childResponse.status(), "The child should be created successfully.").toBe(201);
    const childResult = await childResponse.json();
    const childId = childResult.child.id;
    expect(childResult.child).toMatchObject({
      name: childName,
      patientId,
      gender: "Female",
      birthWeight: 3.2,
      patient: { id: patientId, fullName: motherName, phone: motherPhone },
    });
    expect(childResult.child.childNo).toMatch(/^KPHC-CH-\d+$/);

    await expect(page.getByText("Child registered", { exact: true })).toBeVisible();
    const searchInput = page.getByPlaceholder("Search child name, child number or mother");
    await searchInput.fill(childName);
    const searchResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/children?") &&
        new URL(response.url()).searchParams.get("q") === childName,
    );
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const searchResponse = await searchResponsePromise;
    expect(searchResponse.status()).toBe(200);
    const searchResults = await searchResponse.json();
    expect(searchResults.pagination.total).toBe(1);
    expect(searchResults.children).toHaveLength(1);
    expect(searchResults.children[0]).toMatchObject({
      id: childId,
      name: childName,
      patientId,
      patient: { id: patientId, fullName: motherName },
    });
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first()).toContainText(childName);
    await expect(page.locator("tbody tr").first()).toContainText(motherName);

    await page.getByRole("button", { name: childName, exact: true }).click();
    await expect(page.getByRole("heading", { name: `Selected child, ${childName}` })).toBeVisible();
    const selectedProfile = page.locator(".panel").filter({ has: page.getByRole("heading", { name: `Selected child, ${childName}` }) });
    await expect(selectedProfile).toContainText(motherName);
    await expect(selectedProfile).toContainText("3.2 kg");
    await expect(selectedProfile).toContainText("Mother");

    const [persistedPatient, persistedChild, matchingChildren] = await Promise.all([
      prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, fullName: true } }),
      prisma.child.findUnique({
        where: { id: childId },
        select: { id: true, name: true, patientId: true, gender: true, birthWeight: true },
      }),
      prisma.child.count({ where: { name: childName, patientId } }),
    ]);
    expect(persistedPatient).toMatchObject({ id: patientId, fullName: motherName });
    expect(persistedChild).toMatchObject({
      id: childId,
      name: childName,
      patientId,
      gender: "Female",
      birthWeight: 3.2,
    });
    expect(matchingChildren, "Exactly one child record should be linked to the synthetic parent.").toBe(1);

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "integration_tests",
      "IT-05",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "IT-05-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("IT-05 child profile evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
