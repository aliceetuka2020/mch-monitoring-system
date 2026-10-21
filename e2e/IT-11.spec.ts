import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("IT-11: changes a synthetic user's password and validates old/new login credentials", async ({
  browser,
}, testInfo) => {
  const uniqueId = randomUUID();
  const email = `it11-${uniqueId}@healthcare.test`;
  const oldPassword = `SyntheticOld-${uniqueId.slice(0, 8)}A9`;
  const newPassword = `SyntheticNew-${uniqueId.slice(0, 8)}B8`;
  let userId: number | undefined;

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const user = await prisma.user.create({
      data: {
        fullName: `Synthetic IT-11 ${uniqueId}`,
        email,
        username: `it11-${uniqueId}`,
        password: await bcrypt.hash(oldPassword, 10),
        role: "community_health_extension_worker",
        active: true,
      },
      select: { id: true, email: true, password: true, role: true },
    });
    userId = user.id;
    expect(user.password).not.toBe(oldPassword);
    expect(await bcrypt.compare(oldPassword, user.password)).toBe(true);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(oldPassword);
    const initialLoginPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    expect((await initialLoginPromise).status(), "The initial synthetic password must work.").toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);

    const initialSession = await page.request.get("/api/auth/me");
    expect(initialSession.status()).toBe(200);
    expect((await initialSession.json()).user).toMatchObject({
      id: userId,
      role: "community_health_extension_worker",
    });

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Change my password" })).toBeVisible();
    await page.getByLabel("Current password").fill(oldPassword);
    await page.getByLabel("New password").fill(newPassword);
    const changePasswordPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/password") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    const changePasswordResponse = await changePasswordPromise;
    expect(changePasswordResponse.status(), "Password change must succeed.").toBe(200);
    expect(await changePasswordResponse.json()).toMatchObject({ ok: true });
    await expect(page.getByText("Password changed", { exact: true })).toBeVisible();

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    expect(updatedUser).toBeTruthy();
    expect(updatedUser!.password).not.toBe(oldPassword);
    expect(updatedUser!.password).not.toBe(newPassword);
    expect(updatedUser!.password).not.toBe(user.password);
    expect(await bcrypt.compare(newPassword, updatedUser!.password)).toBe(true);
    expect(await bcrypt.compare(oldPassword, updatedUser!.password)).toBe(false);

    await page.request.post("/api/auth/logout");
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(oldPassword);
    const oldPasswordLoginPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    const oldPasswordResponse = await oldPasswordLoginPromise;
    expect(oldPasswordResponse.status(), "The previous password must no longer authenticate.").toBe(401);
    await expect(page.getByText("Invalid email or password", { exact: true })).toBeVisible();
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);

    await page.getByLabel("Password").fill(newPassword);
    const newPasswordLoginPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    const newPasswordResponse = await newPasswordLoginPromise;
    expect(newPasswordResponse.status(), "The changed password must authenticate.").toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);
    const newSession = await page.request.get("/api/auth/me");
    expect(newSession.status()).toBe(200);
    expect((await newSession.json()).user).toMatchObject({
      id: userId,
      role: "community_health_extension_worker",
    });

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "integration_tests",
      "IT-11",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "IT-11-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("IT-11 new password login evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    await context.close();
    if (userId !== undefined) {
      await prisma.user.delete({ where: { id: userId } });
    }
  }
});
