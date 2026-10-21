import Link from "next/link";
import prisma from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { getFacilityName } from "@/lib/settings";
import { getOverdueDoseDetails } from "@/lib/vaccination-query";

export default async function DashboardPage() {
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const facilityName = await getFacilityName();
  const soon = new Date(now.getTime() + 14 * 86400000);
  const [mothers, children, ancVisits, vaccines, upcomingCount, upcoming, reminders] = await Promise.all([
    prisma.patient.count(),
    prisma.child.count(),
    prisma.ancRecord.count(),
    prisma.immunization.count(),
    prisma.appointment.count({ where: { status: "SCHEDULED", date: { gte: startToday } } }),
    prisma.appointment.findMany({
      where: { status: "SCHEDULED", date: { gte: startToday } },
      orderBy: { date: "asc" },
      take: 6,
      include: { patient: { select: { fullName: true, cardNo: true } }, child: { select: { name: true } } },
    }),
    prisma.notification.findMany({
      where: { status: "PENDING", dueDate: { lte: soon } },
      orderBy: { dueDate: "asc" },
      take: 6,
      include: { patient: { select: { fullName: true, cardNo: true } } },
    }),
  ]);
  const dueImmunizations = await getOverdueDoseDetails(now, 6);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted small">Overview of maternal and child healthcare services at {facilityName}.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card"><span className="label">Mothers registered</span><span className="kpi">{mothers}</span></div>
        <div className="card"><span className="label">Children registered</span><span className="kpi">{children}</span></div>
        <div className="card"><span className="label">ANC visits</span><span className="kpi">{ancVisits}</span></div>
        <div className="card"><span className="label">Vaccines given</span><span className="kpi">{vaccines}</span></div>
        <div className="card"><span className="label">Upcoming appointments</span><span className="kpi">{upcomingCount}</span></div>
      </div>

      <div className="two-col">
        <div className="panel">
          <h2>Upcoming appointments</h2>
          <table>
            <thead><tr><th>Mother</th><th>Child</th><th>Type</th><th>Date</th><th>Time</th></tr></thead>
            <tbody>
              {upcoming.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/patients/${a.patientId}`}>{a.patient.fullName}</Link></td>
                  <td>{a.child?.name || "-"}</td>
                  <td>{a.type}</td>
                  <td>{fmtDate(a.date)}</td>
                  <td>{a.time || "-"}</td>
                </tr>
              ))}
              {upcoming.length === 0 ? <tr><td colSpan="5" className="muted">No upcoming appointments.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Overdue vaccinations</h2>
          <table>
            <thead><tr><th>Child</th><th>Mother</th><th>Vaccine</th><th>Due date</th></tr></thead>
            <tbody>
              {dueImmunizations.map((i) => (
                <tr key={`${i.child.id}-${i.vaccineName}-${i.dose}`}>
                  <td>{i.child.name}</td>
                  <td>{i.child.patient.fullName}</td>
                  <td>{i.vaccineName} {i.dose}</td>
                  <td>{fmtDate(i.dueDate)}</td>
                </tr>
              ))}
              {dueImmunizations.length === 0 ? <tr><td colSpan="4" className="muted">No overdue vaccinations.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Reminders due in the next two weeks</h2>
        <table>
          <thead><tr><th>Mother</th><th>Type</th><th>Message</th><th>Due</th></tr></thead>
          <tbody>
            {reminders.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/patients/${r.patientId}`}>{r.patient.fullName}</Link></td>
                <td>{r.type}</td>
                <td>{r.message}</td>
                <td>{fmtDate(r.dueDate)}</td>
              </tr>
            ))}
            {reminders.length === 0 ? <tr><td colSpan="4" className="muted">No reminders due.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
