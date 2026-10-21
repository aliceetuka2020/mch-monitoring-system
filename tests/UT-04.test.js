import { describe, expect, it } from "vitest";
import { validatePassword } from "@/lib/validation";

describe("UT-04 password policy", () => {
  it("accepts a compliant password at the eight-character minimum", () => {
    expect(validatePassword("Test1234")).toBeNull();
  });

  it("rejects a password shorter than eight characters with a length message", () => {
    expect(validatePassword("Abc1234")).toBe("Password must be at least 8 characters long");
  });

  it("rejects a password without a number with a letter-and-number message", () => {
    expect(validatePassword("OnlyLetters")).toBe("Password must contain at least one letter and one number");
  });

  it("rejects a password without a letter with a letter-and-number message", () => {
    expect(validatePassword("12345678")).toBe("Password must contain at least one letter and one number");
  });
});
