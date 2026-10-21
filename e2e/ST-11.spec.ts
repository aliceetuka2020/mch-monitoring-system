import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ST-11: core workflow remains usable at desktop and laptop viewports", async ({
  browser,
}, testInfo) => {
  const uniqueId = randomUUID();
  const email = `st11-${uniqueId}@healthcare.test`;
  const password = `SyntheticST11-${uniqueId.slice(0, 8)}A9`;
  const fullName = `Synthetic ST-11 Patient ${uniqueId}`;
  const phone = "0000000000";
  let userId: number | undefined;
  let patientId: number | undefined;
  let context: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    expect(browser.browserType().name(), "The configured supported browser is Chromium.").toBe("chromium");

    const user = await prisma.user.create({
      data: {
        fullName: `Synthetic ST-11 User ${uniqueId}`,
        email,
        username: `st11-${uniqueId}`,
        password: await bcrypt.hash(password, 10),
        role: "community_health_extension_worker",
        active: true,
      },
      select: { id: true },
    });
    userId = user.id;

    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    expect((await loginResponsePromise).status(), "The synthetic account must sign in.").toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mothers", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Mothers", exact: true }).click();
    await expect(page).toHaveURL(/\/patients$/);
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
    expect(createResponse.status(), "Patient registration must remain operable.").toBe(201);
    const createdPatient = (await createResponse.json()).patient;
    patientId = createdPatient.id;
    expect(createdPatient).toMatchObject({ fullName, phone });
    await expect(page.getByText(`${fullName} registered with card number ${createdPatient.cardNo}`)).toBeVisible();
    await page.getByPlaceholder("Search by name, card number or phone").fill(fullName);
    const desktopSearchPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/patients?") &&
        new URL(response.url()).searchParams.get("q") === fullName,
    );
    await page.getByRole("button", { name: "Search", exact: true }).click();
    expect((await desktopSearchPromise).status()).toBe(200);
    await expect(page.getByRole("link", { name: fullName, exact: true })).toBeVisible();

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "system",
      "ST-11",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const desktopScreenshotPath = path.join(evidenceDirectory, "ST-11-desktop-evidence.png");
    await page.screenshot({ path: desktopScreenshotPath });
    await testInfo.attach("ST-11 desktop workflow evidence", {
      path: desktopScreenshotPath,
      contentType: "image/png",
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByRole("heading", { name: "Mothers", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register mother" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register mother" })).toBeEnabled();
    await expect(page.getByRole("link", { name: fullName, exact: true })).toBeVisible();
    const laptopLayout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      registerButtonBounds: document
        .querySelector("button.btn-primary")
        ?.getBoundingClientRect()
        .toJSON(),
    }));
    expect(
      laptopLayout.documentWidth,
      "The page must not require horizontal scrolling at the laptop viewport.",
    ).toBeLessThanOrEqual(laptopLayout.viewportWidth);
    expect(laptopLayout.registerButtonBounds?.right).toBeLessThanOrEqual(laptopLayout.viewportWidth);

    const laptopScreenshotPath = path.join(evidenceDirectory, "ST-11-laptop-evidence.png");
    await page.screenshot({ path: laptopScreenshotPath });
    await testInfo.attach("ST-11 laptop workflow evidence", {
      path: laptopScreenshotPath,
      contentType: "image/png",
    });

    await page.getByRole("link", { name: fullName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/patients/${patientId}$`));
    await expect(page.getByRole("heading", { name: fullName, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit record" })).toBeVisible();
    expect(pageErrors, "Core screens must not raise uncaught browser errors.").toEqual([]);
  } finally {
    if (context) await context.close();
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
    if (userId !== undefined) {
      await prisma.user.delete({ where: { id: userId } });
    }
  }
});
