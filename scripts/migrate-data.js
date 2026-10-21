const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient(process.env.DATABASE_URL ? { datasources: { db: { url: process.env.DATABASE_URL } } } : {});

function ageInMonths(dateOfBirth, measurementDate) {
  const birth = new Date(dateOfBirth);
  const measured = new Date(measurementDate);
  let months = (measured.getFullYear() - birth.getFullYear()) * 12 + measured.getMonth() - birth.getMonth();
  if (measured.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
}

function dateDaysBefore(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() - days);
  return date;
}

function legacyLastMenstrualPeriod(patient) {
  if (patient.estimatedDeliveryDate) return dateDaysBefore(patient.estimatedDeliveryDate, 280);
  const weeks = String(patient.gestationalAgeAtRegistration || "").match(/(\d+)\s*(?:weeks?|wks?)/i);
  if (weeks) return dateDaysBefore(patient.registrationDate, Number(weeks[1]) * 7);
  return null;
}

async function main() {
  const patients = await prisma.patient.findMany({ select: { id: true, previousPregnancies: true, pregnancyHistory: true, pregnancyInformation: true, registrationDate: true, estimatedDeliveryDate: true, gestationalAgeAtRegistration: true } });
  for (const patient of patients) {
    const changes = {};
    if (!patient.previousPregnancies && patient.pregnancyHistory) {
      changes.previousPregnancies = patient.pregnancyHistory;
      changes.pregnancyHistory = patient.pregnancyInformation || null;
    } else if (!patient.pregnancyHistory && patient.pregnancyInformation) changes.pregnancyHistory = patient.pregnancyInformation;
    if (Object.keys(changes).length) await prisma.patient.update({ where: { id: patient.id }, data: changes });
    let pregnancy = await prisma.pregnancy.findFirst({ where: { patientId: patient.id }, orderBy: { createdAt: "asc" } });
    if (!pregnancy) {
      const lmp = legacyLastMenstrualPeriod(patient);
      pregnancy = await prisma.pregnancy.create({ data: { patientId: patient.id, startDate: patient.registrationDate, lastMenstrualPeriod: lmp, estimatedDeliveryDate: patient.estimatedDeliveryDate || (lmp ? new Date(lmp.getTime() + 280 * 86400000) : null), status: "LEGACY" } });
    }
    await prisma.ancRecord.updateMany({ where: { patientId: patient.id, pregnancyId: null }, data: { pregnancyId: pregnancy.id } });
  }

  const children = await prisma.child.findMany({ include: { patient: { select: { fullName: true, phone: true } } } });
  let guardianUpdates = 0;
  let childNumbers = 0;
  for (const child of children) {
    const changes = {};
    if (!child.guardianName) changes.guardianName = child.patient.fullName;
    if (!child.guardianPhone) changes.guardianPhone = child.patient.phone;
    if (!child.guardianRelationship) changes.guardianRelationship = "Mother";
    if (!child.childNo) { changes.childNo = `KPHC-CH-${1000 + child.id}`; childNumbers += 1; }
    if (Object.keys(changes).length) { await prisma.child.update({ where: { id: child.id }, data: changes }); guardianUpdates += 1; }
  }
  const records = await prisma.growthRecord.findMany({ where: { ageInMonths: 0 }, include: { child: { select: { dateOfBirth: true } } } });
  for (const record of records) await prisma.growthRecord.update({ where: { id: record.id }, data: { ageInMonths: ageInMonths(record.child.dateOfBirth, record.measurementDate) } });
  for (const [key, value] of [["patientRemindersEnabled", "false"], ["reminderWindowDays", "14"], ["inactivityMinutes", "30"], ["facilityName", "Karu Primary Healthcare Centre"]]) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  console.log(`Data backfill complete, reviewed ${patients.length} mothers and ${children.length} children, assigned ${childNumbers} child numbers, linked existing ANC records, updated ${records.length} growth ages, and populated ${guardianUpdates} guardian or child identity records. No records were deleted.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
