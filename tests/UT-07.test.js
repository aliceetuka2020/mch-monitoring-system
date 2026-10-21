import { describe, expect, it } from "vitest";
import { calculateEstimatedDeliveryDate } from "@/lib/pregnancy";

describe("UT-07 estimated delivery date calculation", () => {
  it("calculates the estimated delivery date 280 days after the last menstrual period", () => {
    const estimatedDeliveryDate = calculateEstimatedDeliveryDate("2025-01-01");

    expect(estimatedDeliveryDate).toBeInstanceOf(Date);
    expect(estimatedDeliveryDate.toISOString().slice(0, 10)).toBe("2025-10-08");
  });

  it("returns null for an impossible last menstrual period date", () => {
    expect(() => calculateEstimatedDeliveryDate("2025-02-30")).not.toThrow();
    expect(calculateEstimatedDeliveryDate("2025-02-30")).toBeNull();
  });

  it("returns null for a malformed last menstrual period date", () => {
    expect(() => calculateEstimatedDeliveryDate("not-a-date")).not.toThrow();
    expect(calculateEstimatedDeliveryDate("not-a-date")).toBeNull();
  });
});
