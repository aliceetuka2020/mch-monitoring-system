export const RBAC_ROLES = [
  { id: "system_administrator", name: "System Administrator", email: "admin@healthcare.test", username: "admin", password: "AdminDemo#2026", dashboard: "Administrative dashboard" },
  { id: "medical_doctor", name: "Medical Doctor", email: "doctor@healthcare.test", username: "doctor", password: "DoctorDemo#2026", dashboard: "Clinical dashboard" },
  { id: "nurse", name: "Nurse", email: "nurse@healthcare.test", username: "nurse", password: "NurseDemo#2026", dashboard: "Nursing dashboard" },
  { id: "midwife", name: "Midwife", email: "midwife@healthcare.test", username: "midwife", password: "MidwifeDemo#2026", dashboard: "Midwifery dashboard" },
  { id: "community_health_extension_worker", name: "Community Health Extension Worker", email: "chew@healthcare.test", username: "chew", password: "ChewDemo#2026", dashboard: "Community healthcare dashboard" },
  { id: "maternal_health_officer", name: "Maternal Health Officer", email: "maternal@healthcare.test", username: "maternal", password: "MaternalDemo#2026", dashboard: "Maternal health dashboard" },
  { id: "child_health_officer", name: "Child Health Officer", email: "childhealth@healthcare.test", username: "childhealth", password: "ChildHealthDemo#2026", dashboard: "Child health dashboard" },
  { id: "immunization_officer", name: "Immunization Officer", email: "immunization@healthcare.test", username: "immunization", password: "ImmunizeDemo#2026", dashboard: "Immunization dashboard" },
  { id: "antenatal_care_officer", name: "Antenatal Care Officer", email: "anc@healthcare.test", username: "anc", password: "AncDemo#2026", dashboard: "ANC dashboard" },
  { id: "postnatal_care_officer", name: "Postnatal Care Officer", email: "pnc@healthcare.test", username: "pnc", password: "PncDemo#2026", dashboard: "PNC dashboard" },
  { id: "laboratory_technician", name: "Laboratory Technician", email: "lab@healthcare.test", username: "lab", password: "LabDemo#2026", dashboard: "Laboratory dashboard" },
  { id: "pharmacy_officer", name: "Pharmacy Officer", email: "pharmacy@healthcare.test", username: "pharmacy", password: "PharmacyDemo#2026", dashboard: "Pharmacy dashboard" },
  { id: "medical_records_officer", name: "Medical Records Officer", email: "records@healthcare.test", username: "records", password: "RecordsDemo#2026", dashboard: "Medical records dashboard" },
  { id: "patient_registration_officer", name: "Patient Registration Officer", email: "registration@healthcare.test", username: "registration", password: "RegisterDemo#2026", dashboard: "Patient registration dashboard" },
  { id: "health_facility_manager", name: "Health Facility Manager", email: "facilitymanager@healthcare.test", username: "facilitymanager", password: "FacilityDemo#2026", dashboard: "Facility management dashboard" },
  { id: "public_health_officer", name: "Public Health Officer", email: "publichealth@healthcare.test", username: "publichealth", password: "PublicHealthDemo#2026", dashboard: "Public health dashboard" },
  { id: "data_analyst", name: "Data Analyst", email: "analyst@healthcare.test", username: "analyst", password: "AnalystDemo#2026", dashboard: "Analytics dashboard" },
  { id: "monitoring_and_evaluation_officer", name: "Monitoring and Evaluation Officer", email: "me@healthcare.test", username: "me", password: "MonitoringDemo#2026", dashboard: "M&E dashboard" },
  { id: "patient_mother", name: "Patient / Mother", email: "mother@healthcare.test", username: "mother", password: "MotherDemo#2026", dashboard: "Patient portal" },
  { id: "system_auditor", name: "System Auditor", email: "auditor@healthcare.test", username: "auditor", password: "AuditorDemo#2026", dashboard: "Audit dashboard" },
];

export const PERMISSIONS = [
  "users.view", "users.create", "users.update", "users.deactivate", "roles.view", "roles.assign", "permissions.manage",
  "patients.view", "patients.register", "patients.update_demographics", "maternal_records.view", "maternal_records.create", "maternal_records.update",
  "child_records.view", "child_records.create", "child_records.update", "antenatal_records.view", "antenatal_records.manage", "postnatal_records.view", "postnatal_records.manage",
  "immunization.view", "immunization.record", "appointments.view", "appointments.manage", "reports.view", "reports.export", "analytics.view", "audit_logs.view", "system_settings.manage",
];

const clinical = ["patients.view", "maternal_records.view", "child_records.view", "antenatal_records.view", "postnatal_records.view", "immunization.view", "appointments.view"];
const rolePermissions = {
  system_administrator: [...PERMISSIONS], medical_doctor: [...clinical, "maternal_records.create", "maternal_records.update", "child_records.update", "reports.view"],
  nurse: [...clinical, "maternal_records.create", "child_records.update", "appointments.manage"], midwife: [...clinical, "maternal_records.create", "maternal_records.update", "antenatal_records.manage", "postnatal_records.manage"],
  community_health_extension_worker: ["patients.view", "patients.register", "patients.update_demographics", "maternal_records.view", "child_records.view", "appointments.view", "appointments.manage"],
  maternal_health_officer: ["patients.view", "maternal_records.view", "maternal_records.create", "appointments.view", "reports.view"], child_health_officer: ["patients.view", "child_records.view", "child_records.update", "immunization.view", "appointments.view", "reports.view"],
  immunization_officer: ["patients.view", "child_records.view", "immunization.view", "immunization.record", "appointments.view", "reports.view"], antenatal_care_officer: ["patients.view", "maternal_records.view", "antenatal_records.view", "antenatal_records.manage", "appointments.view", "appointments.manage"],
  postnatal_care_officer: ["patients.view", "maternal_records.view", "child_records.view", "postnatal_records.view", "postnatal_records.manage", "appointments.view"], laboratory_technician: ["patients.view", "reports.view"], pharmacy_officer: ["patients.view", "reports.view"],
  medical_records_officer: ["patients.view", "patients.update_demographics", "reports.view"], patient_registration_officer: ["patients.view", "patients.register", "patients.update_demographics", "appointments.view"], health_facility_manager: ["users.view", "patients.view", "appointments.view", "reports.view", "analytics.view"],
  public_health_officer: ["reports.view", "reports.export", "analytics.view"], data_analyst: ["reports.view", "reports.export", "analytics.view"], monitoring_and_evaluation_officer: ["reports.view", "reports.export", "analytics.view"], patient_mother: ["appointments.view"], system_auditor: ["audit_logs.view", "reports.view"],
};

export function permissionsForRole(role) { return rolePermissions[role] || (role === "ADMIN" ? rolePermissions.system_administrator : role === "HEALTH_WORKER" ? clinical : []); }
export function hasPermission(role, permission) { return permissionsForRole(role).includes(permission); }
export function isAdministratorRole(role) { return role === "ADMIN" || role === "system_administrator"; }
export function isRoleAllowed(role, allowedRoles) { return allowedRoles.includes(role) || (allowedRoles.includes("ADMIN") && isAdministratorRole(role)); }
export function legacyRoleFor(role) { return role === "system_administrator" ? "ADMIN" : role === "patient_mother" ? "PATIENT" : "HEALTH_WORKER"; }
