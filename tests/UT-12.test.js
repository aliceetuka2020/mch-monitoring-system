import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: prismaMocks.userFindUnique },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(async (password) => password === "SyntheticCorrectPass123"),
  },
}));

import { POST as loginPost } from "@/app/api/auth/login/route";
import { LOGIN_LOCKOUT_MS, resetLoginLimiter } from "@/lib/login-limiter";

const credentials = {
  email: "synthetic-user@example.test",
  password: "SyntheticWrongPass123",
};
const headers = { "x-forwarded-for": "192.0.2.30" };
const user = {
  id: 41,
  fullName: "Synthetic Login User",
  email: credentials.email,
  password: "synthetic-hash",
  role: "HEALTH_WORKER",
  active: true,
};

function loginRequest(password = credentials.password) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ email: credentials.email, password }),
  });
}

describe("UT-12 login rate-limiter logic", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));
    resetLoginLimiter();
    vi.clearAllMocks();
    prismaMocks.userFindUnique.mockResolvedValue(user);
  });

  afterEach(() => {
    resetLoginLimiter();
    vi.useRealTimers();
  });

  it("locks the account and IP after five failed password attempts", async () => {
    const responses = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      responses.push(await loginPost(loginRequest()));
    }

    expect(responses.map(({ status }) => status)).toEqual([401, 401, 401, 401, 401]);
    expect(prismaMocks.userFindUnique).toHaveBeenCalledTimes(5);

    const lockedResponse = await loginPost(loginRequest("SyntheticCorrectPass123"));
    expect(lockedResponse.status).toBe(429);
    expect(await lockedResponse.json()).toEqual({
      error: "Too many failed sign-in attempts. Try again in 15 minutes.",
    });
    expect(prismaMocks.userFindUnique).toHaveBeenCalledTimes(5);
  });

  it("rejects login until lock expiry, then accepts valid credentials at the expiry boundary", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await loginPost(loginRequest());
    }

    vi.advanceTimersByTime(LOGIN_LOCKOUT_MS - 1);
    const stillLocked = await loginPost(loginRequest("SyntheticCorrectPass123"));
    expect(stillLocked.status).toBe(429);
    expect(prismaMocks.userFindUnique).toHaveBeenCalledTimes(5);

    vi.advanceTimersByTime(1);
    const afterExpiry = await loginPost(loginRequest("SyntheticCorrectPass123"));
    expect(afterExpiry.status).toBe(200);
    expect((await afterExpiry.json()).user).toMatchObject({ id: 41, role: "HEALTH_WORKER" });
    expect(prismaMocks.userFindUnique).toHaveBeenCalledTimes(6);
  });

  it("clears prior failures after successful login", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await loginPost(loginRequest())).status).toBe(401);
    }

    const successfulLogin = await loginPost(loginRequest("SyntheticCorrectPass123"));
    expect(successfulLogin.status).toBe(200);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await loginPost(loginRequest())).status).toBe(401);
    }
    const nextValidLogin = await loginPost(loginRequest("SyntheticCorrectPass123"));

    expect(nextValidLogin.status).toBe(200);
    expect(prismaMocks.userFindUnique).toHaveBeenCalledTimes(10);
  });
});
