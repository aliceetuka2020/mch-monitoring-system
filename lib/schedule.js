export const IMMUNIZATION_SCHEDULE = [
  { vaccineName: "BCG", dose: "Birth", dueDaysFromBirth: 0 },
  { vaccineName: "OPV", dose: "OPV0", dueDaysFromBirth: 0 },
  { vaccineName: "Hepatitis B", dose: "Birth", dueDaysFromBirth: 0 },
  { vaccineName: "Penta", dose: "Penta 1", dueDaysFromBirth: 42 },
  { vaccineName: "OPV", dose: "OPV1", dueDaysFromBirth: 42 },
  { vaccineName: "Pneumococcal (PCV)", dose: "PCV1", dueDaysFromBirth: 42 },
  { vaccineName: "Penta", dose: "Penta 2", dueDaysFromBirth: 70 },
  { vaccineName: "OPV", dose: "OPV2", dueDaysFromBirth: 70 },
  { vaccineName: "Pneumococcal (PCV)", dose: "PCV2", dueDaysFromBirth: 70 },
  { vaccineName: "Penta", dose: "Penta 3", dueDaysFromBirth: 98 },
  { vaccineName: "OPV", dose: "OPV3", dueDaysFromBirth: 98 },
  { vaccineName: "Pneumococcal (PCV)", dose: "PCV3", dueDaysFromBirth: 98 },
  { vaccineName: "IPV", dose: "IPV1", dueDaysFromBirth: 98 },
  { vaccineName: "Measles-Rubella", dose: "MR1", dueDaysFromBirth: 274 },
  { vaccineName: "Vitamin A", dose: "1st dose", dueDaysFromBirth: 274 },
];

export function findScheduledDose(vaccineName, dose) {
  return IMMUNIZATION_SCHEDULE.find((item) => item.vaccineName === vaccineName && item.dose === dose) || null;
}

export function getScheduledDoseDate(dateOfBirth, scheduledDose) {
  if (!scheduledDose) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  birth.setDate(birth.getDate() + scheduledDose.dueDaysFromBirth);
  return birth;
}

export function getNextScheduledDueDate(dateOfBirth, vaccineName, dose) {
  const current = findScheduledDose(vaccineName, dose);
  if (!current) return null;
  const next = IMMUNIZATION_SCHEDULE.find((item) => item.dueDaysFromBirth > current.dueDaysFromBirth);
  return getScheduledDoseDate(dateOfBirth, next);
}
