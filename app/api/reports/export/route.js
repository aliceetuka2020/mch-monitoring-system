import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { getReportData } from "@/lib/report-data";
import { getWeightForAgeStatus } from "@/lib/health";

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request) {
  const { error } = await requireAuth(["ADMIN"]);
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const data = await getReportData({ start: params.get("start"), end: params.get("end"), type: params.get("type") || "all", serviceType: params.get("serviceType") || "" });
  const rows = [["Section", "Date", "Patient or child", "Service or measure", "Details"]];
  const include = (type) => data.filters.type === "all" || data.filters.type === type;
  if (include("appointments")) {
    data.appointments.forEach((row) => rows.push(["Appointment", row.date.toISOString(), row.patient.fullName, row.type, `${row.child?.name || "Mother only"}, ${row.status}`]));
    data.missedAppointments.forEach((row) => rows.push(["Missed appointment", row.date.toISOString(), row.patient.fullName, row.type, row.child?.name || "Mother only"]));
  }
  if (include("immunization")) {
    data.vaccineGroups.forEach((row) => rows.push(["Immunization totals", "", row.vaccineName, row.dose, row.count]));
    data.overdueDoses.forEach((row) => rows.push(["Dose due or overdue", row.dueDate.toISOString(), row.child.name, `${row.vaccineName} ${row.dose}`, `${row.status}, mother ${row.child.patient.fullName}, guardian ${row.child.guardianName || ""}, phone ${row.child.guardianPhone || ""}`]));
    data.coverage.forEach((row) => rows.push(["Coverage", "", row.vaccineName, row.dose, `${row.given}/${row.eligible}, ${row.coveragePercent}%`]));
  }
  if (include("growth")) data.growthRecords.forEach((row) => rows.push(["Growth measurement", row.measurementDate.toISOString(), row.child.name, "Weight-for-age", `${row.weight} kg, ${row.height} cm, ${row.ageInMonths} months, ${getWeightForAgeStatus(row.ageInMonths, row.weight)}`]));
  if (include("maternal")) {
    data.maternalStats.mothers.forEach((row) => rows.push(["Maternal statistics", "", row.fullName, row.cardNo, `ANC ${row.ancVisits}, deliveries ${row.deliveries}, outcomes ${row.outcomes}, postnatal ${row.postnatalVisits}`]));
    data.ancRecords.forEach((row) => rows.push(["ANC visit", row.visitDate.toISOString(), row.patient.fullName, "Antenatal", `${row.gestationalAge}, ${row.weight} kg`]));
  }
  if (include("child")) {
    data.childStats.ageGroups.forEach((row) => rows.push(["Child statistics", "", row.label, "Age group", row.count]));
    data.childStats.gender.forEach((row) => rows.push(["Child statistics", "", row.gender, "Gender", row.count]));
    rows.push(["Child statistics", "", "All children", "Visits", data.childStats.visits], ["Child statistics", "", "All children", "Zero dose", data.childStats.zeroDose]);
    data.zeroDoseChildren.forEach((child) => rows.push(["Zero-dose child", "", child.name, child.childNo || "", `Mother ${child.patient.fullName}, guardian ${child.guardianName || ""}, phone ${child.guardianPhone || ""}`]));
  }
  if (include("administrator")) {
    data.administratorStats.usersByRole.forEach((row) => rows.push(["Administrator statistics", "", row.role, "Users", row.count]));
    rows.push(["Administrator statistics", "", "Accounts", "Active", data.administratorStats.active], ["Administrator statistics", "", "Accounts", "Inactive", data.administratorStats.inactive]);
    data.administratorStats.recordsPerMonth.forEach((row) => rows.push(["Records created per month", row.month, "Facility", "All record categories", row.count]));
  }
  if (data.filters.type === "all" || data.filters.type === "appointments" || data.filters.type === "immunization") data.followUp.forEach((row) => rows.push(["Follow up", row.date.toISOString(), row.name, row.service, `${row.reason}, guardian ${row.guardianName || ""}, phone ${row.guardianPhone || ""}`]));
  const csv = rows.map((row) => row.map(csvValue).join(",")).join("\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=mch-monitoring-report.csv" } });
}
