import { describe, expect, it } from "vitest";
import { getImmunizationStatuses } from "@/lib/health";

const asOfDate = new Date("2026-10-16T12:00:00.000Z");

function getPentaOneStatus(dateOfBirth) {
  const child = { dateOfBirth, immunizations: [] };
  return getImmunizationStatuses(child, asOfDate).find(
    ({ vaccineName, dose }) => vaccineName === "Penta" && dose === "Penta 1",
  );
}

describe("UT-09 immunization due-status logic", () => {
  it("classifies a scheduled dose with a past due date as overdue", () => {
    const status = getPentaOneStatus("2026-09-03T00:00:00.000Z");

    expect(status.dueDate.toISOString().slice(0, 10)).toBe("2026-10-15");
    expect(status.status).toBe("Overdue");
  });

  it("classifies a dose scheduled for today as due", () => {
    const status = getPentaOneStatus("2026-09-04T00:00:00.000Z");

    expect(status.dueDate.toISOString().slice(0, 10)).toBe("2026-10-16");
    expect(status.status).toBe("Due");
  });

  it("keeps a future scheduled dose in the not-yet-overdue Due status", () => {
    const status = getPentaOneStatus("2026-09-05T00:00:00.000Z");

    expect(status.dueDate.toISOString().slice(0, 10)).toBe("2026-10-17");
    expect(status.status).toBe("Due");
  });
});
