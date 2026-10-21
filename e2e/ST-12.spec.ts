import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const projectRoot = process.cwd();
const backupDirectory = path.join(projectRoot, "backups");
const evidenceDirectory = path.join(
  projectRoot,
  "components",
  "screenshots",
  "system",
  "ST-12",
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

async function captureEvidence(
  page: Page,
  testInfo: TestInfo,
  status: string,
  assertions: string[],
) {
  mkdirSync(evidenceDirectory, { recursive: true });
  const screenshotPath = path.join(evidenceDirectory, "ST-12-evidence.png");
  const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character];
    });
  await page.setContent(
    `<main><h1>ST-12 Recovery and operational resilience</h1><p>Status: ${escapeHtml(status)}</p><ul>${assertions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></main>`,
  );
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("ST-12 recovery validation evidence", {
    path: screenshotPath,
    contentType: "image/png",
  });
}

function backupFiles() {
  if (!existsSync(backupDirectory)) return new Set<string>();
  return new Set(readdirSync(backupDirectory).filter((file) => /^mch-.*\.dump$/.test(file)));
}

function runDatabaseScript(script: "backup.js" | "restore.js", backupFile: string | undefined, databaseUrl: string) {
  const args = [path.join(projectRoot, "scripts", script)];
  if (backupFile) args.push(path.join("backups", backupFile));
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status ?? "unknown"}`);
  }
}

test("ST-12: database reconnection and backup restore preserve synthetic records", async ({
  page,
}, testInfo) => {
  const databaseUrl = process.env.ST12_DATABASE_URL;
  const assertions: string[] = [];
  let status = "BLOCKED";
  let prisma: PrismaClient | undefined;
  let patientId: number | undefined;
  let userId: number | undefined;
  let backupFile: string | undefined;
  let createdBackups: string[] = [];
  let testStarted = false;

  if (!databaseUrl) {
    assertions.push(
      "Blocked: set ST12_DATABASE_URL to an empty, disposable mch_st12_ PostgreSQL database with the application schema already applied.",
    );
    await captureEvidence(page, testInfo, status, assertions);
    test.skip(true, "ST12_DATABASE_URL is not configured; no database was accessed.");
  }

  try {
    const parsedUrl = new URL(databaseUrl!);
    const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
    const databaseIdentity = (url: string) => {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${parsed.port}${decodeURIComponent(parsed.pathname)}`;
    };
    expect(parsedUrl.protocol, "ST12_DATABASE_URL must use PostgreSQL.").toMatch(/^postgres(?:ql)?:$/);
    expect(
      databaseName,
      "Restore is permitted only against a separately named mch_st12_ disposable database.",
    ).toMatch(/^mch_st12_[a-z0-9_-]+$/i);
    if (process.env.DATABASE_URL) {
      expect(
        databaseIdentity(databaseUrl!),
        "The ST-12 database must not be the app database.",
      ).not.toBe(databaseIdentity(process.env.DATABASE_URL));
    }
    if (process.env.TEST_DATABASE_URL) {
      expect(
        databaseIdentity(databaseUrl!),
        "The ST-12 database must not be the general test database.",
      ).not.toBe(databaseIdentity(process.env.TEST_DATABASE_URL));
    }

    for (const utility of ["pg_dump", "pg_restore"]) {
      const result = spawnSync(utility, ["--version"], { encoding: "utf8" });
      if (result.error || result.status !== 0) {
        assertions.push(`Blocked: ${utility} must be installed and available on PATH.`);
        status = "BLOCKED";
        await captureEvidence(page, testInfo, status, assertions);
        test.skip(true, `${utility} is required for ST-12 backup/restore validation.`);
      }
    }

    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    const initialCounts = await getRecordCounts(prisma);
    expect(
      Object.values(initialCounts).every((count) => count === 0),
      "The isolated restore target must contain no records before use.",
    ).toBe(true);
    testStarted = true;

    const uniqueId = randomUUID();
    const user = await prisma.user.create({
      data: {
        fullName: `Synthetic ST-12 User ${uniqueId}`,
        email: `st12-${uniqueId}@healthcare.test`,
        username: `st12-${uniqueId}`,
        password: "synthetic-password-hash",
        role: "community_health_extension_worker",
      },
      select: { id: true },
    });
    userId = user.id;
    const patient = await prisma.patient.create({
      data: {
        cardNo: `ST12-${uniqueId}`,
        fullName: `Synthetic ST-12 Patient ${uniqueId}`,
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
    assertions.push("Created a synthetic user, patient, pregnancy, and linked ANC visit.");

    await prisma.$disconnect();
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    const reconnectedPatient = await prisma.patient.findUnique({
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
    expect(reconnectedPatient).toMatchObject({
      cardNo: `ST12-${uniqueId}`,
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
    assertions.push("Closed and reopened the PostgreSQL client; saved linked records remained available.");

    const countsBeforeBackup = await getRecordCounts(prisma);
    const existingBackups = backupFiles();
    await prisma.$disconnect();
    prisma = undefined;
    runDatabaseScript("backup.js", undefined, databaseUrl!);
    createdBackups = [...backupFiles()].filter((file) => !existingBackups.has(file));
    expect(createdBackups, "The documented backup script must create exactly one dump.").toHaveLength(1);
    backupFile = createdBackups[0];
    expect(backupFile).toMatch(/^mch-.*\.dump$/);
    assertions.push("The documented PostgreSQL backup script created a custom-format dump.");

    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    await prisma.patient.delete({ where: { id: patient.id } });
    await prisma.user.delete({ where: { id: user.id } });
    expect(
      await getRecordCounts(prisma),
      "The disposable target must be empty before validating restore.",
    ).toEqual(initialCounts);
    await prisma.$disconnect();
    prisma = undefined;

    runDatabaseScript("restore.js", backupFile, databaseUrl!);
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.$connect();
    expect(await getRecordCounts(prisma)).toEqual(countsBeforeBackup);
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
      cardNo: `ST12-${uniqueId}`,
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
    assertions.push("Restored the backup and verified record counts and patient-pregnancy-ANC relationships.");
    status = "PASS";
  } catch (error) {
    if (testStarted) {
      status = "FAIL";
      assertions.push("Validation failed; see the Playwright result for the assertion or prerequisite.");
    } else {
      status = "BLOCKED";
      assertions.push("Blocked before test data creation; required database prerequisite was not satisfied.");
    }
    throw error;
  } finally {
    if (prisma) {
      if (patientId !== undefined) await prisma.patient.deleteMany({ where: { id: patientId } });
      if (userId !== undefined) await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
    for (const file of createdBackups) {
      unlinkSync(path.join(backupDirectory, file));
    }
    await captureEvidence(page, testInfo, status, assertions);
  }
});
