import { isValidDate } from "./validation";

export function calculateEstimatedDeliveryDate(lastMenstrualPeriod) {
  if (!isValidDate(lastMenstrualPeriod)) return null;
  const lmp = new Date(lastMenstrualPeriod);
  const dueDate = new Date(lmp);
  dueDate.setDate(dueDate.getDate() + 280);
  return dueDate;
}

export function calculateGestationalAge(lastMenstrualPeriod, asOfDate = new Date()) {
  const lmp = new Date(lastMenstrualPeriod);
  const asOf = new Date(asOfDate);
  if (Number.isNaN(lmp.getTime()) || Number.isNaN(asOf.getTime()) || asOf < lmp) return null;
  const elapsedDays = Math.floor((asOf.getTime() - lmp.getTime()) / 86400000);
  return `${Math.floor(elapsedDays / 7)} weeks${elapsedDays % 7 ? ` ${elapsedDays % 7} days` : ""}`;
}

export function getPregnancyAnchor(pregnancy) {
  return pregnancy?.lastMenstrualPeriod || null;
}
