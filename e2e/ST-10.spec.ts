import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("ST-10: concurrent authorized sessions create separate persistent patients", async ({
  browser,
}, testInfo) => {
  const uniqueId = randomUUID();
  const userOneEmail = `st10-one-${uniqueId}@healthcare.test`;
  const userTwoEmail = `st10-two-${uniqueId}@healthcare.test`;
  const password = `SyntheticST10-${uniqueId.slice(0, 8)}A9`;
  const patientOneName = `Synthetic ST-10 One ${uniqueId}`;
  const patientTwoName = `Synthetic ST-10 Two ${uniqueId}`;
  const phoneOne = "0000000001";
  const phoneTwo = "0000000002";
  const createdPatientIds: number[] = [];
  const createdUserIds: number[] = [];
  let contextOne: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let contextTwo: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    const [userOne, userTwo] = await Promise.all([
      prisma.user.create({
        data: {
          fullName: `Synthetic ST-10 User One ${uniqueId}`,
          email: userOneEmail,
          username: `st10-one-${uniqueId}`,
          password: await bcrypt.hash(password, 10),
          role: "community_health_extension_worker",
          active: true,
        },
        select: { id: true, role: true },
      }),
      prisma.user.create({
        data: {
          fullName: `Synthetic ST-10 User Two ${uniqueId}`,
          email: userTwoEmail,
          username: `st10-two-${uniqueId}`,
          password: await bcrypt.hash(password, 10),
          role: "community_health_extension_worker",
          active: true,
        },
        select: { id: true, role: true },
      }),
    ]);
    createdUserIds.push(userOne.id, userTwo.id);
    expect(userOne.role).toBe("community_health_extension_worker");
    expect(userTwo.role).toBe("community_health_extension_worker");

    contextOne = await browser.newContext();
    contextTwo = await browser.newContext();
    const pageOne = await contextOne.newPage();
    const pageTwo = await contextTwo.newPage();

    const loginResults = await Promise.all([
      (async () => {
        await pageOne.goto("/login");
        await pageOne.getByLabel("Email").fill(userOneEmail);
        await pageOne.getByLabel("Password").fill(password);
        const responsePromise = pageOne.waitForResponse(
          (response) =>
            response.url().endsWith("/api/auth/login") &&
            response.request().method() === "POST",
        );
        await pageOne.getByRole("button", { name: "Sign in" }).click();
        return responsePromise;
      })(),
      (async () => {
        await pageTwo.goto("/login");
        await pageTwo.getByLabel("Email").fill(userTwoEmail);
        await pageTwo.getByLabel("Password").fill(password);
        const responsePromise = pageTwo.waitForResponse(
          (response) =>
            response.url().endsWith("/api/auth/login") &&
            response.request().method() === "POST",
        );
        await pageTwo.getByRole("button", { name: "Sign in" }).click();
        return responsePromise;
      })(),
    ]);
    expect(loginResults.map((response) => response.status())).toEqual([200, 200]);
    await Promise.all([
      expect(pageOne).toHaveURL(/\/dashboard$/),
      expect(pageTwo).toHaveURL(/\/dashboard$/),
    ]);

    const sessionResults = await Promise.all([
      pageOne.request.get("/api/auth/me"),
      pageTwo.request.get("/api/auth/me"),
    ]);
    expect(sessionResults.map((response) => response.status())).toEqual([200, 200]);
    expect((await sessionResults[0].json()).user).toMatchObject({
      id: userOne.id,
      role: "community_health_extension_worker",
    });
    expect((await sessionResults[1].json()).user).toMatchObject({
      id: userTwo.id,
      role: "community_health_extension_worker",
    });

    const [createOne, createTwo] = await Promise.all([
      pageOne.request.post("/api/patients", {
        data: { fullName: patientOneName, phone: phoneOne },
      }),
      pageTwo.request.post("/api/patients", {
        data: { fullName: patientTwoName, phone: phoneTwo },
      }),
    ]);
    expect(createOne.status(), "Session one must create its own patient record.").toBe(201);
    expect(createTwo.status(), "Session two must create its own patient record.").toBe(201);
    const [resultOne, resultTwo] = await Promise.all([createOne.json(), createTwo.json()]);
    const patientOne = resultOne.patient;
    const patientTwo = resultTwo.patient;
    createdPatientIds.push(patientOne.id, patientTwo.id);
    expect(patientOne).toMatchObject({ fullName: patientOneName, phone: phoneOne });
    expect(patientTwo).toMatchObject({ fullName: patientTwoName, phone: phoneTwo });
    expect(patientOne.id).not.toBe(patientTwo.id);
    expect(patientOne.cardNo).not.toBe(patientTwo.cardNo);

    const [persistedOne, persistedTwo] = await Promise.all([
      prisma.patient.findUnique({
        where: { id: patientOne.id },
        select: { id: true, fullName: true, phone: true, cardNo: true },
      }),
      prisma.patient.findUnique({
        where: { id: patientTwo.id },
        select: { id: true, fullName: true, phone: true, cardNo: true },
      }),
    ]);
    expect(persistedOne).toEqual({
      id: patientOne.id,
      fullName: patientOneName,
      phone: phoneOne,
      cardNo: patientOne.cardNo,
    });
    expect(persistedTwo).toEqual({
      id: patientTwo.id,
      fullName: patientTwoName,
      phone: phoneTwo,
      cardNo: patientTwo.cardNo,
    });

    await pageOne.goto("/patients");
    await expect(pageOne.getByRole("heading", { name: "Mothers", exact: true })).toBeVisible();
    const search = pageOne.getByPlaceholder("Search by name, card number or phone");
    await search.fill(`Synthetic ST-10`);
    const listResponsePromise = pageOne.waitForResponse(
      (response) =>
        response.url().includes("/api/patients?") &&
        new URL(response.url()).searchParams.get("q") === "Synthetic ST-10",
    );
    await pageOne.getByRole("button", { name: "Search", exact: true }).click();
    const listResponse = await listResponsePromise;
    expect(listResponse.status()).toBe(200);
    const listData = await listResponse.json();
    expect(listData.patients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: patientOne.id, fullName: patientOneName, phone: phoneOne }),
        expect.objectContaining({ id: patientTwo.id, fullName: patientTwoName, phone: phoneTwo }),
      ]),
    );
    await expect(pageOne.getByRole("link", { name: patientOneName, exact: true })).toBeVisible();
    await expect(pageOne.getByRole("link", { name: patientTwoName, exact: true })).toBeVisible();

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "components",
      "screenshots",
      "system",
      "ST-10",
    );
    mkdirSync(evidenceDirectory, { recursive: true });
    const screenshotPath = path.join(evidenceDirectory, "ST-10-evidence.png");
    await pageOne.screenshot({ path: screenshotPath });
    await testInfo.attach("ST-10 concurrent records visible in patient list", {
      path: screenshotPath,
      contentType: "image/png",
    });

    await pageOne.reload();
    await expect(pageOne.getByRole("heading", { name: "Mothers", exact: true })).toBeVisible();
    await pageOne.getByPlaceholder("Search by name, card number or phone").fill("Synthetic ST-10");
    const reloadListResponsePromise = pageOne.waitForResponse(
      (response) =>
        response.url().includes("/api/patients?") &&
        new URL(response.url()).searchParams.get("q") === "Synthetic ST-10",
    );
    await pageOne.getByRole("button", { name: "Search", exact: true }).click();
    expect((await reloadListResponsePromise).status()).toBe(200);
    await expect(pageOne.getByRole("link", { name: patientOneName, exact: true })).toBeVisible();
    await expect(pageOne.getByRole("link", { name: patientTwoName, exact: true })).toBeVisible();
  } finally {
    if (contextOne) await contextOne.close();
    if (contextTwo) await contextTwo.close();
    await prisma.patient.deleteMany({
      where: {
        OR: [
          { id: { in: createdPatientIds } },
          { fullName: { in: [patientOneName, patientTwoName] } },
        ],
      },
    });
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  }
});
