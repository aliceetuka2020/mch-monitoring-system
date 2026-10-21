import { describe, expect, it } from "vitest";
import { RBAC_ROLES, PERMISSIONS, hasPermission, isAdministratorRole, isRoleAllowed, permissionsForRole } from "@/lib/rbac";

describe("expanded RBAC registry", () => {
  it("defines twenty unique roles with the requested demo identities", () => {
    expect(RBAC_ROLES).toHaveLength(20);
    expect(new Set(RBAC_ROLES.map((role) => role.id)).size).toBe(20);
    expect(RBAC_ROLES.map((role) => role.email)).toContain("admin@healthcare.test");
    expect(RBAC_ROLES.map((role) => role.email)).toContain("auditor@healthcare.test");
  });

  it("gives administration access to user management but not ordinary clinical staff", () => {
    expect(hasPermission("system_administrator", "users.create")).toBe(true);
    expect(hasPermission("medical_doctor", "users.create")).toBe(false);
    expect(hasPermission("nurse", "system_settings.manage")).toBe(false);
    expect(hasPermission("system_auditor", "audit_logs.view")).toBe(true);
  });

  it("keeps patient and analytical roles least privileged", () => {
    expect(permissionsForRole("patient_mother")).toEqual(["appointments.view"]);
    expect(hasPermission("data_analyst", "patients.view")).toBe(false);
    expect(hasPermission("monitoring_and_evaluation_officer", "maternal_records.update")).toBe(false);
    expect(PERMISSIONS).toContain("reports.export");
  });

  it("preserves the legacy administrator permission behavior", () => {
    expect(hasPermission("ADMIN", "users.view")).toBe(true);
    expect(hasPermission("HEALTH_WORKER", "users.view")).toBe(false);
  });

  it("recognizes seeded and legacy administrator roles consistently", () => {
    expect(isAdministratorRole("system_administrator")).toBe(true);
    expect(isAdministratorRole("ADMIN")).toBe(true);
    expect(isAdministratorRole("medical_doctor")).toBe(false);
    expect(isAdministratorRole("unknown")).toBe(false);
    expect(isRoleAllowed("system_administrator", ["ADMIN"])).toBe(true);
    expect(isRoleAllowed("ADMIN", ["ADMIN"])).toBe(true);
    expect(isRoleAllowed("medical_doctor", ["ADMIN"])).toBe(false);
    expect(isRoleAllowed("medical_doctor", ["ADMIN", "HEALTH_WORKER"])).toBe(false);
  });
});
