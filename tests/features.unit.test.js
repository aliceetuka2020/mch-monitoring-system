import { describe, expect, it } from "vitest";
import { calculateEstimatedDeliveryDate, calculateGestationalAge, getPregnancyAnchor } from "@/lib/pregnancy";
import { findScheduledDose, getNextScheduledDueDate } from "@/lib/schedule";
import { getInactivityLimitSeconds, resolveDatabaseSession } from "@/lib/auth";

describe("pregnancy, vaccine, and session policies", () => {
  it("calculates EDD and gestational age from LMP", () => {
    expect(calculateEstimatedDeliveryDate("2025-01-01").toISOString().slice(0, 10)).toBe("2025-10-08");
    expect(calculateGestationalAge("2025-01-01", "2025-02-12")).toBe("6 weeks");
    expect(calculateGestationalAge("2025-01-01", "2024-12-31")).toBeNull();
    expect(getPregnancyAnchor({ startDate: "2025-01-01", lastMenstrualPeriod: null })).toBeNull();
  });

  it("matches scheduled doses and calculates next dose dates", () => {
    expect(findScheduledDose("Penta", "Penta 1").dueDaysFromBirth).toBe(42);
    expect(getNextScheduledDueDate("2025-01-01", "Penta", "Penta 1").toISOString().slice(0, 10)).toBe("2025-03-12");
    expect(getNextScheduledDueDate("2025-01-01", "extra", "dose")).toBeNull();
  });

  it("applies configured inactivity and the current active database user's identity", () => {
    expect(getInactivityLimitSeconds("45")).toBe(2700);
    expect(getInactivityLimitSeconds("bad")).toBe(1800);
    const session = { id: 2, role: "ADMIN", name: "Former name" };
    expect(resolveDatabaseSession(session, { id: 2, fullName: "Current name", role: "HEALTH_WORKER", active: true })).toMatchObject({ name: "Current name", role: "HEALTH_WORKER" });
    expect(resolveDatabaseSession(session, { id: 2, fullName: "Disabled", role: "ADMIN", active: false })).toBeNull();
  });
});
