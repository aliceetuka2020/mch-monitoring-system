import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

function localDateAfterDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDateBoundary(date: string, endOfDay = false) {
  const [year, month, day] = date.split("-").map(Number);
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day);
}

test("ST-06: date-filtered appointment report totals match a synthetic dataset", async ({
  page,
}, testInfo) => {
  const email = process.env.ST06_EMAIL;
  const password = process.env.ST06_PASSWORD;

  expect(email, "Set ST06_EMAIL to an active synthetic account.").toBeTruthy();
  expect(password, "Set ST06_PASSWORD for the synthetic account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true },
  });
  expect(account, "The configured synthetic account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured synthetic account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  const uniqueId = randomUUID();
  const motherName = `Synthetic ST-06 Mother ${uniqueId}`;
  const reportDate = localDateAfterDays(14);
  const outOfRangeDate = localDateAfterDays(15);
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
    expect((await sessionResponse.json()).user.role).toBe("community_health_extension_worker");

    const patientResponse = await page.request.post("/api/patients", {
      data: { fullName: motherName, phone: "0000000000" },
    });
    expect(patientResponse.status(), "Synthetic mother creation must succeed.").toBe(201);
    patientId = (await patientResponse.json()).patient.id;

    const scheduledResponse = await page.request.post("/api/appointments", {
      data: {
        patientId,
        date: `${reportDate}T12:00:00`,
        time: "09:15",
        type: "Follow-up",
        notes: `Synthetic ST-06 scheduled ${uniqueId}`,
      },
    });
    expect(scheduledResponse.status(), "Synthetic scheduled appointment creation must succeed.").toBe(201);
    const scheduledAppointment = (await scheduledResponse.json()).appointment;

    const completedCreateResponse = await page.request.post("/api/appointments", {
      data: {
        patientId,
        date: `${reportDate}T15:00:00`,
        time: "13:30",
        type: "Follow-up",
        notes: `Synthetic ST-06 completed ${uniqueId}`,
      },
    });
    expect(completedCreateResponse.status(), "Synthetic completed appointment creation must succeed.").toBe(201);
    const createdCompletedAppointment = (await completedCreateResponse.json()).appointment;
    const completeResponse = await page.request.patch(
      `/api/appointments/${createdCompletedAppointment.id}`,
      { data: { status: "COMPLETED" } },
    );
    expect(completeResponse.status(), "Synthetic appointment completion must succeed.").toBe(200);
    const completedAppointment = (await completeResponse.json()).appointment;
    expect(completedAppointment.status).toBe("COMPLETED");

    const [persistedRecords, expectedStatusGroups] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          date: {
            gte: localDateBoundary(reportDate),
            lte: localDateBoundary(reportDate, true),
          },
          type: "Follow-up",
        },
        orderBy: { date: "asc" },
        select: { id: true, patientId: true, date: true, status: true, notes: true },
      }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: {
          date: {
            gte: localDateBoundary(reportDate),
            lte: localDateBoundary(reportDate, true),
          },
          type: "Follow-up",
        },
        _count: { _all: true },
      }),
    ]);
    expect(
      persistedRecords.filter((record) => record.patientId === patientId),
      "The report dataset must include exactly the two synthetic appointments.",
    ).toHaveLength(2);
    expect(persistedRecords.map((record) => record.id)).toContain(scheduledAppointment.id);
    expect(persistedRecords.map((record) => record.id)).toContain(completedAppointment.id);

    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    const reportFilters = page.locator("form.report-filter");
    await reportFilters.getByLabel("Start date").fill(reportDate);
    await reportFilters.getByLabel("End date").fill(reportDate);
    await reportFilters.getByLabel("Report type").selectOption("appointments");
    await reportFilters.getByLabel("Service type").selectOption("Follow-up");
    await reportFilters.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(new RegExp(`start=${reportDate}.*end=${reportDate}`));
    await expect(page).toHaveURL(/type=appointments/);
    await expect(page).toHaveURL(/serviceType=Follow-up/);

    const appointmentSection = page.locator("section.report-section").filter({
      has: page.getByRole("heading", { name: "Appointments", exact: true }),
    });
    const appointmentRows = appointmentSection.getByRole("row");
    await expect(appointmentRows).toHaveCount(persistedRecords.length + 1);
    const scheduledRow = appointmentSection
      .getByRole("row")
      .filter({ hasText: `Synthetic ST-06 scheduled ${uniqueId}` });
    const completedRow = appointmentSection
      .getByRole("row")
      .filter({ hasText: `Synthetic ST-06 completed ${uniqueId}` });
    await expect(scheduledRow).toHaveCount(1);
    await expect(scheduledRow).toContainText(motherName);
    await expect(scheduledRow).toContainText("Follow-up");
    await expect(scheduledRow).toContainText("SCHEDULED");
    await expect(completedRow).toHaveCount(1);
    await expect(completedRow).toContainText(motherName);
    await expect(completedRow).toContainText("Follow-up");
    await expect(completedRow).toContainText("COMPLETED");

    const statusSection = page.locator("section.report-section").filter({
      has: page.getByRole("heading", { name: "Appointments by status", exact: true }),
    });
    const expectedGroups = Object.fromEntries(
      expectedStatusGroups.map((group) => [group.status, group._count._all]),
    );
    for (const [status, count] of Object.entries(expectedGroups)) {
      await expect(
        statusSection.getByRole("row").filter({ hasText: status }),
        `Status ${status} must appear in the report`,
      ).toContainText(String(count));
    }
    const reportedCounts = await statusSection
      .getByRole("row")
      .evaluateAll((rows) =>
        rows.slice(1).map((row) => {
          const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() || "");
          return [cells[0], Number(cells[1])] as const;
        }),
      );
    expect(Object.fromEntries(reportedCounts)).toEqual(expectedGroups);
    expect(
      reportedCounts.reduce((total, [, count]) => total + count, 0),
      "Status totals must add up to the number of filtered appointment rows.",
    ).toBe(persistedRecords.length);

    await page.goto(
      `/reports?start=${outOfRangeDate}&end=${outOfRangeDate}&type=appointments&serviceType=Follow-up`,
    );
    const outOfRangeSection = page.locator("section.report-section").filter({
      has: page.getByRole("heading", { name: "Appointments", exact: true }),
    });
    await expect(
      outOfRangeSection
        .getByRole("row")
        .filter({ hasText: `Synthetic ST-06 scheduled ${uniqueId}` }),
    ).toHaveCount(0);
    await expect(
      outOfRangeSection
        .getByRole("row")
        .filter({ hasText: `Synthetic ST-06 completed ${uniqueId}` }),
    ).toHaveCount(0);
    await page.goto(
      `/reports?start=${reportDate}&end=${reportDate}&type=appointments&serviceType=Follow-up`,
    );
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "system",
      "ST-06",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "ST-06-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("ST-06 filtered appointment report evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
