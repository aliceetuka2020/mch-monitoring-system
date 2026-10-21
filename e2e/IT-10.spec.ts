import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("IT-10: administrator deactivation prevents the account from authenticating", async ({
  page,
  context,
}, testInfo) => {
  const uniqueId = randomUUID();
  const adminEmail = `it10-admin-${uniqueId}@healthcare.test`;
  const adminPassword = `SyntheticAdmin-${uniqueId.slice(0, 8)}A9`;
  const testEmail = `it10-${uniqueId}@healthcare.test`;
  const testPassword = `SyntheticIT10-${uniqueId.slice(0, 8)}A9`;
  let testUserId: number | undefined;
  let administratorId: number | undefined;

  try {
    const administrator = await prisma.user.create({
      data: {
        fullName: `Synthetic IT-10 Administrator ${uniqueId}`,
        email: adminEmail,
        username: `it10-admin-${uniqueId}`,
        password: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
        active: true,
      },
      select: { id: true, role: true, active: true },
    });
    administratorId = administrator.id;
    expect(administrator).toMatchObject({ role: "ADMIN", active: true });

    const createdUser = await prisma.user.create({
      data: {
        fullName: `Synthetic IT-10 ${uniqueId}`,
        email: testEmail,
        username: `it10-${uniqueId}`,
        password: await bcrypt.hash(testPassword, 10),
        role: "community_health_extension_worker",
        active: true,
      },
      select: { id: true, email: true, active: true, role: true },
    });
    testUserId = createdUser.id;
    expect(createdUser).toMatchObject({
      email: testEmail,
      active: true,
      role: "community_health_extension_worker",
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill(adminEmail!);
    await page.getByLabel("Password").fill(adminPassword!);
    const adminLoginPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    expect((await adminLoginPromise).status(), "Administrator authentication must succeed.").toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);

    const adminSession = await page.request.get("/api/auth/me");
    expect(adminSession.status()).toBe(200);
    expect((await adminSession.json()).user.role).toBe("ADMIN");

    const deactivateResponse = await page.request.patch(`/api/users/${testUserId}`, {
      data: { active: false },
    });
    expect(deactivateResponse.status(), "Administrator must be allowed to deactivate the account.").toBe(200);
    expect(await deactivateResponse.json()).toMatchObject({
      user: { id: testUserId, active: false, role: "community_health_extension_worker" },
    });

    const persistedInactiveUser = await prisma.user.findUnique({
      where: { id: testUserId },
      select: { id: true, active: true, role: true },
    });
    expect(persistedInactiveUser).toMatchObject({
      id: testUserId,
      active: false,
      role: "community_health_extension_worker",
    });

    const logoutResponse = await page.request.post("/api/auth/logout");
    expect(logoutResponse.status()).toBe(200);
    await page.goto("/login");
    await page.getByLabel("Email").fill(testEmail);
    await page.getByLabel("Password").fill(testPassword);
    const deactivatedLoginPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    const deactivatedLogin = await deactivatedLoginPromise;
    expect(deactivatedLogin.status(), "Deactivated credentials must be rejected.").toBe(401);
    await expect(page.getByText("Invalid email or password", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(
      (await context.cookies()).some((cookie) => cookie.name === "mch_session"),
      "Failed login must not establish a session cookie.",
    ).toBe(false);
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "integration_tests",
      "IT-10",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "IT-10-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("IT-10 deactivated login evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (testUserId !== undefined) {
      await prisma.user.delete({ where: { id: testUserId } });
    }
    if (administratorId !== undefined) {
      await prisma.user.delete({ where: { id: administratorId } });
    }
  }
});
