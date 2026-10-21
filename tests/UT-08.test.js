import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  appointments: [],
  updateMany: vi.fn(),
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
    appointment: {
      updateMany: prismaMocks.updateMany,
      findMany: prismaMocks.findMany,
      count: prismaMocks.count,
    },
  },
}));

import { GET as appointmentGet } from "@/app/api/appointments/route";

function appointmentRequest(query) {
  return new Request(`http://localhost/api/appointments${query}`);
}

function matchesWhere(appointment, where) {
  if (where.status && appointment.status !== where.status) return false;
  if (where.date?.lt && !(appointment.date < where.date.lt)) return false;
  if (where.date?.gte && !(appointment.date >= where.date.gte)) return false;
  if (where.date?.lte && !(appointment.date <= where.date.lte)) return false;
  return true;
}

describe("UT-08 appointment date and reminder categories", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));
    vi.clearAllMocks();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBeforeYesterday = new Date(today);
    dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

    prismaMocks.appointments = [
      { id: 1, type: "Due today", status: "SCHEDULED", date: new Date(today.getTime() + 12 * 60 * 60 * 1000), patient: { id: 1, fullName: "Synthetic Patient", cardNo: "TEST-1" }, child: null },
      { id: 2, type: "Upcoming", status: "SCHEDULED", date: tomorrow, patient: { id: 1, fullName: "Synthetic Patient", cardNo: "TEST-1" }, child: null },
      { id: 3, type: "Overdue scheduled", status: "SCHEDULED", date: yesterday, patient: { id: 1, fullName: "Synthetic Patient", cardNo: "TEST-1" }, child: null },
      { id: 4, type: "Completed", status: "COMPLETED", date: dayBeforeYesterday, patient: { id: 1, fullName: "Synthetic Patient", cardNo: "TEST-1" }, child: null },
    ];

    prismaMocks.updateMany.mockImplementation(async ({ where, data }) => {
      const changed = prismaMocks.appointments.filter((appointment) => matchesWhere(appointment, where));
      changed.forEach((appointment) => Object.assign(appointment, data));
      return { count: changed.length };
    });
    prismaMocks.findMany.mockImplementation(async ({ where }) =>
      prismaMocks.appointments.filter((appointment) => matchesWhere(appointment, where)),
    );
    prismaMocks.count.mockImplementation(async ({ where }) =>
      prismaMocks.appointments.filter((appointment) => matchesWhere(appointment, where)).length,
    );
  });

  it("includes an appointment due today in upcoming and preserves scheduled status", async () => {
    const response = await appointmentGet(appointmentRequest("?upcoming=1"));

    expect(response.status).toBe(200);
    const appointments = (await response.json()).appointments;
    expect(appointments.map(({ type }) => type)).toContain("Due today");
    expect(appointments.find(({ type }) => type === "Due today").status).toBe("SCHEDULED");
  });

  it("includes a future scheduled appointment in upcoming", async () => {
    const response = await appointmentGet(appointmentRequest("?upcoming=1"));
    const appointments = (await response.json()).appointments;

    expect(appointments.map(({ type }) => type)).toContain("Upcoming");
    expect(appointments.find(({ type }) => type === "Upcoming").status).toBe("SCHEDULED");
  });

  it("marks a past scheduled appointment MISSED and returns it in the missed category", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const response = await appointmentGet(appointmentRequest("?status=MISSED"));
    expect(response.status).toBe(200);
    const appointments = (await response.json()).appointments;

    expect(prismaMocks.updateMany).toHaveBeenCalledWith({
      where: { status: "SCHEDULED", date: { lt: today } },
      data: { status: "MISSED" },
    });
    expect(appointments.map(({ type, status }) => [type, status])).toEqual([["Overdue scheduled", "MISSED"]]);
    expect(prismaMocks.appointments.find(({ type }) => type === "Overdue scheduled").status).toBe("MISSED");
  });

  it("preserves completed status for a past appointment", async () => {
    const response = await appointmentGet(appointmentRequest("?status=COMPLETED"));
    const appointments = (await response.json()).appointments;

    expect(appointments.map(({ type, status }) => [type, status])).toEqual([["Completed", "COMPLETED"]]);
    expect(prismaMocks.appointments.find(({ type }) => type === "Completed").status).toBe("COMPLETED");
  });
});
