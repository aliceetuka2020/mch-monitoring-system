import prisma from "@/lib/prisma";
import { IMMUNIZATION_SCHEDULE, getScheduledDoseDate } from "@/lib/schedule";

export async function getOverdueDoseDetails(asOfDate = new Date(), perDoseLimit = 6) {
  const candidates = await Promise.all(IMMUNIZATION_SCHEDULE.map(async (dose) => {
    const birthLimit = new Date(asOfDate.getTime() - dose.dueDaysFromBirth * 86400000);
    const children = await prisma.child.findMany({ where: { dateOfBirth: { lte: birthLimit }, immunizations: { none: { vaccineName: dose.vaccineName, dose: dose.dose } } }, orderBy: { dateOfBirth: "asc" }, take: perDoseLimit, include: { patient: { select: { fullName: true } } } });
    return children.map((child) => ({ ...dose, child, dueDate: getScheduledDoseDate(child.dateOfBirth, dose) }));
  }));
  return candidates.flat().filter((item) => item.dueDate && item.dueDate < asOfDate).sort((first, second) => first.dueDate - second.dueDate).slice(0, perDoseLimit);
}
