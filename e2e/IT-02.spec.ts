import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("IT-02: health workers are denied user creation and administrators can create users", async ({
  page,
}, testInfo) => {
  const workerEmail = process.env.IT02_WORKER_EMAIL;
  const workerPassword = process.env.IT02_WORKER_PASSWORD;
  const administratorEmail = process.env.IT02_ADMIN_EMAIL;
  const administratorPassword = process.env.IT02_ADMIN_PASSWORD;

  expect(workerEmail, "Set IT02_WORKER_EMAIL to an active synthetic health-worker account.").toBeTruthy();
  expect(workerPassword, "Set IT02_WORKER_PASSWORD for the synthetic health-worker account.").toBeTruthy();
  expect(administratorEmail, "Set IT02_ADMIN_EMAIL to an active synthetic administrator account.").toBeTruthy();
  expect(administratorPassword, "Set IT02_ADMIN_PASSWORD for the synthetic administrator account.").toBeTruthy();

  const [worker, administrator] = await Promise.all([
    prisma.user.findUnique({
      where: { email: workerEmail! },
      select: { id: true, role: true, active: true },
    }),
    prisma.user.findUnique({
      where: { email: administratorEmail! },
      select: { id: true, role: true, active: true },
    }),
  ]);
  expect(worker, "The configured health-worker account must exist in the test database.").toBeTruthy();
  expect(worker?.active).toBe(true);
  expect(worker?.role).toBe("medical_doctor");
  expect(administrator, "The configured administrator account must exist in the test database.").toBeTruthy();
  expect(administrator?.active).toBe(true);
  expect(administrator?.role).toBe("system_administrator");

  const email = `it02-${randomUUID()}@healthcare.test`;
  const createUserPayload = {
    fullName: "Synthetic IT-02 User",
    email,
    password: "SyntheticIT02Pass2026",
    role: "medical_doctor",
  };

  async function signIn(accountEmail: string, password: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(accountEmail);
    await page.getByLabel("Password").fill(password);

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    const response = await responsePromise;
    expect(response.status(), "The configured active test account must sign in.").toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  try {
    await signIn(workerEmail!, workerPassword!);
    const deniedResponse = await page.request.post("/api/users", { data: createUserPayload });
    expect(deniedResponse.status(), "A health worker must not create user accounts.").toBe(403);
    expect(await deniedResponse.json()).toMatchObject({ error: "Not allowed" });
    expect(
      await prisma.user.findUnique({ where: { email }, select: { id: true } }),
      "A denied request must not persist a user.",
    ).toBeNull();

    const logoutResponse = await page.request.post("/api/auth/logout");
    expect(logoutResponse.status()).toBe(200);

    await signIn(administratorEmail!, administratorPassword!);
    const createdResponse = await page.request.post("/api/users", { data: createUserPayload });
    const createdBody = await createdResponse.json();
    const persistedUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, fullName: true, email: true, role: true, active: true },
    });

    if (createdResponse.status() === 201) {
      await page.goto("/users");
      await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
      await expect(page.getByText(email, { exact: true })).toBeVisible();
    }

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "integration_tests",
      "IT-02",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "IT-02-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("IT-02 user-management evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });

    expect(
      createdResponse.status(),
      "The administrator must be allowed to create a user account.",
    ).toBe(201);
    expect(createdBody.user).toMatchObject({
      fullName: createUserPayload.fullName,
      email,
      role: createUserPayload.role,
      active: true,
    });
    expect(persistedUser).toMatchObject({
      fullName: createUserPayload.fullName,
      email,
      role: createUserPayload.role,
      active: true,
    });
  } finally {
    const testUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } });
    }
  }
});
