import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const prismaMocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  createdUser: null,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requireAuth: vi.fn(async () => ({ session: { id: 1, role: "ADMIN" }, error: null })),
  };
});

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: prismaMocks.userFindUnique,
      create: prismaMocks.userCreate,
    },
  },
}));

import { POST as userPost } from "@/app/api/users/route";

function userRequest(body) {
  return new Request("http://localhost/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("UT-05 password hashing and verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.createdUser = null;
    prismaMocks.userFindUnique.mockResolvedValue(null);
    prismaMocks.userCreate.mockImplementation(async ({ data }) => {
      prismaMocks.createdUser = { id: 42, active: true, ...data };
      return prismaMocks.createdUser;
    });
  });

  it("persists a verifiable hash rather than plaintext and does not return the hash", async () => {
    const password = "SyntheticPass123";
    const response = await userPost(userRequest({
      fullName: "Synthetic Test User",
      email: "synthetic-user@example.test",
      password,
      role: "HEALTH_WORKER",
    }));

    expect(response.status).toBe(201);
    expect(prismaMocks.userCreate).toHaveBeenCalledOnce();

    const storedPassword = prismaMocks.createdUser.password;
    expect(storedPassword).not.toBe(password);
    expect(await bcrypt.compare(password, storedPassword)).toBe(true);
    expect(await bcrypt.compare("IncorrectSyntheticPass123", storedPassword)).toBe(false);

    const responseBody = await response.json();
    expect(responseBody.user).not.toHaveProperty("password");
    expect(JSON.stringify(responseBody)).not.toContain(storedPassword);
  });
});
