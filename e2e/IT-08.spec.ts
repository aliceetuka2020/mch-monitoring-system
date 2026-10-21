import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

const { dispatchReminders } = require("../lib/reminders-core.cjs");

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("IT-08: books a child appointment and dispatches its reminder through a stub provider", async ({
  page,
}, testInfo) => {
  const email = process.env.IT08_EMAIL;
  const password = process.env.IT08_PASSWORD;

  expect(email, "Set IT08_EMAIL to an active synthetic account that can register patients.").toBeTruthy();
  expect(password, "Set IT08_PASSWORD for the synthetic test account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true },
  });
  expect(account, "The configured synthetic account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured synthetic account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  const fixedNow = new Date("2026-10-20T12:00:00");
  const appointmentDate = "2026-10-21";
  const token = randomUUID();
  const motherName = `Synthetic IT-08 Mother ${token}`;
  const motherPhone = `080${token.replaceAll("-", "").slice(0, 10)}`;
  const childName = `Synthetic IT-08 Child ${token}`;
  let patientId: number | undefined;

  await page.clock.install({ time: fixedNow });
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
    const session = await sessionResponse.json();
    expect(session.user.role).toBe("community_health_extension_worker");
    expect(session.user.permissions).toContain("patients.register");

    await page.goto("/patients");
    await page.getByRole("button", { name: "Register mother" }).click();
    await page.getByLabel("Full name").fill(motherName);
    await page.getByLabel("Phone").fill(motherPhone);
    const patientResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/patients") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const patientResponse = await patientResponsePromise;
    expect(patientResponse.status()).toBe(201);
    patientId = (await patientResponse.json()).patient.id;

    await page.goto("/children");
    await page.getByLabel("Mother").selectOption(String(patientId));
    await page.getByLabel("Child name").fill(childName);
    await page.getByLabel("Date of birth").fill("2025-01-15");
    const childResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/children") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const childResponse = await childResponsePromise;
    expect(childResponse.status()).toBe(201);
    const child = (await childResponse.json()).child;
    expect(child).toMatchObject({ patientId, name: childName });

    await page.goto("/appointments");
    await expect(page.getByRole("heading", { name: "Appointments", exact: true })).toBeVisible();
    await page.getByLabel("Mother").selectOption(String(patientId));
    await page.getByLabel("Child, optional").selectOption(String(child.id));
    await page.getByLabel("Date", { exact: true }).fill(appointmentDate);
    await page.getByLabel("Time").fill("10:30");
    await page.getByLabel("Type").selectOption({ label: "Immunization" });
    await page.getByLabel("Notes").fill("Synthetic IT-08 follow-up");

    const appointmentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/appointments") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Book", exact: true }).click();
    const appointmentResponse = await appointmentResponsePromise;
    expect(appointmentResponse.status(), "Appointment booking should succeed.").toBe(201);
    const appointment = (await appointmentResponse.json()).appointment;
    expect(appointment).toMatchObject({
      patientId,
      childId: child.id,
      type: "Immunization",
      status: "SCHEDULED",
      time: "10:30",
      notes: "Synthetic IT-08 follow-up",
      patient: { id: patientId, fullName: motherName },
      child: { id: child.id, name: childName },
    });
    expect(appointment.date.slice(0, 10)).toBe(appointmentDate);
    await expect(page.getByText("Appointment booked", { exact: true })).toBeVisible();
    const appointmentRow = page.locator("tbody tr").filter({ hasText: "Synthetic IT-08 follow-up" });
    await expect(appointmentRow).toHaveCount(1);
    await expect(appointmentRow).toContainText(motherName);
    await expect(appointmentRow).toContainText(childName);

    const notification = await prisma.notification.findFirst({
      where: { patientId, type: "APPOINTMENT", message: `Immunization appointment for ${childName}` },
      orderBy: { createdAt: "desc" },
    });
    expect(notification, "Booking should create its appointment notification.").toMatchObject({
      patientId,
      type: "APPOINTMENT",
      message: `Immunization appointment for ${childName}`,
      status: "PENDING",
    });
    expect(notification?.dueDate.toISOString().slice(0, 10)).toBe(appointmentDate);

    const notificationsResponse = await page.request.get("/api/notifications?page=1&pageSize=100");
    expect(notificationsResponse.status()).toBe(200);
    const pendingNotifications = await notificationsResponse.json();
    expect(pendingNotifications.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: notification!.id,
          patientId,
          type: "APPOINTMENT",
          message: `Immunization appointment for ${childName}`,
          status: "PENDING",
        }),
      ]),
    );

    const providerCalls: Array<{ to: string; message: string; notificationId: number }> = [];
    const dispatchResult = await dispatchReminders({
      prismaClient: {
        setting: prisma.setting,
        notification: {
          findMany: (args: Parameters<typeof prisma.notification.findMany>[0]) =>
            prisma.notification.findMany({
              ...args,
              where: { ...args.where, id: notification!.id },
            }),
          update: prisma.notification.update.bind(prisma.notification),
        },
      },
      provider: {
        channel: "it08-test",
        async send({ to, message, notification: item }: {
          to: string;
          message: string;
          notification: { id: number };
        }) {
          providerCalls.push({ to, message, notificationId: item.id });
          return { accepted: true };
        },
      },
      now: new Date("2026-10-20T00:00:00.000Z"),
      force: true,
    });
    expect(dispatchResult).toMatchObject({ sent: 1, considered: 1, failures: [], channel: "it08-test" });
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0].to).toBe(motherPhone);
    expect(providerCalls[0].notificationId).toBe(notification!.id);
    expect(providerCalls[0].message).toContain(childName);
    expect(providerCalls[0].message).toContain("21/10/2026");

    const sentNotification = await prisma.notification.findUnique({
      where: { id: notification!.id },
    });
    expect(sentNotification).toMatchObject({
      id: notification!.id,
      patientId,
      type: "APPOINTMENT",
      status: "SENT",
      channel: "it08-test",
    });
    expect(sentNotification?.sentAt).toBeInstanceOf(Date);

    await page.goto("/notifications");
    const reminderRow = page.locator("tbody tr").filter({ hasText: `Immunization appointment for ${childName}` });
    await expect(reminderRow).toHaveCount(1);
    await expect(reminderRow).toContainText(motherName);
    await expect(reminderRow).toContainText("Sent");
    await expect(reminderRow).toContainText("it08-test");

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "integration_tests",
      "IT-08",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "IT-08-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("IT-08 reminder evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
