import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const state = vi.hoisted(() => ({ session: null }));
const mocks = vi.hoisted(() => ({
  patientFindMany: vi.fn(),
  patientCount: vi.fn(),
  patientFindUnique: vi.fn(),
  patientCreate: vi.fn(),
  patientUpdate: vi.fn(),
  userFindMany: vi.fn(),
  userCount: vi.fn(),
  getReportData: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: async () => state.session,
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    patient: {
      findMany: mocks.patientFindMany,
      count: mocks.patientCount,
      findUnique: mocks.patientFindUnique,
      create: mocks.patientCreate,
      update: mocks.patientUpdate,
    },
    user: {
      findMany: mocks.userFindMany,
      count: mocks.userCount,
    },
  },
}));

vi.mock("@/lib/report-data", () => ({
  getReportData: mocks.getReportData,
}));

import { GET as patientsGet, POST as patientPost } from "@/app/api/patients/route";
import { GET as patientGet, PUT as patientPut } from "@/app/api/patients/[id]/route";
import { GET as usersGet } from "@/app/api/users/route";
import { GET as reportExportGet } from "@/app/api/reports/export/route";

const resultRows = [];
const resultFile = path.join(
  process.cwd(),
  "evaluation",
  "HT-09-H09",
  "access-control-results.csv"
);

