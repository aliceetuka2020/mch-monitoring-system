import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ST-01: registers, retrieves, edits, and reloads a synthetic patient", async ({
  page,
}, testInfo) => {
  const email = process.env.ST01_EMAIL;
  const password = process.env.ST01_PASSWORD;

  expect(email, "Set ST01_EMAIL to an active synthetic account with patient permissions.").toBeTruthy();
  expect(password, "Set ST01_PASSWORD for the synthetic staff account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true },
  });
  expect(account, "The configured synthetic account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured synthetic account must be active.").toBe(true);

  const uniqueId = randomUUID();
  const fullName = `Synthetic ST-01 ${uniqueId}`;
  const phone = "0000000000";
  const updatedAddress = `Synthetic ST-01 address ${uniqueId}`;
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
    expect((await loginResponsePromise).status(), "The synthetic staff account must sign in.").toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);

    const sessionResponse = await page.request.get("/api/auth/me");
    expect(sessionResponse.status()).toBe(200);
    const session = await sessionResponse.json();
    expect(session.user.permissions).toContain("patients.register");
    expect(session.user.permissions).toContain("patients.view");
    expect(session.user.permissions).toContain("patients.update_demographics");

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
    expect(createResponse.status(), "The synthetic patient must be registered.").toBe(201);
    const created = (await createResponse.json()).patient;
    expect(created).toMatchObject({ fullName, phone });
    expect(created.cardNo).toMatch(/^KPHC-\d+$/);
    patientId = created.id;

    const persistedRegistration = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, fullName: true, phone: true, cardNo: true },
    });
    expect(persistedRegistration).toMatchObject({
      id: patientId,
      fullName,
      phone,
      cardNo: created.cardNo,
    });

    await expect(page.getByText(`${fullName} registered with card number ${created.cardNo}`)).toBeVisible();
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
    const searchResult = await searchResponse.json();
    expect(searchResult.pagination.total).toBe(1);
    expect(searchResult.patients).toHaveLength(1);
    expect(searchResult.patients[0]).toMatchObject({ id: patientId, fullName, cardNo: created.cardNo });

    await page.getByRole("link", { name: fullName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/patients/${patientId}$`));
    await expect(page.getByRole("heading", { name: fullName, exact: true })).toBeVisible();
    const profileResponse = await page.request.get(`/api/patients/${patientId}`);
    expect(profileResponse.status()).toBe(200);
    expect((await profileResponse.json()).patient).toMatchObject({
      id: patientId,
      fullName,
      phone,
      cardNo: created.cardNo,
    });

    await page.getByRole("button", { name: "Edit record" }).click();
    await page.getByLabel("Address").fill(updatedAddress);
    const updateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/patients/${patientId}`) &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "Save changes" }).click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.status(), "The non-critical address edit must succeed.").toBe(200);
    expect((await updateResponse.json()).patient).toMatchObject({
      id: patientId,
      fullName,
      address: updatedAddress,
    });
    await expect(page.getByText("Patient record updated", { exact: true })).toBeVisible();

    const persistedUpdate = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { fullName: true, phone: true, address: true, cardNo: true },
    });
    expect(persistedUpdate).toEqual({
      fullName,
      phone,
      address: updatedAddress,
      cardNo: created.cardNo,
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: fullName, exact: true })).toBeVisible();
    await expect(page.getByText(updatedAddress, { exact: true })).toBeVisible();
    const reloadedProfileResponse = await page.request.get(`/api/patients/${patientId}`);
    expect(reloadedProfileResponse.status()).toBe(200);
    expect((await reloadedProfileResponse.json()).patient).toMatchObject({
      id: patientId,
      fullName,
      address: updatedAddress,
      cardNo: created.cardNo,
    });

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "system",
      "ST-01",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "ST-01-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("ST-01 persisted patient profile evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
