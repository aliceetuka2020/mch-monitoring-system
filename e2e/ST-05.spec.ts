import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

function dateAfterDays(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("ST-05: reschedules and closes synthetic appointments without pending reminders", async ({
  page,
}, testInfo) => {
  const email = process.env.ST05_EMAIL;
  const password = process.env.ST05_PASSWORD;

  expect(email, "Set ST05_EMAIL to an active synthetic account allowed to manage appointments.").toBeTruthy();
  expect(password, "Set ST05_PASSWORD for the synthetic test account.").toBeTruthy();

  const account = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { id: true, role: true, active: true },
  });
  expect(account, "The configured synthetic account must exist in the test database.").toBeTruthy();
  expect(account?.active, "The configured synthetic account must be active.").toBe(true);
  expect(account?.role).toBe("community_health_extension_worker");

  const uniqueId = randomUUID();
  const motherName = `Synthetic ST-05 Mother ${uniqueId}`;
  const phone = "0000000000";
  const initialDate = dateAfterDays(5);
  const rescheduledDate = dateAfterDays(8);
  const cancelledDate = dateAfterDays(10);
  const completedNotes = `Synthetic ST-05 completed ${uniqueId}`;
  const cancelledNotes = `Synthetic ST-05 cancelled ${uniqueId}`;
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
    const session = await sessionResponse.json();
    expect(session.user.role).toBe("community_health_extension_worker");

    await page.goto("/patients");
    await page.getByRole("button", { name: "Register mother" }).click();
    await page.getByLabel("Full name").fill(motherName);
    await page.getByLabel("Phone").fill(phone);
    const patientResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/patients") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const patientResponse = await patientResponsePromise;
    expect(patientResponse.status(), "Synthetic mother registration must succeed.").toBe(201);
    const patient = (await patientResponse.json()).patient;
    patientId = patient.id;

    await page.goto("/appointments");
    await expect(page.getByRole("heading", { name: "Appointments", exact: true })).toBeVisible();
    const bookingPanel = page
      .locator(".panel")
      .filter({ has: page.getByRole("heading", { name: "Book appointment", exact: true }) });
    await bookingPanel.getByLabel("Mother").selectOption(String(patientId));
    await bookingPanel.getByLabel("Date", { exact: true }).fill(initialDate);
    await bookingPanel.getByLabel("Time").fill("09:30");
    await bookingPanel.getByLabel("Type").selectOption("Follow-up");
    await bookingPanel.getByLabel("Notes").fill(completedNotes);
    const firstCreatePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/appointments") &&
        response.request().method() === "POST",
    );
    await bookingPanel.getByRole("button", { name: "Book", exact: true }).click();
    const firstCreateResponse = await firstCreatePromise;
    expect(firstCreateResponse.status(), "The first appointment must be booked.").toBe(201);
    const completedAppointment = (await firstCreateResponse.json()).appointment;
    expect(completedAppointment).toMatchObject({
      patientId,
      date: `${initialDate}T00:00:00.000Z`,
      time: "09:30",
      type: "Follow-up",
      status: "SCHEDULED",
      notes: completedNotes,
    });

    const appointmentsPanel = page
      .locator(".panel")
      .filter({ has: page.getByRole("heading", { name: "Appointments", exact: true }) });
    let completedRow = appointmentsPanel.getByRole("row").filter({ hasText: completedNotes });
    await expect(completedRow).toHaveCount(1);
    await expect(completedRow).toContainText("SCHEDULED");

    await completedRow.getByRole("button", { name: "Edit", exact: true }).click();
    const editPanel = page
      .locator(".panel")
      .filter({ has: page.getByRole("heading", { name: "Update appointment", exact: true }) });
    await editPanel.getByLabel("Date", { exact: true }).fill(rescheduledDate);
    await editPanel.getByLabel("Time").fill("11:15");
    const reschedulePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/appointments/${completedAppointment.id}`) &&
        response.request().method() === "PATCH",
    );
    await editPanel.getByRole("button", { name: "Save appointment", exact: true }).click();
    const rescheduleResponse = await reschedulePromise;
    expect(rescheduleResponse.status(), "Rescheduling must update the appointment.").toBe(200);
    const rescheduledAppointment = (await rescheduleResponse.json()).appointment;
    expect(rescheduledAppointment).toMatchObject({
      id: completedAppointment.id,
      patientId,
      date: `${rescheduledDate}T00:00:00.000Z`,
      time: "11:15",
      status: "SCHEDULED",
      notes: completedNotes,
    });
    completedRow = appointmentsPanel.getByRole("row").filter({ hasText: completedNotes });
    await expect(completedRow).toContainText("SCHEDULED");

    const completionPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/appointments/${completedAppointment.id}`) &&
        response.request().method() === "PATCH",
    );
    await completedRow.getByRole("button", { name: "Complete", exact: true }).click();
    const completionResponse = await completionPromise;
    expect(completionResponse.status(), "The rescheduled appointment must be completable.").toBe(200);
    expect((await completionResponse.json()).appointment).toMatchObject({
      id: completedAppointment.id,
      date: `${rescheduledDate}T00:00:00.000Z`,
      time: "11:15",
      status: "COMPLETED",
    });
    completedRow = appointmentsPanel.getByRole("row").filter({ hasText: completedNotes });
    await expect(completedRow).toContainText("COMPLETED");

    const bookingPanelAfterReschedule = page
      .locator(".panel")
      .filter({ has: page.getByRole("heading", { name: "Book appointment", exact: true }) });
    await bookingPanelAfterReschedule.getByLabel("Mother").selectOption(String(patientId));
    await bookingPanelAfterReschedule.getByLabel("Date", { exact: true }).fill(cancelledDate);
    await bookingPanelAfterReschedule.getByLabel("Time").fill("14:00");
    await bookingPanelAfterReschedule.getByLabel("Type").selectOption("Antenatal");
    await bookingPanelAfterReschedule.getByLabel("Notes").fill(cancelledNotes);
    const secondCreatePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/appointments") &&
        response.request().method() === "POST",
    );
    await bookingPanelAfterReschedule.getByRole("button", { name: "Book", exact: true }).click();
    const secondCreateResponse = await secondCreatePromise;
    expect(secondCreateResponse.status(), "The second appointment must be booked.").toBe(201);
    const cancelledAppointment = (await secondCreateResponse.json()).appointment;
    expect(cancelledAppointment).toMatchObject({
      patientId,
      date: `${cancelledDate}T00:00:00.000Z`,
      type: "Antenatal",
      status: "SCHEDULED",
      notes: cancelledNotes,
    });

    const appointmentTable = page
      .locator(".panel")
      .filter({ has: page.getByRole("heading", { name: "Appointments", exact: true }) });
    let cancelledRow = appointmentTable.getByRole("row").filter({ hasText: cancelledNotes });
    await expect(cancelledRow).toContainText("SCHEDULED");
    const cancellationPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/appointments/${cancelledAppointment.id}`) &&
        response.request().method() === "PATCH",
    );
    await cancelledRow.getByRole("button", { name: "Cancel", exact: true }).click();
    const cancellationResponse = await cancellationPromise;
    expect(cancellationResponse.status(), "The second appointment must be cancellable.").toBe(200);
    expect((await cancellationResponse.json()).appointment).toMatchObject({
      id: cancelledAppointment.id,
      date: `${cancelledDate}T00:00:00.000Z`,
      status: "CANCELLED",
    });
    cancelledRow = appointmentTable.getByRole("row").filter({ hasText: cancelledNotes });
    await expect(cancelledRow).toContainText("CANCELLED");

    const listResponse = await page.request.get(
      `/api/appointments?q=${encodeURIComponent(motherName)}&page=1&pageSize=100`,
    );
    expect(listResponse.status()).toBe(200);
    const listedAppointments = (await listResponse.json()).appointments.filter(
      (appointment: { id: number }) =>
        [completedAppointment.id, cancelledAppointment.id].includes(appointment.id),
    );
    expect(listedAppointments).toHaveLength(2);
    expect(listedAppointments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: completedAppointment.id,
          date: `${rescheduledDate}T00:00:00.000Z`,
          time: "11:15",
          status: "COMPLETED",
          notes: completedNotes,
        }),
        expect.objectContaining({
          id: cancelledAppointment.id,
          date: `${cancelledDate}T00:00:00.000Z`,
          status: "CANCELLED",
          notes: cancelledNotes,
        }),
      ]),
    );

    const persistedAppointments = await prisma.appointment.findMany({
      where: { id: { in: [completedAppointment.id, cancelledAppointment.id] } },
      orderBy: { id: "asc" },
      select: { id: true, patientId: true, date: true, time: true, status: true, notes: true },
    });
    expect(persistedAppointments).toHaveLength(2);
    expect(persistedAppointments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: completedAppointment.id,
          patientId,
          date: new Date(`${rescheduledDate}T00:00:00.000Z`),
          time: "11:15",
          status: "COMPLETED",
          notes: completedNotes,
        }),
        expect.objectContaining({
          id: cancelledAppointment.id,
          patientId,
          date: new Date(`${cancelledDate}T00:00:00.000Z`),
          status: "CANCELLED",
          notes: cancelledNotes,
        }),
      ]),
    );

    const reminders = await prisma.notification.findMany({
      where: {
        patientId,
        type: "APPOINTMENT",
        message: { in: ["Follow-up appointment", "Antenatal appointment"] },
      },
      orderBy: { message: "asc" },
      select: { patientId: true, type: true, message: true, dueDate: true, status: true },
    });
    expect(reminders).toHaveLength(2);
    expect(
      reminders.map((reminder) => ({
        message: reminder.message,
        dueDate: reminder.dueDate.toISOString(),
        status: reminder.status,
      })),
    ).toEqual([
      {
        message: "Antenatal appointment",
        dueDate: `${cancelledDate}T00:00:00.000Z`,
        status: expect.not.stringMatching(/^PENDING$/),
      },
      {
        message: "Follow-up appointment",
        dueDate: `${rescheduledDate}T00:00:00.000Z`,
        status: expect.not.stringMatching(/^PENDING$/),
      },
    ]);

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "system",
      "ST-05",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "ST-05-evidence.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("ST-05 appointment lifecycle evidence", {
      path: screenshotPath,
      contentType: "image/png",
    });
  } finally {
    if (patientId !== undefined) {
      await prisma.patient.delete({ where: { id: patientId } });
    }
  }
});
