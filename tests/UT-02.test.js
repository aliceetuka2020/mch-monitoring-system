import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  patientCreate: vi.fn(),
  patientUpdate: vi.fn(),
  createdPatient: null,
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

describe("UT-02 patient field-length validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.createdPatient = null;
    prismaMocks.patientCreate.mockImplementation(async ({ data }) => {
      prismaMocks.createdPatient = { id: 17, ...data };
      return prismaMocks.createdPatient;
    });
    prismaMocks.patientUpdate.mockImplementation(async ({ data }) => ({
      ...prismaMocks.createdPatient,
      ...data,
    }));
  });

  it.each([
    { field: "fullName", maximum: 200 },
    { field: "medicalHistory", maximum: 4000 },
  ])("rejects $field above its $maximum-character limit without creating a partial record", async ({ field, maximum }) => {
    const body = {
      fullName: "Synthetic Test Patient",
      phone: "08030000000",
      [field]: "x".repeat(maximum + 1),
    };

    const response = await patientPost(patientRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: `${field} must be no longer than ${maximum} characters`,
    });
    expect(prismaMocks.patientCreate).not.toHaveBeenCalled();
    expect(prismaMocks.patientUpdate).not.toHaveBeenCalled();
  });

  it.each([
    { field: "fullName", maximum: 200 },
    { field: "medicalHistory", maximum: 4000 },
  ])("accepts $field at its $maximum-character limit", async ({ field, maximum }) => {
    const value = "x".repeat(maximum);
    const body = {
      fullName: "Synthetic Test Patient",
      phone: "08030000000",
      [field]: value,
    };

    const response = await patientPost(patientRequest(body));

    expect(response.status).toBe(201);
    const { patient } = await response.json();
    expect(patient[field]).toBe(value);
    expect(prismaMocks.patientCreate).toHaveBeenCalledOnce();
    expect(prismaMocks.patientCreate.mock.calls[0][0].data[field]).toBe(value);
    expect(prismaMocks.patientUpdate).toHaveBeenCalledOnce();
  });
});
