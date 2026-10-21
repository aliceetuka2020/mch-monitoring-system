import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ST-09: invalid patient and duplicate user input is rejected safely", async ({
  page,
}, testInfo) => {
  const uniqueId = randomUUID();
  const email = `st09-admin-${uniqueId}@healthcare.test`;
  const password = `SyntheticST09-${uniqueId.slice(0, 8)}A9`;
  const fullName = `Synthetic ST-09 Administrator ${uniqueId}`;
  let userId: number | undefined;

  try {
    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        username: `st09-admin-${uniqueId}`,
        password: await bcrypt.hash(password, 10),
        role: "system_administrator",
        active: true,
      },
      select: { id: true },
    });
    userId = user.id;

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    expect((await loginResponsePromise).status(), "The synthetic administrator must sign in.").toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/patients");
    await page.getByRole("button", { name: "Register mother" }).click();
    const fullNameInput = page.getByLabel("Full name");
    const phoneInput = page.getByLabel("Phone");
    await expect(fullNameInput).toHaveAttribute("required", "");
    await expect(phoneInput).toHaveAttribute("required", "");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect(
      await fullNameInput.evaluate((input: HTMLInputElement) => input.validity.valueMissing),
      "The browser must block an empty required full name.",
    ).toBe(true);
    expect(
      await phoneInput.evaluate((input: HTMLInputElement) => input.validity.valueMissing),
      "The browser must block an empty required phone.",
    ).toBe(true);

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "system",
      "ST-09",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "ST-09-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("ST-09 missing required fields evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });

    const missingFieldsResponse = await page.request.post("/api/patients", {
      data: {},
    });
    expect(missingFieldsResponse.status(), "Missing required fields must return 400.").toBe(400);
    const missingFieldsBody = await missingFieldsResponse.json();
    expect(missingFieldsBody).toEqual({ error: "fullName is required" });

    const malformedDateResponse = await page.request.post("/api/patients", {
      data: {
        fullName: `Synthetic ST-09 malformed date ${uniqueId}`,
        phone: "0000000000",
        dateOfBirth: "2024-02-31",
      },
    });
    expect(malformedDateResponse.status(), "Malformed dates must return 400.").toBe(400);
    expect(await malformedDateResponse.json()).toEqual({
      error: "dateOfBirth must be a valid date",
    });

    const oversizedName = `Synthetic ST-09 ${"X".repeat(201)}`;
    const oversizedResponse = await page.request.post("/api/patients", {
      data: { fullName: oversizedName, phone: "0000000000" },
    });
    expect(oversizedResponse.status(), "Text exceeding the patient name limit must return 400.").toBe(400);
    expect(await oversizedResponse.json()).toEqual({
      error: "fullName must be no longer than 200 characters",
    });

    const invalidIdResponse = await page.request.get("/api/patients/not-a-number");
    expect.soft(
      invalidIdResponse.status(),
      "A malformed patient ID must return a client-safe not-found response.",
    ).toBe(404);
    const invalidIdBody = await invalidIdResponse.text();
    expect.soft(invalidIdBody).toContain("Record not found");
    expect.soft(invalidIdBody).not.toMatch(/PrismaClient|stack|SELECT\s|DATABASE_URL|password/i);

    const duplicateUserResponse = await page.request.post("/api/users", {
      data: {
        fullName: `Synthetic ST-09 Duplicate ${uniqueId}`,
        email,
        password: `DuplicateST09-${uniqueId.slice(0, 8)}B8`,
        role: "medical_doctor",
      },
    });
    expect(duplicateUserResponse.status(), "Duplicate email must return 409.").toBe(409);
    expect(await duplicateUserResponse.json()).toEqual({
      error: "A user with that email already exists",
    });

    expect(
      await prisma.user.count({ where: { email } }),
      "Duplicate submission must not create another user with the same email.",
    ).toBe(1);
    expect(
      await prisma.patient.count({
        where: {
          OR: [
            { fullName: { contains: `Synthetic ST-09 malformed date ${uniqueId}` } },
            { fullName: { contains: "Synthetic ST-09 " + "X".repeat(40) } },
          ],
        },
      }),
      "Malformed or oversized patient submissions must not persist.",
    ).toBe(0);
  } finally {
    if (userId !== undefined) {
      await prisma.user.delete({ where: { id: userId } });
    }
  }
});
