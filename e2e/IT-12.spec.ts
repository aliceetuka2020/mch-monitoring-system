import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const projectRoot = process.cwd();
const backupDirectory = path.join(projectRoot, "backups");
const screenshotDirectory = path.join(
  projectRoot,
  "components",
  "screenshots",
  "integration_tests",
  "IT-12",
);
const modelNames = [
  "User",
  "Role",
  "Permission",
  "RolePermission",
  "Patient",
  "Pregnancy",
  "AncRecord",
  "Child",
  "ChildVisit",
  "Immunization",
  "GrowthRecord",
  "Appointment",
  "Notification",
  "DeliveryRecord",
  "PostnatalRecord",
  "Setting",
  "PatientPortalOtp",
  "PatientPortalSession",
] as const;

function getBackupFiles() {
  if (!existsSync(backupDirectory)) return new Set<string>();
  return new Set(
    readdirSync(backupDirectory).filter((file) => /^mch-.*\.dump$/.test(file)),
  );
}

async function getRecordCounts(prisma: PrismaClient) {
  const counts = await prisma.$transaction([
    prisma.user.count(),
    prisma.role.count(),
    prisma.permission.count(),
    prisma.rolePermission.count(),
    prisma.patient.count(),
    prisma.pregnancy.count(),
    prisma.ancRecord.count(),
    prisma.child.count(),
    prisma.childVisit.count(),
    prisma.immunization.count(),
    prisma.growthRecord.count(),
    prisma.appointment.count(),
    prisma.notification.count(),
    prisma.deliveryRecord.count(),
    prisma.postnatalRecord.count(),
    prisma.setting.count(),
    prisma.patientPortalOtp.count(),
    prisma.patientPortalSession.count(),
  ]);
  return Object.fromEntries(modelNames.map((name, index) => [name, counts[index]]));
}

