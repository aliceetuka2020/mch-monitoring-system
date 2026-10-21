import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

test("IT-01: valid active account establishes a session and opens its role-appropriate dashboard", async ({
  page,
  context,
}, testInfo) => {
  const email = process.env.IT01_EMAIL;
  const password = process.env.IT01_PASSWORD;
  const expectedRole = process.env.IT01_EXPECTED_ROLE;

  expect(email, "Set IT01_EMAIL to an active development/test account.").toBeTruthy();
  expect(password, "Set IT01_PASSWORD for the active development/test account.").toBeTruthy();
  expect(expectedRole, "Set IT01_EXPECTED_ROLE to the account's role identifier.").toBeTruthy();

  await page.setViewportSize({ width: 1100, height: 480 });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status(), "Login API must accept the active account.").toBe(200);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  const sessionResponse = await page.request.get("/api/auth/me");
  expect(sessionResponse.status(), "Authenticated session endpoint must respond successfully.").toBe(200);
  const session = await sessionResponse.json();
  expect(session.user.role).toBe(expectedRole);
  expect(session.user.name).toBeTruthy();

  const sessionCookie = (await context.cookies()).find((cookie) => cookie.name === "mch_session");
  expect(sessionCookie, "Successful login must establish the application session cookie.").toBeDefined();
  expect(sessionCookie?.httpOnly, "The session cookie must not be accessible to page scripts.").toBe(true);

  await expect(page.locator(".sidebar .who")).toHaveText(session.user.name);
  await expect(page.locator(".sidebar .role")).toHaveText(expectedRole!);
  await expect(page.getByText("Mothers registered", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Upcoming appointments", exact: true }),
  ).toBeVisible();

  const usersLink = page.getByRole("link", { name: "Users", exact: true });
  if (session.user.permissions.includes("users.view")) {
    await expect(usersLink).toBeVisible();
  } else {
    await expect(usersLink).toHaveCount(0);
  }

  const evidenceDirectory = path.resolve(
    process.cwd(),
    "components",
    "screenshots",
    "integration_tests",
    "IT-01",
  );
  mkdirSync(evidenceDirectory, { recursive: true });
  const screenshotPath = path.join(evidenceDirectory, "IT-01-evidence.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("IT-01 dashboard evidence", {
    path: screenshotPath,
    contentType: "image/png",
  });
});
