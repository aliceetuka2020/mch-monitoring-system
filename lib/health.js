import { IMMUNIZATION_SCHEDULE } from "./schedule";

export function calculateAgeInMonths(dateOfBirth, asOfDate) {
  const birth = new Date(dateOfBirth);
  const at = new Date(asOfDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(at.getTime()) || at < birth) return null;
  let months = (at.getFullYear() - birth.getFullYear()) * 12 + at.getMonth() - birth.getMonth();
  if (at.getDate() < birth.getDate()) months -= 1;
  return Math.max(0, months);
}

export function formatAgeMonths(months) {
  if (!Number.isInteger(months) || months < 0) return "Unknown";
  if (months > 24) {
    const years = Math.floor(months / 12);
    const remainder = months % 12;
    const yearLabel = years === 1 ? "year" : "years";
    const monthLabel = remainder === 1 ? "month" : "months";
    return remainder ? `${years} ${yearLabel} ${remainder} ${monthLabel}` : `${years} ${yearLabel}`;
  }
  return `${months} months`;
}

// A simplified local weight-for-age screening aid, not a WHO growth-standard calculation.
// Thresholds are coarse reference points in kilograms and require clinical interpretation.
export const WEIGHT_FOR_AGE_LOOKUP = [
  { throughMonths: 5, underweightBelowKg: 5.0, severeBelowKg: 4.0 },
  { throughMonths: 11, underweightBelowKg: 7.0, severeBelowKg: 5.6 },
  { throughMonths: 23, underweightBelowKg: 9.0, severeBelowKg: 7.2 },
  { throughMonths: 59, underweightBelowKg: 12.0, severeBelowKg: 9.6 },
  { throughMonths: 1200, underweightBelowKg: 15.0, severeBelowKg: 12.0 },
];

export function getWeightForAgeStatus(ageInMonths, weightKg) {
  const band = WEIGHT_FOR_AGE_LOOKUP.find((row) => ageInMonths <= row.throughMonths);
  if (!band || !Number.isFinite(Number(weightKg))) return "normal";
  if (Number(weightKg) < band.severeBelowKg) return "severely underweight";
  if (Number(weightKg) < band.underweightBelowKg) return "underweight";
  return "normal";
}

export function getImmunizationStatuses(child, asOfDate = new Date()) {
  const birth = new Date(child.dateOfBirth);
  const now = new Date(asOfDate);
  const ageDays = Number.isNaN(birth.getTime()) ? -1 : Math.floor((now.getTime() - birth.getTime()) / 86400000);
  return IMMUNIZATION_SCHEDULE.map((dose) => {
    const given = (child.immunizations || []).some((record) => record.vaccineName === dose.vaccineName && record.dose === dose.dose);
    const status = given ? "Given" : ageDays > dose.dueDaysFromBirth ? "Overdue" : "Due";
    return { ...dose, status, dueDate: Number.isNaN(birth.getTime()) ? null : new Date(birth.getTime() + dose.dueDaysFromBirth * 86400000) };
  });
}

export function getChildVaccinationSummary(child, asOfDate = new Date()) {
  const statuses = getImmunizationStatuses(child, asOfDate);
  return {
    statuses,
    zeroDose: (child.immunizations || []).length === 0,
    overdueCount: statuses.filter((dose) => dose.status === "Overdue").length,
    dueCount: statuses.filter((dose) => dose.status === "Due").length,
    givenCount: statuses.filter((dose) => dose.status === "Given").length,
  };
}
