import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  patientFindMany: vi.fn(),
  childFindMany: vi.fn(),
  childCount: vi.fn(),
  childGroupBy: vi.fn(),
  ancRecordFindMany: vi.fn(),
  deliveryRecordFindMany: vi.fn(),
  postnatalRecordFindMany: vi.fn(),
  appointmentFindMany: vi.fn(),
  appointmentUpdateMany: vi.fn(),
  growthRecordFindMany: vi.fn(),
  immunizationFindMany: vi.fn(),
  immunizationGroupBy: vi.fn(),
  childVisitCount: vi.fn(),
  userGroupBy: vi.fn(),
  userCount: vi.fn(),
  settingFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    patient: { findMany: prismaMocks.patientFindMany },
    child: {
      findMany: prismaMocks.childFindMany,
      count: prismaMocks.childCount,
      groupBy: prismaMocks.childGroupBy,
    },
    ancRecord: { findMany: prismaMocks.ancRecordFindMany },
    deliveryRecord: { findMany: prismaMocks.deliveryRecordFindMany },
    postnatalRecord: { findMany: prismaMocks.postnatalRecordFindMany },
    appointment: {
      findMany: prismaMocks.appointmentFindMany,
      updateMany: prismaMocks.appointmentUpdateMany,
    },
    growthRecord: { findMany: prismaMocks.growthRecordFindMany },
    immunization: {
      findMany: prismaMocks.immunizationFindMany,
      groupBy: prismaMocks.immunizationGroupBy,
    },
    childVisit: { count: prismaMocks.childVisitCount },
    user: { groupBy: prismaMocks.userGroupBy, count: prismaMocks.userCount },
    setting: { findUnique: prismaMocks.settingFindUnique },
  },
}));

import { getReportData } from "@/lib/report-data";

function filterByRange(rows, where, field) {
  const range = where[field];
  if (!range) return rows;
  return rows.filter((row) => {
    const value = new Date(row[field]);
    return (!range.gte || value >= range.gte) && (!range.lte || value <= range.lte);
  });
}