function recordResult(caseId, role, expectedStatus, response, protectedQueryCalled) {
  resultRows.push({
    case_id: caseId,
    role,
    expected_status: expectedStatus,
    actual_status: response.status,
    protected_query_called: protectedQueryCalled,
    outcome:
      response.status === expectedStatus &&
      (expectedStatus < 400 || !protectedQueryCalled)
        ? "PASS"
        : "FAIL",
  });
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

afterAll(() => {
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  const header = [
    "case_id",
    "role",
    "expected_status",
    "actual_status",
    "protected_query_called",
    "outcome",
  ];
  const lines = [
    header.map(csvCell).join(","),
    ...resultRows.map((row) => header.map((key) => csvCell(row[key])).join(",")),
  ];
  fs.writeFileSync(resultFile, `${lines.join("\r\n")}\r\n`, "utf8");
});

beforeEach(() => {
  state.session = null;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.patientFindMany.mockResolvedValue([]);
  mocks.patientCount.mockResolvedValue(0);
  mocks.patientFindUnique.mockResolvedValue({
    id: 501,
    fullName: "Synthetic Test Patient",
    phone: "SYNTHETIC-NOT-A-PHONE",
    medicalHistory: "Synthetic fixture only",
    pregnancies: [],
    ancRecords: [],
    children: [],
    appointments: [],
    deliveries: [],
    postnatalRecords: [],
  });
  mocks.patientCreate.mockResolvedValue({ id: 72, fullName: "Synthetic New Patient" });
  mocks.patientUpdate.mockImplementation(({ where, data }) => ({
    id: where.id,
    fullName: data.fullName || "Synthetic Updated Patient",
    ...data,
  }));
  mocks.userFindMany.mockResolvedValue([
    { id: 7, fullName: "Synthetic Administrator", email: "admin@example.test", role: "ADMIN", active: true },
  ]);
  mocks.userCount.mockResolvedValue(1);
  mocks.getReportData.mockResolvedValue({
    filters: { type: "administrator" },
    administratorStats: {
      usersByRole: [{ role: "ADMIN", count: 1 }],
      active: 1,
      inactive: 0,
      recordsPerMonth: [],
    },
    followUp: [],
  });
});

describe("HT-09 authentication, RBAC, and record confidentiality matrix", () => {
  it("denies unauthenticated patient-list access before reading records", async () => {
    const response = await patientsGet(new Request("http://localhost/api/patients"));
    recordResult("patient-list-unauthenticated", "UNAUTHENTICATED", 401, response, mocks.patientFindMany.mock.calls.length > 0);
    expect(response.status).toBe(401);
    expect(mocks.patientFindMany).not.toHaveBeenCalled();
    expect(mocks.patientCount).not.toHaveBeenCalled();
  });

  it("denies patient-role access to the global patient list before reading records", async () => {
    state.session = { id: 12, role: "patient_mother" };
    const response = await patientsGet(new Request("http://localhost/api/patients"));
    recordResult("patient-role-global-list", "patient_mother", 403, response, mocks.patientFindMany.mock.calls.length > 0);
    expect(response.status).toBe(403);
    expect(mocks.patientFindMany).not.toHaveBeenCalled();
    expect(mocks.patientCount).not.toHaveBeenCalled();
  });

  it("denies patient-role access to another patient's protected record", async () => {
    state.session = { id: 12, role: "patient_mother" };
    const response = await patientGet(
      new Request("http://localhost/api/patients/501"),
      { params: { id: "501" } }
    );
    recordResult("patient-role-record-detail", "patient_mother", 403, response, mocks.patientFindUnique.mock.calls.length > 0);
    expect(response.status).toBe(403);
    expect(mocks.patientFindUnique).not.toHaveBeenCalled();
  });

  it("allows a clinical health worker to list patient records", async () => {
    state.session = { id: 18, role: "HEALTH_WORKER" };
    const response = await patientsGet(new Request("http://localhost/api/patients"));
    recordResult("health-worker-patient-list", "HEALTH_WORKER", 200, response, mocks.patientFindMany.mock.calls.length > 0);
    expect(response.status).toBe(200);
    expect(mocks.patientFindMany).toHaveBeenCalledOnce();
    expect(mocks.patientCount).toHaveBeenCalledOnce();
  });

  it("allows a clinical health worker to retrieve a protected patient record", async () => {
    state.session = { id: 18, role: "HEALTH_WORKER" };
    const response = await patientGet(
      new Request("http://localhost/api/patients/501"),
      { params: { id: "501" } }
    );
    recordResult("health-worker-patient-record", "HEALTH_WORKER", 200, response, mocks.patientFindUnique.mock.calls.length > 0);
    expect(response.status).toBe(200);
    expect(mocks.patientFindUnique).toHaveBeenCalledOnce();
    const body = await response.json();
    expect(body.patient.fullName).toBe("Synthetic Test Patient");
  });

  it("denies a general clinical role patient registration before writing", async () => {
    state.session = { id: 18, role: "HEALTH_WORKER" };
    const response = await patientPost(
      new Request("http://localhost/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Synthetic New Patient", phone: "+2348000000000" }),
      })
    );
    recordResult("health-worker-patient-registration", "HEALTH_WORKER", 403, response, mocks.patientCreate.mock.calls.length > 0);
    expect(response.status).toBe(403);
    expect(mocks.patientCreate).not.toHaveBeenCalled();
  });

  it("allows a patient-registration officer to register a patient", async () => {
    state.session = { id: 24, role: "patient_registration_officer" };
    const response = await patientPost(
      new Request("http://localhost/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Synthetic New Patient", phone: "+2348000000000" }),
      })
    );
    recordResult("registration-officer-patient-registration", "patient_registration_officer", 201, response, mocks.patientCreate.mock.calls.length > 0);
    expect(response.status).toBe(201);
    expect(mocks.patientCreate).toHaveBeenCalledOnce();
    expect(mocks.patientUpdate).toHaveBeenCalledOnce();
  });

  it("denies a general clinical role demographic updates before writing", async () => {
    state.session = { id: 18, role: "HEALTH_WORKER" };
    const response = await patientPut(
      new Request("http://localhost/api/patients/501", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Unauthorized Synthetic Update" }),
      }),
      { params: { id: "501" } }
    );
    recordResult("health-worker-patient-update", "HEALTH_WORKER", 403, response, mocks.patientUpdate.mock.calls.length > 0);
    expect(response.status).toBe(403);
    expect(mocks.patientUpdate).not.toHaveBeenCalled();
  });

  it("allows a medical-records officer permitted demographic updates", async () => {
    state.session = { id: 25, role: "medical_records_officer" };
    const response = await patientPut(
      new Request("http://localhost/api/patients/501", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Synthetic Updated Patient" }),
      }),
      { params: { id: "501" } }
    );
    recordResult("records-officer-patient-update", "medical_records_officer", 200, response, mocks.patientUpdate.mock.calls.length > 0);
    expect(response.status).toBe(200);
    expect(mocks.patientUpdate).toHaveBeenCalledOnce();
  });

  it("denies a clinical health worker administrator-only user listing before querying users", async () => {
    state.session = { id: 18, role: "HEALTH_WORKER" };
    const response = await usersGet(new Request("http://localhost/api/users"));
    recordResult("health-worker-user-list", "HEALTH_WORKER", 403, response, mocks.userFindMany.mock.calls.length > 0);
    expect(response.status).toBe(403);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(mocks.userCount).not.toHaveBeenCalled();
  });

  it("denies a clinical health worker administrator-only report export before data access", async () => {
    state.session = { id: 18, role: "HEALTH_WORKER" };
    const response = await reportExportGet(
      new Request("http://localhost/api/reports/export?type=administrator")
    );
    recordResult("health-worker-report-export", "HEALTH_WORKER", 403, response, mocks.getReportData.mock.calls.length > 0);
    expect(response.status).toBe(403);
    expect(mocks.getReportData).not.toHaveBeenCalled();
  });

  it("allows an administrator user listing without returning password fields", async () => {
    state.session = { id: 1, role: "ADMIN" };
    const response = await usersGet(new Request("http://localhost/api/users"));
    recordResult("admin-user-list", "ADMIN", 200, response, mocks.userFindMany.mock.calls.length > 0);
    expect(response.status).toBe(200);
    expect(mocks.userFindMany).toHaveBeenCalledOnce();
    const userQuery = mocks.userFindMany.mock.calls[0][0];
    expect(userQuery.select).not.toHaveProperty("password");
    const body = await response.json();
    expect(body.users[0]).not.toHaveProperty("password");
  });

  it("allows an administrator report export with the expected CSV response", async () => {
    state.session = { id: 1, role: "ADMIN" };
    const response = await reportExportGet(
      new Request("http://localhost/api/reports/export?type=administrator")
    );
    recordResult("admin-report-export", "ADMIN", 200, response, mocks.getReportData.mock.calls.length > 0);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(mocks.getReportData).toHaveBeenCalledOnce();
  });
});
