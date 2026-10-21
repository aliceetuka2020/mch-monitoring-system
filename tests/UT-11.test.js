import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  patients: [],
  findMany: vi.fn(),
  count: vi.fn(),
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
    patient: {
      findMany: prismaMocks.findMany,
      count: prismaMocks.count,
    },
  },
}));

import { GET as patientsGet } from "@/app/api/patients/route";

function patientsRequest(query) {
  return new Request(`http://localhost/api/patients${query}`);
}

describe("UT-11 pagination calculations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.patients = [
      { id: 5, fullName: "Synthetic Patient 5" },
      { id: 4, fullName: "Synthetic Patient 4" },
      { id: 3, fullName: "Synthetic Patient 3" },
      { id: 2, fullName: "Synthetic Patient 2" },
      { id: 1, fullName: "Synthetic Patient 1" },
    ];
    prismaMocks.findMany.mockImplementation(async ({ skip, take }) =>
      prismaMocks.patients.slice(skip, skip + take),
    );
    prismaMocks.count.mockResolvedValue(prismaMocks.patients.length);
  });

  it("returns the first page with the correct total and page count", async () => {
    const response = await patientsGet(patientsRequest("?page=1&pageSize=2"));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.patients.map(({ id }) => id)).toEqual([5, 4]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(prismaMocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 2 }));
    expect(prismaMocks.count).toHaveBeenCalledOnce();
  });

  it("returns the requested middle page without overlapping the first page", async () => {
    const response = await patientsGet(patientsRequest("?page=2&pageSize=2"));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.patients.map(({ id }) => id)).toEqual([3, 2]);
    expect(result.pagination).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    expect(prismaMocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 2, take: 2 }));
  });

  it("returns an empty records page beyond the available pages without losing the total", async () => {
    const response = await patientsGet(patientsRequest("?page=4&pageSize=2"));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.patients).toEqual([]);
    expect(result.pagination).toEqual({ page: 4, pageSize: 2, total: 5, totalPages: 3 });
    expect(prismaMocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 6, take: 2 }));
    expect(prismaMocks.count).toHaveBeenCalledOnce();
  });

  it("normalizes invalid page and page-size values to safe defaults without crashing", async () => {
    const response = await patientsGet(patientsRequest("?page=-3&pageSize=0"));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.patients.map(({ id }) => id)).toEqual([5, 4, 3, 2, 1]);
    expect(result.pagination).toEqual({ page: 1, pageSize: 25, total: 5, totalPages: 1 });
    expect(prismaMocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 25 }));
    expect(prismaMocks.count).toHaveBeenCalledOnce();
  });

  it("caps an oversized page size at the supported maximum", async () => {
    const response = await patientsGet(patientsRequest("?page=1&pageSize=500"));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.patients).toHaveLength(5);
    expect(result.pagination).toEqual({ page: 1, pageSize: 100, total: 5, totalPages: 1 });
    expect(prismaMocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
  });
});
