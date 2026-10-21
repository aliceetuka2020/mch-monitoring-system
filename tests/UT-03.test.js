import { describe, expect, it } from "vitest";
import { isValidDate } from "@/lib/validation";
import { parseDate } from "@/lib/api";

describe("UT-03 date parsing and validation", () => {
  it("parses a valid ISO date", () => {
    const parsed = parseDate("2025-02-28");

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.toISOString()).toBe("2025-02-28T00:00:00.000Z");
    expect(isValidDate("2025-02-28")).toBe(true);
  });

  it("rejects an impossible ISO calendar date without throwing", () => {
    expect(() => parseDate("2025-02-30")).not.toThrow();
    expect(parseDate("2025-02-30")).toBeNull();
    expect(isValidDate("2025-02-30")).toBe(false);
  });

  it("rejects a malformed date without throwing", () => {
    expect(() => parseDate("not-a-date")).not.toThrow();
    expect(parseDate("not-a-date")).toBeNull();
    expect(isValidDate("not-a-date")).toBe(false);
  });
});
