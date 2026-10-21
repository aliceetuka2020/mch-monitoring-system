import prisma from "@/lib/prisma";
import { IMMUNIZATION_SCHEDULE, getScheduledDoseDate } from "@/lib/schedule";
import { getReminderWindowDays } from "@/lib/settings";

function parseFilterDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export async function getReportData(input = {}) {
  const now = new Date();
  const defaultStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 5, 1));
  const start = parseFilterDate(input.start) || defaultStart;
  const parsedEnd = parseFilterDate(input.end);
  const end = parsedEnd ? new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate(), 23, 59, 59, 999) : now;
  const reportType = input.type || "all";
  const serviceType = input.serviceType || "";
  const dateRange = { gte: start, lte: end };
  const appointmentWhere = { date: dateRange, ...(serviceType ? { type: serviceType } : {}) };
  const maternalWhere = { OR: [
    { registrationDate: dateRange },
    { ancRecords: { some: { visitDate: dateRange, ...(serviceType && serviceType !== "Antenatal" ? { id: -1 } : {}) } } },
    { deliveries: { some: { deliveryDate: dateRange, ...(serviceType && serviceType !== "Delivery" ? { id: -1 } : {}) } } },
    { postnatalRecords: { some: { visitDate: dateRange, ...(serviceType && serviceType !== "Postnatal" ? { id: -1 } : {}) } } },
  ] };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  await prisma.appointment.updateMany({ where: { status: "SCHEDULED", date: { lt: today } }, data: { status: "MISSED" } });
  const [mothers, children, ancRecords, deliveryRecords, postnatalRecords, appointments, missedAppointments, growthRecords, immunizations, vaccineGroups, childVisitCount, genders, usersByRole, activeUsers, inactiveUsers, backupWindow] = await Promise.all([
    prisma.patient.findMany({ where: maternalWhere, select: { id: true, cardNo: true, fullName: true, phone: true, registrationDate: true, pregnancies: { select: { id: true } }, ancRecords: { where: { visitDate: dateRange, ...(serviceType && serviceType !== "Antenatal" ? { id: -1 } : {}) }, select: { id: true } }, deliveries: { where: { deliveryDate: dateRange, ...(serviceType && serviceType !== "Delivery" ? { id: -1 } : {}) }, select: { id: true, outcome: true } }, postnatalRecords: { where: { visitDate: dateRange, ...(serviceType && serviceType !== "Postnatal" ? { id: -1 } : {}) }, select: { id: true } } } }),
    prisma.child.findMany({ where: { registrationDate: { lte: end } }, select: { id: true, childNo: true, name: true, gender: true, dateOfBirth: true, registrationDate: true, guardianName: true, guardianPhone: true, patient: { select: { id: true, fullName: true, cardNo: true } }, _count: { select: { immunizations: true } } } }),
    prisma.ancRecord.findMany({ where: { visitDate: dateRange, ...(serviceType && serviceType !== "Antenatal" ? { id: -1 } : {}) }, include: { patient: { select: { id: true, fullName: true, cardNo: true } } }, orderBy: { visitDate: "asc" } }),
    prisma.deliveryRecord.findMany({ where: { deliveryDate: dateRange, ...(serviceType && serviceType !== "Delivery" ? { id: -1 } : {}) }, include: { patient: { select: { fullName: true, cardNo: true } } }, orderBy: { deliveryDate: "asc" } }),
    prisma.postnatalRecord.findMany({ where: { visitDate: dateRange, ...(serviceType && serviceType !== "Postnatal" ? { id: -1 } : {}) }, include: { patient: { select: { fullName: true, cardNo: true } } }, orderBy: { visitDate: "asc" } }),
    prisma.appointment.findMany({ where: appointmentWhere, include: { patient: { select: { id: true, fullName: true, cardNo: true, phone: true } }, child: { select: { id: true, name: true, childNo: true, guardianName: true, guardianPhone: true } } }, orderBy: { date: "asc" } }),
    prisma.appointment.findMany({ where: { ...appointmentWhere, status: "MISSED" }, include: { patient: { select: { id: true, fullName: true, cardNo: true, phone: true } }, child: { select: { id: true, name: true, childNo: true, guardianName: true, guardianPhone: true } } }, orderBy: { date: "asc" } }),
    prisma.growthRecord.findMany({ where: { measurementDate: dateRange, child: { registrationDate: { lte: end } }, ...(serviceType && serviceType !== "Growth monitoring" ? { id: -1 } : {}) }, include: { child: { select: { id: true, name: true, childNo: true, dateOfBirth: true, patient: { select: { fullName: true } } } } }, orderBy: { measurementDate: "asc" } }),
    prisma.immunization.findMany({ where: { dateGiven: dateRange, child: { registrationDate: { lte: end } }, ...(serviceType && serviceType !== "Immunization" ? { id: -1 } : {}) }, select: { id: true, vaccineName: true, dose: true, dateGiven: true } }),
    prisma.immunization.groupBy({ by: ["vaccineName", "dose"], where: { dateGiven: dateRange, child: { registrationDate: { lte: end } }, ...(serviceType && serviceType !== "Immunization" ? { id: -1 } : {}) }, _count: { _all: true } }),
    prisma.childVisit.count({ where: { visitDate: dateRange, child: { registrationDate: { lte: end } } } }),
    prisma.child.groupBy({ by: ["gender"], where: { registrationDate: { lte: end } }, _count: { _all: true } }),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.user.count({ where: { active: true } }),
    prisma.user.count({ where: { active: false } }),
    getReminderWindowDays(),
  ]);
  const endDay = new Date(end);
  const windowEnd = new Date(endDay.getTime() + backupWindow * 86400000);
  const asOf = endDay;
  const eligibleByDose = serviceType && serviceType !== "Immunization" ? [] : await Promise.all(IMMUNIZATION_SCHEDULE.map(async (dose) => {
    const dueLimit = new Date(asOf.getTime() - dose.dueDaysFromBirth * 86400000);
    const [eligible, given] = await Promise.all([
      prisma.child.count({ where: { dateOfBirth: { lte: dueLimit }, registrationDate: { lte: end } } }),
      prisma.immunization.groupBy({ by: ["childId"], where: { vaccineName: dose.vaccineName, dose: dose.dose, dateGiven: dateRange, child: { registrationDate: { lte: end } } } }),
    ]);
    return { ...dose, eligible, given: given.length, coveragePercent: eligible ? Math.round(given.length / eligible * 1000) / 10 : 0 };
  }));
  const overdueDoses = [];
  if (!serviceType || serviceType === "Immunization" || serviceType === "Follow-up") {
    for (const dose of IMMUNIZATION_SCHEDULE) {
      const birthLimit = new Date(windowEnd.getTime() - dose.dueDaysFromBirth * 86400000);
      const candidates = await prisma.child.findMany({ where: { dateOfBirth: { lte: birthLimit }, registrationDate: { lte: end }, immunizations: { none: { vaccineName: dose.vaccineName, dose: dose.dose } } }, select: { id: true, name: true, childNo: true, dateOfBirth: true, guardianName: true, guardianPhone: true, patient: { select: { fullName: true } } } });
      for (const child of candidates) {
        const dueDate = getScheduledDoseDate(child.dateOfBirth, dose);
        if (dueDate && dueDate >= start && dueDate <= windowEnd) overdueDoses.push({ ...dose, child, dueDate, status: dueDate < asOf ? "Overdue" : "Due soon" });
      }
    }
  }
  overdueDoses.sort((first, second) => first.dueDate - second.dueDate);

  const followUp = new Map();
  function addFollowUp(subject) {
    const key = `${subject.type}-${subject.id}`;
    const existing = followUp.get(key);
    if (!existing) { followUp.set(key, subject); return; }
    existing.reason = [...new Set([...existing.reason.split("; "), subject.reason])].join("; ");
    existing.service = [...new Set([...existing.service.split(", "), subject.service])].join(", ");
    if (new Date(subject.date) < new Date(existing.date)) existing.date = subject.date;
  }
  for (const appointment of missedAppointments) {
    const subject = appointment.child ? { type: "Child", id: appointment.child.id, name: appointment.child.name, guardianName: appointment.child.guardianName || appointment.patient.fullName, guardianPhone: appointment.child.guardianPhone || appointment.patient.phone } : { type: "Mother", id: appointment.patient.id, name: appointment.patient.fullName, guardianName: appointment.patient.fullName, guardianPhone: appointment.patient.phone };
    addFollowUp({ ...subject, reason: "Missed appointment", mother: appointment.patient.fullName, date: appointment.date, service: appointment.type });
  }
  for (const item of overdueDoses) addFollowUp({ type: "Child", id: item.child.id, name: item.child.name, guardianName: item.child.guardianName || item.child.patient.fullName, guardianPhone: item.child.guardianPhone, mother: item.child.patient.fullName, date: item.dueDate, reason: `${item.status} ${item.vaccineName} ${item.dose}`, service: "Immunization" });

  const childPopulationWhere = { registrationDate: { lte: end } };
  const zeroDoseCount = await prisma.child.count({ where: { ...childPopulationWhere, immunizations: { none: {} } } });
  const todayAtEnd = endDay;
  const childAgeGroups = await Promise.all([
    ["Under 28 days", 28], ["28 days to under 1 year", 365], ["1 to under 5 years", 1826], ["5 years and older", null],
  ].map(async ([label, maximumDays], index, groups) => {
    const cutoff = maximumDays === null ? new Date(todayAtEnd.getTime() - 1826 * 86400000) : new Date(todayAtEnd.getTime() - maximumDays * 86400000);
    const where = maximumDays === null ? { ...childPopulationWhere, dateOfBirth: { lt: cutoff } } : index === 0 ? { ...childPopulationWhere, dateOfBirth: { gt: cutoff } } : { ...childPopulationWhere, dateOfBirth: { lte: cutoff, gt: new Date(todayAtEnd.getTime() - groups[index - 1][1] * 86400000) } };
    return { label, count: await prisma.child.count({ where }) };
  }));

  const monthKeys = [];
  const monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const finalMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (monthCursor <= finalMonth) {
    monthKeys.push({ label: monthCursor.toLocaleDateString("en-GB", { month: "short", year: "numeric" }), year: monthCursor.getFullYear(), month: monthCursor.getMonth(), count: 0 });
    monthCursor.setMonth(monthCursor.getMonth() + 1);
  }
  const recordDates = [
    ...mothers.map((row) => row.registrationDate), ...ancRecords.map((row) => row.visitDate), ...children.filter((row) => row.registrationDate && row.registrationDate >= start && row.registrationDate <= end).map((row) => row.registrationDate),
    ...immunizations.map((row) => row.dateGiven), ...growthRecords.map((row) => row.measurementDate), ...appointments.map((row) => row.date),
    ...deliveryRecords.map((row) => row.recordedAt), ...postnatalRecords.map((row) => row.recordedAt),
  ];
  for (const value of recordDates) {
    const date = new Date(value);
    const month = monthKeys.find((row) => row.year === date.getFullYear() && row.month === date.getMonth());
    if (month) month.count += 1;
  }
  const childStats = { total: await prisma.child.count({ where: childPopulationWhere }), zeroDose: zeroDoseCount, ageGroups: childAgeGroups, gender: genders.map((row) => ({ gender: row.gender, count: row._count._all })), visits: childVisitCount };
  const maternalStats = { registrations: mothers.filter((mother) => mother.registrationDate >= start && mother.registrationDate <= end).length, ancVisits: ancRecords.length, deliveries: deliveryRecords.length, outcomes: Object.entries(deliveryRecords.reduce((outcomes, row) => ({ ...outcomes, [row.outcome]: (outcomes[row.outcome] || 0) + 1 }), {})).map(([outcome, count]) => ({ outcome, count })), postnatalVisits: postnatalRecords.length, mothers: mothers.map((mother) => ({ cardNo: mother.cardNo, fullName: mother.fullName, registrations: mother.registrationDate >= start && mother.registrationDate <= end ? 1 : 0, ancVisits: mother.ancRecords.length, deliveries: mother.deliveries.length, outcomes: mother.deliveries.map((row) => row.outcome).join(", ") || "-", postnatalVisits: mother.postnatalRecords.length })) };
  const administratorStats = { usersByRole: usersByRole.map((row) => ({ role: row.role, count: row._count._all })), active: activeUsers, inactive: inactiveUsers, recordsPerMonth: monthKeys.map(({ label, count }) => ({ month: label, count })) };
  const appointmentGroups = appointments.reduce((groups, row) => ({ ...groups, [row.status]: (groups[row.status] || 0) + 1 }), {});
  const zeroDoseChildren = children.filter((child) => child._count.immunizations === 0);
  return { filters: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), type: reportType, serviceType }, mothers, children, ancRecords, deliveryRecords, postnatalRecords, appointments, missedAppointments, growthRecords, immunizations, vaccineGroups: vaccineGroups.map((row) => ({ vaccineName: row.vaccineName, dose: row.dose, count: row._count._all })), coverage: eligibleByDose, overdueDoses, followUp: [...followUp.values()], zeroDoseChildren, childStats, maternalStats, administratorStats, appointmentGroups, reminderWindowDays: backupWindow, recordLimitNote: "Child-level overdue-dose follow-up uses one query per scheduled dose and returns individual eligible children. Aggregate vaccination coverage, age-group, gender, and zero-dose counts use database counts and grouped queries." };
}

export function reportTypeIncludes(filter, type) {
  return filter === "all" || filter === type;
}
