import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  patientCreate: vi.fn(),
  patientUpdate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({ id: 1, role: "ADMIN" })),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    patient: {
      create: prismaMocks.patientCreate,
      update: prismaMocks.patientUpdate,
    },
  },
}));

import { POST as patientPost } from "@/app/api/patients/route";

function patientRequest(body) {
  return new Request("http://localhost/api/patients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("UT-01 required-field validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.patientCreate.mockResolvedValue({
      id: 17,
      fullName: "Synthetic Test Patient",
    });
    prismaMocks.patientUpdate.mockResolvedValue({
      id: 17,
      cardNo: "KPHC-1017",
      fullName: "Synthetic Test Patient",
    });
  });

  it.each([
    {
      description: "omitted full name",
      body: { phone: "08030000000" },
      message: "fullName is required",
    },
    {
      description: "blank full name",
      body: { fullName: "   ", phone: "08030000000" },
      message: "fullName is required",
    },
    {
      description: "omitted phone",
      body: { fullName: "Synthetic Test Patient" },
      message: "phone is required",
    },
  ])("rejects $description without creating a patient", async ({ body, message }) => {
    const response = await patientPost(patientRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: message });
    expect(prismaMocks.patientCreate).not.toHaveBeenCalled();
    expect(prismaMocks.patientUpdate).not.toHaveBeenCalled();
  });

  it("accepts valid required fields and creates a patient", async () => {
    const response = await patientPost(patientRequest({
      fullName: "Synthetic Test Patient",
      phone: "08030000000",
    }));

    expect(response.status).toBe(201);
    expect((await response.json()).patient).toMatchObject({
      id: 17,
      cardNo: "KPHC-1017",
    });
    expect(prismaMocks.patientCreate).toHaveBeenCalledOnce();
    expect(prismaMocks.patientUpdate).toHaveBeenCalledOnce();
  });
});
