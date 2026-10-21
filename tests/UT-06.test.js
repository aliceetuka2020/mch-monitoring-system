import { describe, expect, it } from "vitest";
import { hasPermission, permissionsForRole } from "@/lib/rbac";

describe("UT-06 role and permission lookup", () => {
  it("grants the configured administrator role its configured permissions", () => {
    const administratorPermissions = permissionsForRole("system_administrator");

    expect(administratorPermissions).toContain("users.create");
    expect(administratorPermissions).toContain("permissions.manage");
    expect(administratorPermissions).toContain("system_settings.manage");
    expect(hasPermission("system_administrator", "users.create")).toBe(true);
    expect(hasPermission("system_administrator", "system_settings.manage")).toBe(true);
  });

  it("keeps the configured health-worker role to its clinical permissions", () => {
    const healthWorkerPermissions = permissionsForRole("HEALTH_WORKER");

    expect(healthWorkerPermissions).toContain("patients.view");
    expect(healthWorkerPermissions).toContain("maternal_records.view");
    expect(hasPermission("HEALTH_WORKER", "users.create")).toBe(false);
    expect(hasPermission("HEALTH_WORKER", "permissions.manage")).toBe(false);
    expect(hasPermission("HEALTH_WORKER", "system_settings.manage")).toBe(false);
    expect(hasPermission("HEALTH_WORKER", "reports.export")).toBe(false);
  });

  it("gives an unknown role no permissions and no administrator access", () => {
    const unknownRole = "unrecognized_test_role";

    expect(permissionsForRole(unknownRole)).toEqual([]);
    expect(hasPermission(unknownRole, "users.create")).toBe(false);
    expect(hasPermission(unknownRole, "permissions.manage")).toBe(false);
    expect(hasPermission(unknownRole, "system_settings.manage")).toBe(false);
  });
});