describe("UT-10 report aggregation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
    vi.clearAllMocks();

    const mother = {
      id: 1,
      cardNo: "SYNTH-MOTHER-1",
      fullName: "Synthetic Mother One",
      phone: "0000000000",
      registrationDate: new Date("2025-01-02T12:00:00.000Z"),
      pregnancies: [],
      ancRecords: [{ id: 11 }],
      deliveries: [],
      postnatalRecords: [],
    };
    const unrelatedMother = {
      ...mother,
      id: 2,
      cardNo: "SYNTH-MOTHER-OUTSIDE",
      fullName: "Unrelated Synthetic Mother",
      registrationDate: new Date("2025-02-02T12:00:00.000Z"),
      ancRecords: [],
    };
    const children = [
      {
        id: 1,
        childNo: "SYNTH-CHILD-1",
        name: "Synthetic Child One",
        gender: "Female",
        dateOfBirth: new Date("2024-12-01T00:00:00.000Z"),
        registrationDate: new Date("2025-01-03T12:00:00.000Z"),
        guardianName: null,
        guardianPhone: null,
        patient: { id: mother.id, fullName: mother.fullName, cardNo: mother.cardNo },
        _count: { immunizations: 1 },
      },
      {
        id: 2,
        childNo: "SYNTH-CHILD-2",
        name: "Synthetic Child Two",
        gender: "Male",
        dateOfBirth: new Date("2024-11-01T00:00:00.000Z"),
        registrationDate: new Date("2025-01-04T12:00:00.000Z"),
        guardianName: null,
        guardianPhone: null,
        patient: { id: mother.id, fullName: mother.fullName, cardNo: mother.cardNo },
        _count: { immunizations: 0 },
      },
      {
        id: 3,
        childNo: "SYNTH-CHILD-OUTSIDE",
        name: "Unrelated Synthetic Child",
        gender: "Female",
        dateOfBirth: new Date("2024-10-01T00:00:00.000Z"),
        registrationDate: new Date("2025-02-02T12:00:00.000Z"),
        guardianName: null,
        guardianPhone: null,
        patient: { id: unrelatedMother.id, fullName: unrelatedMother.fullName, cardNo: unrelatedMother.cardNo },
        _count: { immunizations: 0 },
      },
    ];
    const ancRecords = [
      { id: 11, patientId: mother.id, visitDate: new Date("2025-01-12T12:00:00.000Z"), patient: { id: mother.id, fullName: mother.fullName, cardNo: mother.cardNo } },
      { id: 12, patientId: unrelatedMother.id, visitDate: new Date("2025-02-03T12:00:00.000Z"), patient: { id: unrelatedMother.id, fullName: unrelatedMother.fullName, cardNo: unrelatedMother.cardNo } },
    ];
    const immunizations = [
      { id: 21, childId: 1, vaccineName: "Penta", dose: "Penta 1", dateGiven: new Date("2025-01-13T12:00:00.000Z") },
      { id: 22, childId: 3, vaccineName: "BCG", dose: "Birth", dateGiven: new Date("2025-02-03T12:00:00.000Z") },
    ];
    const appointments = [
      { id: 31, patientId: mother.id, date: new Date("2025-01-20T12:00:00.000Z"), type: "Antenatal", status: "SCHEDULED", patient: { id: mother.id, fullName: mother.fullName, cardNo: mother.cardNo, phone: mother.phone }, child: null },
      { id: 32, patientId: mother.id, date: new Date("2025-01-08T12:00:00.000Z"), type: "Immunization", status: "MISSED", patient: { id: mother.id, fullName: mother.fullName, cardNo: mother.cardNo, phone: mother.phone }, child: null },
      { id: 33, patientId: unrelatedMother.id, date: new Date("2025-02-04T12:00:00.000Z"), type: "Antenatal", status: "SCHEDULED", patient: { id: unrelatedMother.id, fullName: unrelatedMother.fullName, cardNo: unrelatedMother.cardNo, phone: unrelatedMother.phone }, child: null },
    ];

    prismaMocks.patientFindMany.mockImplementation(async ({ where }) =>
      [mother, unrelatedMother].filter((row) => {
        const registrationRange = where.OR?.[0]?.registrationDate;
        return registrationRange && row.registrationDate >= registrationRange.gte && row.registrationDate <= registrationRange.lte;
      }),
    );
    prismaMocks.childFindMany.mockImplementation(async ({ where }) => {
      if (where.immunizations) return [];
      return children.filter((row) => row.registrationDate <= where.registrationDate.lte);
    });
    prismaMocks.childCount.mockImplementation(async ({ where }) => {
      if (where.immunizations) return 1;
      if (where.dateOfBirth) return 0;
      return children.filter((row) => row.registrationDate <= where.registrationDate.lte).length;
    });
    prismaMocks.childGroupBy.mockResolvedValue([
      { gender: "Female", _count: { _all: 1 } },
      { gender: "Male", _count: { _all: 1 } },
    ]);
    prismaMocks.ancRecordFindMany.mockImplementation(async ({ where }) => filterByRange(ancRecords, where, "visitDate"));
    prismaMocks.deliveryRecordFindMany.mockResolvedValue([]);
    prismaMocks.postnatalRecordFindMany.mockResolvedValue([]);
    prismaMocks.appointmentFindMany.mockImplementation(async ({ where }) =>
      filterByRange(appointments, where, "date").filter((row) => !where.status || row.status === where.status),
    );
    prismaMocks.appointmentUpdateMany.mockResolvedValue({ count: 0 });
    prismaMocks.growthRecordFindMany.mockResolvedValue([]);
    prismaMocks.immunizationFindMany.mockImplementation(async ({ where }) => filterByRange(immunizations, where, "dateGiven"));
    prismaMocks.immunizationGroupBy.mockImplementation(async ({ by, where }) => {
      if (by.includes("vaccineName")) {
        return filterByRange(immunizations, where, "dateGiven").map(({ vaccineName, dose }) => ({
          vaccineName,
          dose,
          _count: { _all: 1 },
        }));
      }
      return [];
    });
    prismaMocks.childVisitCount.mockResolvedValue(0);
    prismaMocks.userGroupBy.mockResolvedValue([]);
    prismaMocks.userCount.mockResolvedValue(0);
    prismaMocks.settingFindUnique.mockResolvedValue({ value: "14" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aggregates in-range maternal, ANC, immunization, and appointment records only", async () => {
    const report = await getReportData({ start: "2025-01-02", end: "2025-01-31" });

    expect(report.filters).toMatchObject({
      start: new Date(2025, 0, 2).toISOString().slice(0, 10),
      end: "2025-01-31",
    });
    expect(report.maternalStats).toMatchObject({ registrations: 1, ancVisits: 1 });
    expect(report.maternalStats.mothers.map(({ cardNo, ancVisits }) => ({ cardNo, ancVisits }))).toEqual([
      { cardNo: "SYNTH-MOTHER-1", ancVisits: 1 },
    ]);
    expect(report.children.map(({ childNo }) => childNo)).toEqual(["SYNTH-CHILD-1", "SYNTH-CHILD-2"]);
    expect(report.childStats).toMatchObject({ total: 2, zeroDose: 1 });
    expect(report.immunizations.map(({ vaccineName, dose }) => ({ vaccineName, dose }))).toEqual([
      { vaccineName: "Penta", dose: "Penta 1" },
    ]);
    expect(report.vaccineGroups).toEqual([{ vaccineName: "Penta", dose: "Penta 1", count: 1 }]);
    expect(report.appointments.map(({ id }) => id)).toEqual([31, 32]);
    expect(report.appointmentGroups).toEqual({ MISSED: 1, SCHEDULED: 1 });
    expect(report.missedAppointments.map(({ id }) => id)).toEqual([32]);
    expect(report.administratorStats.recordsPerMonth).toEqual([{ month: "Jan 2025", count: 7 }]);
  });
});