function runDatabaseScript(script: "backup.js" | "restore.js", backupFile?: string) {
  const args = [path.join(projectRoot, "scripts", script)];
  if (backupFile) args.push(path.join("backups", backupFile));
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function captureEvidence(page: Page, testInfo: TestInfo, status: string) {
  mkdirSync(screenshotDirectory, { recursive: true });
  const screenshotPath = path.join(screenshotDirectory, "IT-12-evidence.png");
  await page.setContent(
    `<main><h1>IT-12 PostgreSQL backup and restore</h1><p>Status: ${status}</p><p>Assertions: synthetic record counts and patient-pregnancy-ANC relationships are compared before and after restore.</p></main>`,
  );
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("IT-12 backup and restore evidence", {
    path: screenshotPath,
    contentType: "image/png",
  });
}

test("IT-12: restores a synthetic PostgreSQL snapshot and verifies counts and relationships", async ({
  page,
}, testInfo) => {
  const databaseUrl = process.env.IT12_DATABASE_URL;
  let status = "BLOCKED";
  let testStarted = false;
  let backupFile: string | undefined;
  let createdBackups: string[] = [];
  let prisma: PrismaClient | undefined;
  let patientId: number | undefined;
  let userId: number | undefined;

  try {
    expect(
      databaseUrl,
      "Set IT12_DATABASE_URL to a separately provisioned, disposable PostgreSQL database; the test will not use DATABASE_URL or TEST_DATABASE_URL.",
    ).toBeTruthy();

    const parsedUrl = new URL(databaseUrl!);
    const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
    expect(parsedUrl.protocol, "IT12_DATABASE_URL must use PostgreSQL.").toMatch(/^postgres(?:ql)?:$/);
    expect(databaseName, "Restore is permitted only against a dedicated mch_it12_ database.").toMatch(
      /^mch_it12_[a-z0-9_-]+$/i,
    );
    expect(process.env.DATABASE_URL, "Playwright's application server must use the same isolated IT-12 database.").toBe(
      databaseUrl,
    );
    for (const utility of ["pg_dump", "pg_restore"]) {
      expect(
        spawnSync(utility, ["--version"], { encoding: "utf8" }).status,
        `${utility} must be installed and available on PATH.`,
      ).toBe(0);
    }

    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    const initialCounts = await getRecordCounts(prisma);
    expect(
      Object.values(initialCounts).every((count) => count === 0),
      "The isolated IT-12 database must contain no records because restore replaces its contents.",
    ).toBe(true);
    testStarted = true;

    const uniqueId = randomUUID();
    const user = await prisma.user.create({
      data: {
        fullName: `Synthetic IT-12 User ${uniqueId}`,
        email: `it12-${uniqueId}@healthcare.test`,
        username: `it12-${uniqueId}`,
        password: "synthetic-password-hash",
        role: "community_health_extension_worker",
      },
      select: { id: true },
    });
    userId = user.id;

    const patient = await prisma.patient.create({
      data: {
        cardNo: `IT12-${uniqueId}`,
        fullName: `Synthetic IT-12 Patient ${uniqueId}`,
        phone: "0000000000",
        pregnancies: {
          create: {
            startDate: new Date("2026-01-01T00:00:00.000Z"),
            status: "ONGOING",
            ancRecords: {
              create: {
                visitDate: new Date("2026-03-01T00:00:00.000Z"),
                gestationalAge: "12 weeks",
                weight: 60,
                recordedById: user.id,
              },
            },
          },
        },
      },
      select: {
        id: true,
        pregnancies: {
          select: {
            id: true,
            ancRecords: { select: { id: true, recordedById: true } },
          },
        },
      },
    });
    patientId = patient.id;
    expect(patient.pregnancies).toHaveLength(1);
    expect(patient.pregnancies[0].ancRecords).toHaveLength(1);
    expect(patient.pregnancies[0].ancRecords[0].recordedById).toBe(user.id);

    const snapshotCounts = await getRecordCounts(prisma);
    expect(snapshotCounts).toMatchObject({
      User: 1,
      Patient: 1,
      Pregnancy: 1,
      AncRecord: 1,
    });

    const preBackupFiles = getBackupFiles();
    process.env.DATABASE_URL = databaseUrl;
    runDatabaseScript("backup.js");
    createdBackups = [...getBackupFiles()].filter((file) => !preBackupFiles.has(file));
    expect(createdBackups, "The documented backup script must create exactly one dump.").toHaveLength(1);
    backupFile = createdBackups[0];
    expect(backupFile).toMatch(/^mch-.*\.dump$/);

    await prisma.patient.delete({ where: { id: patient.id } });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await getRecordCounts(prisma)).toMatchObject({
      User: 0,
      Patient: 0,
      Pregnancy: 0,
      AncRecord: 0,
    });

    runDatabaseScript("restore.js", backupFile);

    const restoredCounts = await getRecordCounts(prisma);
    expect(restoredCounts).toEqual(snapshotCounts);
    const restoredPatient = await prisma.patient.findUnique({
      where: { id: patient.id },
      select: {
        cardNo: true,
        pregnancies: {
          select: {
            id: true,
            ancRecords: { select: { id: true, recordedById: true } },
          },
        },
      },
    });
    expect(restoredPatient).toMatchObject({
      cardNo: `IT12-${uniqueId}`,
      pregnancies: [
        {
          id: patient.pregnancies[0].id,
          ancRecords: [
            {
              id: patient.pregnancies[0].ancRecords[0].id,
              recordedById: user.id,
            },
          ],
        },
      ],
    });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeTruthy();
    status = "PASS";
  } catch (error) {
    if (testStarted) status = "FAIL";
    throw error;
  } finally {
    if (prisma) {
      if (patientId !== undefined) await prisma.patient.deleteMany({ where: { id: patientId } });
      if (userId !== undefined) await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
    for (const file of createdBackups) {
      rmSync(path.join(backupDirectory, file), { force: true });
    }
    await captureEvidence(page, testInfo, status);
  }
});
