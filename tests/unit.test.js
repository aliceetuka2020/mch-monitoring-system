import { describe, expect, it } from "vitest";
import { validatePayload, validatePassword, validateBloodPressure } from "@/lib/validation";
import { IMMUNIZATION_SCHEDULE } from "@/lib/schedule";
import { calculateAgeInMonths, formatAgeMonths, getChildVaccinationSummary, getWeightForAgeStatus } from "@/lib/health";
import { parseDate, num, startOfDay, endOfDay } from "@/lib/api";
import { createSessionToken, verifySessionToken } from "@/lib/auth";

describe("shared validation", () => {
  it("requires fields and accepts a valid patient payload", () => {
    expect(validatePayload({ fullName: "Alice", phone: "+234 8031234567" }, { required: ["fullName", "phone"] })).toBeNull();
    expect(validatePayload({ fullName: " " }, { required: ["fullName"] })).toContain("required");
  });
  it("rejects invalid dates, phone numbers, email addresses, and measurement ranges", () => {
    expect(validatePayload({ visitDate: "not-a-date" })).toContain("valid date");
    expect(validatePayload({ phone: "abc" })).toContain("phone number");
    expect(validatePayload({ email: "bad" })).toContain("email address");
    expect(validatePayload({ weight: 999 })).toContain("between");
    expect(validatePayload({ height: 5 })).toContain("between");
  });
  it("validates blood-pressure syntax and plausible numeric limits", () => {
    expect(validateBloodPressure("110/70")).toBeNull();
    expect(validateBloodPressure("110-70")).toContain("format");
    expect(validateBloodPressure("999/999")).toContain("range");
  });
  it("enforces the eight-character letter-and-number password policy", () => {
    expect(validatePassword("Short1")).toContain("8 characters");
    expect(validatePassword("onlyletters")).toContain("number");
    expect(validatePassword("12345678")).toContain("letter");
    expect(validatePassword("Worker123!")).toBeNull();
  });
});

describe("immunization schedule and helper", () => {
  it("keeps the expected scheduled vaccine-dose set", () => {
    expect(IMMUNIZATION_SCHEDULE.length).toBeGreaterThan(10);
    expect(IMMUNIZATION_SCHEDULE.some((dose) => dose.vaccineName === "BCG" && dose.dose === "Birth")).toBe(true);
  });
  it("derives Given, Due, Overdue, and zero-dose from one helper", () => {
    const child = { dateOfBirth: "2025-01-01T00:00:00.000Z", immunizations: [{ vaccineName: "BCG", dose: "Birth" }] };
    const summary = getChildVaccinationSummary(child, new Date("2025-03-01T00:00:00.000Z"));
    expect(summary.zeroDose).toBe(false);
    expect(summary.statuses.find((dose) => dose.vaccineName === "BCG" && dose.dose === "Birth").status).toBe("Given");
    expect(summary.statuses.some((dose) => dose.status === "Overdue")).toBe(true);
  });
  it("marks a child with no recorded doses as zero-dose", () => {
    expect(getChildVaccinationSummary({ dateOfBirth: "2026-01-01", immunizations: [] }, new Date("2026-01-01")).zeroDose).toBe(true);
  });
});

describe("age and simplified growth helper", () => {
  it("calculates completed months and formats older ages in years and months", () => {
    expect(calculateAgeInMonths("2024-01-15", "2024-03-14")).toBe(1);
    expect(calculateAgeInMonths("2024-01-15", "2024-03-15")).toBe(2);
    expect(formatAgeMonths(24)).toBe("24 months");
    expect(formatAgeMonths(25)).toBe("2 years 1 month");
    expect(calculateAgeInMonths("2025-01-01", "2024-12-31")).toBeNull();
  });
  it("classifies weight using the explicitly simplified lookup table", () => {
    expect(getWeightForAgeStatus(3, 3.5)).toBe("severely underweight");
    expect(getWeightForAgeStatus(3, 4.5)).toBe("underweight");
    expect(getWeightForAgeStatus(3, 6)).toBe("normal");
  });
});

describe("date and number API helpers", () => {
  it("parses valid dates and handles invalid or empty values safely", () => {
    expect(parseDate("2025-01-01")).toBeInstanceOf(Date);
    expect(parseDate("invalid")).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(num("2.5")).toBe(2.5);
    expect(num("NaN")).toBeNull();
  });
  it("calculates the local start and end boundaries for a date", () => {
    expect(startOfDay("2025-01-02T13:00:00").getHours()).toBe(0);
    expect(endOfDay("2025-01-02T13:00:00").getHours()).toBe(23);
    expect(startOfDay("bad")).toBeNull();
  });
});

describe("session tokens", () => {
  it("creates and verifies tokens, rejecting expiry and tampering", () => {
    const token = createSessionToken({ id: 9, role: "ADMIN", exp: 2000, lastActivity: 1500 });
    expect(verifySessionToken(token, 1600)?.id).toBe(9);
    expect(verifySessionToken(token, 2000)).toBeNull();
    const changed = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(verifySessionToken(changed, 1600)).toBeNull();
    expect(verifySessionToken("invalid")).toBeNull();
  });
});
