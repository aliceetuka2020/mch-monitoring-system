import { getSession } from "@/lib/auth";
import { getReportData, reportTypeIncludes } from "@/lib/report-data";
import { fmtDate } from "@/lib/format";
import { getWeightForAgeStatus } from "@/lib/health";
import { isAdministratorRole } from "@/lib/rbac";
import PrintButton from "@/components/PrintButton";

function Table({ title, headers, rows, emptyText = "No records match the selected filters." }) {
  return <section className="panel report-section"><h2>{title}</h2><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell ?? "-"}</td>)}</tr>) : <tr><td colSpan={headers.length} className="muted">{emptyText}</td></tr>}</tbody></table></section>;
}

export default async function ReportsPage({ searchParams = {} }) {
  const [session, data] = await Promise.all([getSession(), getReportData(searchParams)]);
  const filters = data.filters;
  const service = filters.serviceType;
  const showAppointments = !service || ["Antenatal", "Immunization", "Postnatal", "Growth monitoring", "Follow-up"].includes(service);
  const showMaternal = !service || ["Antenatal", "Delivery", "Postnatal"].includes(service);
  const showImmunization = !service || service === "Immunization";
  const showDueDoses = showImmunization || service === "Follow-up";
  const showGrowth = !service || service === "Growth monitoring";
  const showChildStatistics = !service;
  const showZeroDose = !service || service === "Immunization";
  const showAdministrator = !service;
  const allAppointments = data.appointments.map((row) => [row.patient.fullName, row.child?.name || "-", row.type, fmtDate(row.date), row.status]);
  const missed = data.missedAppointments.map((row) => [row.patient.fullName, row.child?.name || "-", row.type, fmtDate(row.date)]);
  const due = data.overdueDoses.map((row) => [row.child.name, row.child.patient.fullName, row.child.guardianName || "-", row.child.guardianPhone || "-", `${row.vaccineName} ${row.dose}`, fmtDate(row.dueDate), row.status]);
  const followup = data.followUp.map((row) => [row.type, row.name, row.mother, row.guardianName || "-", row.guardianPhone || "-", row.reason, fmtDate(row.date)]);
  const growth = data.growthRecords.map((row) => [row.child.childNo || "-", row.child.name, row.child.patient.fullName, fmtDate(row.measurementDate), row.ageInMonths, `${row.weight} kg`, row.height, getWeightForAgeStatus(row.ageInMonths, row.weight)]);
  const ancVisits = data.ancRecords.map((row) => [row.patient.cardNo, row.patient.fullName, fmtDate(row.visitDate), row.gestationalAge, `${row.weight} kg`]);
  const vaccineRows = data.vaccineGroups.map((row) => [row.vaccineName, row.dose, row.count]);
  const coverageRows = data.coverage.map((row) => [row.vaccineName, row.dose, row.eligible, row.given, `${row.coveragePercent}%`]);
  const canAdmin = isAdministratorRole(session?.role);
  const type = filters.type;
  const statusRows = Object.entries(data.appointmentGroups).map(([status, count]) => [status, count]);
  const maternalRows = data.maternalStats.mothers.map((row) => [row.cardNo, row.fullName, row.ancVisits, row.deliveries, row.outcomes, row.postnatalVisits]);
  const childRows = [...data.childStats.ageGroups.map((row) => [row.label, row.count]), ...data.childStats.gender.map((row) => [`Gender, ${row.gender}`, row.count]), ["Child healthcare visits", data.childStats.visits], ["Zero-dose children", data.childStats.zeroDose]];
  const adminRows = [...data.administratorStats.usersByRole.map((row) => [`${row.role} users`, row.count]), ["Active accounts", data.administratorStats.active], ["Inactive accounts", data.administratorStats.inactive], ...data.administratorStats.recordsPerMonth.map((row) => [`Records created, ${row.month}`, row.count])];
  return <div className="report-page">
    <div className="page-head"><div><h1>Reports</h1><p className="muted small">Filtered service and facility statistics for {filters.start} to {filters.end}.</p></div><div className="row-actions"><PrintButton />{canAdmin ? <a className="btn btn-primary" href={`/api/reports/export?${new URLSearchParams({ start: filters.start, end: filters.end, type, serviceType: filters.serviceType })}`}>Export CSV</a> : null}</div></div>
    <form className="panel grid-form report-filter" method="get"><label>Start date<input type="date" name="start" defaultValue={filters.start} /></label><label>End date<input type="date" name="end" defaultValue={filters.end} /></label><label>Report type<select name="type" defaultValue={type}><option value="all">All reports</option><option value="appointments">Appointments</option><option value="immunization">Immunization</option><option value="growth">Child growth</option><option value="maternal">Maternal healthcare</option><option value="child">Child healthcare</option><option value="administrator">Administrator</option></select></label><label>Service type<select name="serviceType" defaultValue={filters.serviceType}><option value="">All services</option><option>Antenatal</option><option>Delivery</option><option>Postnatal</option><option>Immunization</option><option>Growth monitoring</option><option>Follow-up</option></select></label><button className="btn btn-primary">Apply filters</button></form>
    <div className="cards"><div className="card"><span className="label">Mother registrations</span><span className="kpi">{data.maternalStats.registrations}</span></div><div className="card"><span className="label">ANC visits</span><span className="kpi">{data.maternalStats.ancVisits}</span></div><div className="card"><span className="label">Children</span><span className="kpi">{data.childStats.total}</span></div><div className="card"><span className="label">Zero-dose children</span><span className="kpi">{data.childStats.zeroDose}</span></div><div className="card"><span className="label">Missed appointments</span><span className="kpi">{data.missedAppointments.length}</span></div></div>
    {showAppointments && reportTypeIncludes(type, "appointments") ? <><Table title="Appointments" headers={["Mother", "Child", "Service", "Date", "Status"]} rows={allAppointments} /><Table title="Appointments by status" headers={["Status", "Count"]} rows={statusRows} /><Table title="Missed appointments" headers={["Mother", "Child", "Type", "Date"]} rows={missed} /></> : null}
    {showImmunization && reportTypeIncludes(type, "immunization") ? <><Table title="Immunization doses administered" headers={["Vaccine", "Dose", "Count"]} rows={vaccineRows} /><Table title="Immunization coverage by scheduled dose" headers={["Vaccine", "Dose", "Eligible children", "Recorded doses in period", "Coverage"]} rows={coverageRows} /></> : null}
    {showDueDoses && reportTypeIncludes(type, "immunization") ? <Table title="Immunization due and overdue list" headers={["Child", "Mother", "Guardian", "Phone", "Dose", "Due date", "Status"]} rows={due} /> : null}
    {showAppointments && (type === "all" || type === "appointments" || type === "immunization") ? <Table title="Follow-up list" headers={["Patient type", "Name", "Mother", "Guardian", "Phone", "Reason", "Due date"]} rows={followup} /> : null}
    {showGrowth && reportTypeIncludes(type, "growth") ? <Table title="Child growth measurements" headers={["Child number", "Child", "Mother", "Measurement date", "Age in months", "Weight", "Height, cm", "Weight-for-age status"]} rows={growth} /> : null}
    {showMaternal && reportTypeIncludes(type, "maternal") ? <><Table title="Maternal healthcare summary by mother" headers={["Card number", "Mother", "ANC visits", "Deliveries", "Delivery outcomes", "Postnatal visits"]} rows={maternalRows} /><Table title="ANC visit detail" headers={["Card number", "Mother", "Visit date", "Gestational age", "Weight"]} rows={ancVisits} /><Table title="Delivery outcomes" headers={["Outcome", "Count"]} rows={data.maternalStats.outcomes.map((row) => [row.outcome, row.count])} /></> : null}
    {showChildStatistics && reportTypeIncludes(type, "child") ? <Table title="Child healthcare statistics" headers={["Measure", "Count"]} rows={childRows} /> : null}
    {showZeroDose && reportTypeIncludes(type, "child") ? <Table title="Zero-dose children" headers={["Child number", "Child", "Mother", "Guardian", "Phone"]} rows={data.zeroDoseChildren.map((child) => [child.childNo || "-", child.name, child.patient.fullName, child.guardianName || "-", child.guardianPhone || "-"])} /> : null}
    {canAdmin && showAdministrator && reportTypeIncludes(type, "administrator") ? <Table title="Administrator statistics" headers={["Measure", "Count"]} rows={adminRows} /> : null}
    <p className="muted small">{data.recordLimitNote}</p>
  </div>;
}
