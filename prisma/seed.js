const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { roles: RBAC_ROLES, permissions: PERMISSIONS, permsByRole } = require("../lib/rbac-seed.cjs");

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to create demo accounts in production. Set ALLOW_DEMO_SEED=true only for an explicitly approved provisioning procedure.");
  }

  const permissionRows = new Map();
  for (const identifier of PERMISSIONS) {
    const permission = await prisma.permission.upsert({ where: { identifier }, update: {}, create: { identifier } });
    permissionRows.set(identifier, permission);
  }

  for (const [id, name, email, username, password] of RBAC_ROLES) {
    const role = await prisma.role.upsert({ where: { slug: id }, update: { name }, create: { slug: id, name } });
    for (const identifier of (permsByRole[id] || [])) {
      const permission = permissionRows.get(identifier);
      if (permission) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { fullName: name, username, role: id, active: true } });
    } else {
      await prisma.user.create({ data: { fullName: name, email, username, password: await bcrypt.hash(password, 12), role: id, active: true } });
    }
  }

  const worker = await prisma.user.findFirst({ where: { role: { in: ["HEALTH_WORKER", "medical_doctor", "nurse"] } }, orderBy: { id: "asc" } });
  if (worker && !(await prisma.patient.findUnique({ where: { cardNo: "KPHC-1001" } }))) {
    const mother = await prisma.patient.create({ data: { cardNo: "KPHC-1001", fullName: "Amina Yusuf", phone: "08031234567", address: "Karu, Nasarawa State", bloodGroup: "O+", genotype: "AA", nextOfKin: "Ibrahim Yusuf" } });
    await prisma.ancRecord.create({ data: { patientId: mother.id, visitDate: new Date(), gestationalAge: "24 weeks", weight: 68.5, bloodPressure: "110/70", symptoms: "Mild fatigue", clinicalNotes: "Foetal heart tone present, mother stable.", nextVisit: new Date(Date.now() + 28 * 86400000), recordedById: worker.id } });
    const child = await prisma.child.create({ data: { patientId: mother.id, name: "Zainab Ibrahim", dateOfBirth: new Date(Date.now() - 120 * 86400000), gender: "Female", birthWeight: 3.2, guardianName: mother.fullName, guardianPhone: mother.phone, guardianRelationship: "Mother" } });
    await prisma.immunization.create({ data: { childId: child.id, vaccineName: "BCG", dose: "Birth", dateGiven: child.dateOfBirth, administeredById: worker.id, remarks: "Given at birth." } });
    await prisma.growthRecord.create({ data: { childId: child.id, measurementDate: new Date(), ageInMonths: 4, weight: 6.1, height: 60.5, headCircumference: 40.2, observation: "Normal growth." } });
  }
  console.log(`RBAC seed complete, ${RBAC_ROLES.length} roles, ${PERMISSIONS.length} permissions, ${RBAC_ROLES.length} demo accounts.`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
