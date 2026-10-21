import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";

loadEnvConfig(process.cwd());

test.afterAll(async () => {
  await prisma.$disconnect();
});

function sessionToken(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = process.env.AUTH_SECRET || "karu-phc-mch-development-secret";
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${signature}`;
}

test("ST-08: logout and inactivity expiry block protected pages and APIs", async ({
  page,
}, testInfo) => {
  const uniqueId = randomUUID();
  const email = `st08-${uniqueId}@healthcare.test`;
  const password = `SyntheticST08-${uniqueId.slice(0, 8)}A9`;
  let userId: number | undefined;

  try {
    const user = await prisma.user.create({
      data: {
        fullName: `Synthetic ST-08 User ${uniqueId}`,
        email,
        username: `st08-${uniqueId}`,
        password: await bcrypt.hash(password, 10),
        role: "community_health_extension_worker",
        active: true,
      },
      select: { id: true, role: true },
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
    expect((await loginResponsePromise).status(), "The synthetic account must sign in.").toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);

    expect(
      (await page.context().cookies()).some((cookie) => cookie.name === "mch_session"),
      "Successful login must establish the session cookie.",
    ).toBe(true);
    expect((await page.request.get("/api/auth/me")).status()).toBe(200);
    expect((await page.request.get("/api/patients")).status()).toBe(200);

    const activityResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/activity") &&
        response.request().method() === "POST",
    );
    await page.evaluate(() => window.dispatchEvent(new MouseEvent("mousemove")));
    expect(
      (await activityResponsePromise).status(),
      "The active session must accept a completed activity update before logout.",
    ).toBe(200);

    const logoutResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/auth/logout") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Log out" }).click();
    expect((await logoutResponsePromise).status(), "Logout must complete successfully.").toBe(200);
    await expect(page).toHaveURL(/\/login$/);
    expect(
      (await page.context().cookies()).some((cookie) => cookie.name === "mch_session"),
      "Logout must remove the session cookie.",
    ).toBe(false);
    expect((await page.request.get("/api/auth/me")).status()).toBe(401);
    expect((await page.request.get("/api/patients")).status()).toBe(401);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "system",
      "ST-08",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const logoutScreenshotPath = path.join(evidenceDirectory, "ST-08-logout-evidence.png");
    await page.screenshot({ path: logoutScreenshotPath });
    await testInfo.attach("ST-08 protected page after logout", {
      path: logoutScreenshotPath,
      contentType: "image/png",
    });

    const inactivitySetting = await prisma.setting.findUnique({
      where: { key: "inactivityMinutes" },
      select: { value: true },
    });
    const configuredMinutes = Number(inactivitySetting?.value ?? 30);
    const inactivitySeconds =
      Number.isInteger(configuredMinutes) && configuredMinutes >= 5 && configuredMinutes <= 365
        ? configuredMinutes * 60
        : 30 * 60;
    const now = Math.floor(Date.now() / 1000);
    const sessionPayload = {
      id: user.id,
      name: `Synthetic ST-08 User ${uniqueId}`,
      role: user.role,
      exp: now + 60 * 60,
    };
    const origin = new URL(page.url()).origin;

    await page.context().addCookies([
      {
        name: "mch_session",
        value: sessionToken({ ...sessionPayload, lastActivity: now }),
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect(
      (await page.request.get("/api/auth/me")).status(),
      "A freshly signed session must be accepted before testing inactivity expiry.",
    ).toBe(200);
    expect((await page.request.get("/api/patients")).status()).toBe(200);

    await page.context().addCookies([
      {
        name: "mch_session",
        value: sessionToken({
          ...sessionPayload,
          lastActivity: now - inactivitySeconds - 1,
        }),
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect(
      (await page.request.get("/api/auth/me")).status(),
      "An idle session older than the configured timeout must be rejected.",
    ).toBe(401);
    expect(
      (await page.request.get("/api/patients")).status(),
      "Protected patient data must reject an expired session.",
    ).toBe(401);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    const expiryScreenshotPath = path.join(evidenceDirectory, "ST-08-expiry-evidence.png");
    await page.screenshot({ path: expiryScreenshotPath });
    await testInfo.attach("ST-08 protected page after inactivity expiry", {
      path: expiryScreenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (userId !== undefined) {
      await prisma.user.delete({ where: { id: userId } });
    }
  }
});
