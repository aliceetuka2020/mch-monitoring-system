import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ST-07: administrative pages and APIs enforce role access", async ({ browser }, testInfo) => {
  const uniqueId = randomUUID();
  const workerEmail = `st07-worker-${uniqueId}@healthcare.test`;
  const workerPassword = `SyntheticWorker-${uniqueId.slice(0, 8)}A9`;
  const adminEmail = `st07-admin-${uniqueId}@healthcare.test`;
  const adminPassword = `SyntheticAdmin-${uniqueId.slice(0, 8)}B8`;
  const createdUserEmail = `st07-created-${uniqueId}@healthcare.test`;
  const createdUserPassword = `SyntheticCreated-${uniqueId.slice(0, 8)}C7`;
  const attemptedFacilityName = `Unauthorized ST-07 ${uniqueId}`;
  let workerId: number | undefined;
  let administratorId: number | undefined;
  let createdUserId: number | undefined;
  let workerContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let administratorContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    const worker = await prisma.user.create({
      data: {
        fullName: `Synthetic ST-07 Worker ${uniqueId}`,
        email: workerEmail,
        username: `st07-worker-${uniqueId}`,
        password: await bcrypt.hash(workerPassword, 10),
        role: "medical_doctor",
        active: true,
      },
      select: { id: true, role: true, active: true },
    });
    workerId = worker.id;
    expect(worker).toMatchObject({ role: "medical_doctor", active: true });

    const administrator = await prisma.user.create({
      data: {
        fullName: `Synthetic ST-07 Administrator ${uniqueId}`,
        email: adminEmail,
        username: `st07-admin-${uniqueId}`,
        password: await bcrypt.hash(adminPassword, 10),
        role: "system_administrator",
        active: true,
      },
      select: { id: true, role: true, active: true },
    });
    administratorId = administrator.id;
    expect(administrator).toMatchObject({ role: "system_administrator", active: true });

    workerContext = await browser.newContext();
    const workerPage = await workerContext.newPage();
    await workerPage.goto("/login");
    await workerPage.getByLabel("Email").fill(workerEmail);
    await workerPage.getByLabel("Password").fill(workerPassword);
    const workerLoginPromise = workerPage.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await workerPage.getByRole("button", { name: "Sign in" }).click();
    expect((await workerLoginPromise).status(), "The synthetic low-privilege user must sign in.").toBe(200);
    await expect(workerPage).toHaveURL(/\/dashboard$/);

    const workerSession = await workerPage.request.get("/api/auth/me");
    expect(workerSession.status()).toBe(200);
    expect((await workerSession.json()).user).toMatchObject({
      id: worker.id,
      role: "medical_doctor",
    });

    await workerPage.goto("/users");
    await expect(workerPage).toHaveURL(/\/dashboard$/);
    await expect(workerPage.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(workerPage.getByRole("link", { name: "Users", exact: true })).toHaveCount(0);

    const deniedUsersList = await workerPage.request.get("/api/users");
    expect(deniedUsersList.status(), "Low-privilege user listing must be denied by the API.").toBe(403);
    expect(await deniedUsersList.json()).toMatchObject({ error: "Not allowed" });

    const deniedUserCreate = await workerPage.request.post("/api/users", {
      data: {
        fullName: `Synthetic ST-07 Denied ${uniqueId}`,
        email: createdUserEmail,
        password: createdUserPassword,
        role: "medical_doctor",
      },
    });
    expect(deniedUserCreate.status(), "Low-privilege user creation must be denied by the API.").toBe(403);
    expect(await deniedUserCreate.json()).toMatchObject({ error: "Not allowed" });
    expect(await prisma.user.findUnique({ where: { email: createdUserEmail } })).toBeNull();

    const settingBefore = await prisma.setting.findUnique({
      where: { key: "facilityName" },
      select: { value: true },
    });
    const deniedSettingsRead = await workerPage.request.get("/api/settings");
    expect(deniedSettingsRead.status(), "Low-privilege settings access must be denied by the API.").toBe(403);
    expect(await deniedSettingsRead.json()).toMatchObject({ error: "Not allowed" });

    const deniedSettingsUpdate = await workerPage.request.put("/api/settings", {
      data: { facilityName: attemptedFacilityName },
    });
    expect(deniedSettingsUpdate.status(), "Low-privilege settings changes must be denied by the API.").toBe(403);
    expect(await deniedSettingsUpdate.json()).toMatchObject({ error: "Not allowed" });
    expect(
      await prisma.setting.findUnique({ where: { key: "facilityName" }, select: { value: true } }),
    ).toEqual(settingBefore);

    await workerPage.goto("/settings");
    await expect(workerPage.getByRole("heading", { name: "System settings", exact: true })).toBeVisible();
    await expect(workerPage.getByRole("heading", { name: "Change my password", exact: true })).toBeVisible();
    await expect(
      workerPage.getByRole("heading", { name: "Facility and reminder settings", exact: true }),
    ).toHaveCount(0);
    await expect(workerPage.getByRole("heading", { name: "Database backups", exact: true })).toHaveCount(0);

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "system",
      "ST-07",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const deniedScreenshotPath = path.join(evidenceDirectory, "ST-07-denied-evidence.png");
    await workerPage.screenshot({ path: deniedScreenshotPath });
    await testInfo.attach("ST-07 low-privilege settings evidence", {
      path: deniedScreenshotPath,
      contentType: "image/png",
    });

    administratorContext = await browser.newContext();
    const administratorPage = await administratorContext.newPage();
    await administratorPage.goto("/login");
    await administratorPage.getByLabel("Email").fill(adminEmail);
    await administratorPage.getByLabel("Password").fill(adminPassword);
    const administratorLoginPromise = administratorPage.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await administratorPage.getByRole("button", { name: "Sign in" }).click();
    expect((await administratorLoginPromise).status(), "The synthetic administrator must sign in.").toBe(200);
    await expect(administratorPage).toHaveURL(/\/dashboard$/);

    const administratorSession = await administratorPage.request.get("/api/auth/me");
    expect(administratorSession.status()).toBe(200);
    expect((await administratorSession.json()).user).toMatchObject({
      id: administrator.id,
      role: "system_administrator",
    });

    const allowedUsersList = await administratorPage.request.get("/api/users?page=1&pageSize=100");
    expect(allowedUsersList.status(), "The administrator must be allowed to list users.").toBe(200);
    expect((await allowedUsersList.json()).users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: worker.id, email: workerEmail, role: "medical_doctor" }),
        expect.objectContaining({ id: administrator.id, email: adminEmail, role: "system_administrator" }),
      ]),
    );
    const allowedSettingsRead = await administratorPage.request.get("/api/settings");
    expect(allowedSettingsRead.status(), "The administrator must be allowed to read settings.").toBe(200);

    await administratorPage.goto("/users");
    await expect(administratorPage.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
    await administratorPage.getByLabel("Full name").fill(`Synthetic ST-07 Created ${uniqueId}`);
    await administratorPage.getByLabel("Email").fill(createdUserEmail);
    await administratorPage.getByLabel("Password").fill(createdUserPassword);
    await administratorPage.getByLabel("Role").selectOption("medical_doctor");
    const createUserPromise = administratorPage.waitForResponse(
      (response) =>
        response.url().endsWith("/api/users") &&
        response.request().method() === "POST",
    );
    await administratorPage.getByRole("button", { name: "Create account" }).click();
    const createUserResponse = await createUserPromise;
    expect(createUserResponse.status(), "The administrator must be allowed to create an account.").toBe(201);
    const createdUser = (await createUserResponse.json()).user;
    createdUserId = createdUser.id;
    expect(createdUser).toMatchObject({
      fullName: `Synthetic ST-07 Created ${uniqueId}`,
      email: createdUserEmail,
      role: "medical_doctor",
      active: true,
    });
    await expect(administratorPage.getByText("User account created", { exact: true })).toBeVisible();
    await expect(administratorPage.getByRole("row").filter({ hasText: createdUserEmail })).toHaveCount(1);
    const administratorScreenshotPath = path.join(evidenceDirectory, "ST-07-admin-evidence.png");
    await administratorPage.screenshot({ path: administratorScreenshotPath });
    await testInfo.attach("ST-07 administrator user-management evidence", {
      path: administratorScreenshotPath,
      contentType: "image/png",
    });

    const persistedCreatedUser = await prisma.user.findUnique({
      where: { id: createdUserId },
      select: { id: true, fullName: true, email: true, role: true, active: true, password: true },
    });
    expect(persistedCreatedUser).toMatchObject({
      id: createdUserId,
      fullName: `Synthetic ST-07 Created ${uniqueId}`,
      email: createdUserEmail,
      role: "medical_doctor",
      active: true,
    });
    expect(persistedCreatedUser?.password).not.toBe(createdUserPassword);
    expect(await bcrypt.compare(createdUserPassword, persistedCreatedUser!.password)).toBe(true);

    await administratorPage.goto("/settings");
    await expect(
      administratorPage.getByRole("heading", { name: "Facility and reminder settings", exact: true }),
    ).toBeVisible();
    await expect(administratorPage.getByRole("heading", { name: "Database backups", exact: true })).toBeVisible();
    await administratorPage.goto("/reports");
    await expect(administratorPage.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    await expect(
      administratorPage.getByRole("link", { name: "Export CSV", exact: true }),
    ).toBeVisible();
  } finally {
    if (workerContext) await workerContext.close();
    if (administratorContext) await administratorContext.close();
    if (createdUserId !== undefined) {
      await prisma.user.delete({ where: { id: createdUserId } });
    }
    if (workerId !== undefined) {
      await prisma.user.delete({ where: { id: workerId } });
    }
    if (administratorId !== undefined) {
      await prisma.user.delete({ where: { id: administratorId } });
    }
  }
});
