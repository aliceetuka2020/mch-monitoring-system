"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import { isAdministratorRole } from "@/lib/rbac";
import CareManagementPanel from "@/components/CareManagementPanel";
import PregnancyPanel from "@/components/PregnancyPanel";
import { calculateGestationalAge, getPregnancyAnchor } from "@/lib/pregnancy";

const emptyAnc = { visitDate: "", pregnancyId: "", gestationalAge: "", weight: "", bloodPressure: "", symptoms: "", clinicalNotes: "", laboratoryInfo: "", foetalAssessment: "", medicationsSupplements: "", healthEducation: "", nextVisit: "" };
const emptyEdit = { fullName: "", phone: "", address: "", dateOfBirth: "", bloodGroup: "", genotype: "", nextOfKin: "", previousPregnancies: "", pregnancyHistory: "", medicalHistory: "", riskFactors: "", pregnancyInformation: "", clinicalObservations: "", followUpInformation: "" };
const emptyAppt = { date: "", time: "", type: "Antenatal", notes: "", childId: "" };
const typeOptions = ["Antenatal", "Immunization", "Postnatal", "Growth monitoring", "Follow-up"];
const badgeClass = { SCHEDULED: "badge-blue", COMPLETED: "badge-green", CANCELLED: "badge-gray", MISSED: "badge-red" };

export default function PatientDetailPage() {
  const params = useParams();
  const id = params?.id;
  const [patient, setPatient] = useState(null);
  const [role, setRole] = useState("HEALTH_WORKER");
  const [anc, setAnc] = useState(emptyAnc);
  const [appt, setAppt] = useState(emptyAppt);
  const [edit, setEdit] = useState(emptyEdit);
  const [editing, setEditing] = useState(false);
  const [editingAnc, setEditingAnc] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch(`/api/patients/${id}`);
    if (!res.ok) {
      setError("Record not found");
      return;
    }
    const data = await res.json();
    setPatient(data.patient);
    setEdit({ fullName: data.patient.fullName || "", phone: data.patient.phone || "", address: data.patient.address || "", dateOfBirth: data.patient.dateOfBirth ? data.patient.dateOfBirth.slice(0, 10) : "", bloodGroup: data.patient.bloodGroup || "", genotype: data.patient.genotype || "", nextOfKin: data.patient.nextOfKin || "", previousPregnancies: data.patient.previousPregnancies || "", pregnancyHistory: data.patient.pregnancyHistory || "", medicalHistory: data.patient.medicalHistory || "", riskFactors: data.patient.riskFactors || "", pregnancyInformation: data.patient.pregnancyInformation || "", clinicalObservations: data.patient.clinicalObservations || "", followUpInformation: data.patient.followUpInformation || "" });
  }

  useEffect(() => { if (id) load(); fetch("/api/auth/me").then((r) => r.json()).then((d) => setRole(d.user?.role || "HEALTH_WORKER")); }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!patient) return <p className="muted">Loading record...</p>;
  const currentPregnancy = patient.pregnancies?.find((item) => item.status === "ONGOING") || patient.pregnancies?.[0];

  async function savePatient(e) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/patients/${patient.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Could not update patient"); return; }
    setFeedback("Patient record updated");
    setEditing(false);
    load();
  }
  async function saveAnc(e) {
    e.preventDefault();
    const res = await fetch(`/api/anc/${editingAnc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingAnc) });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Could not update ANC visit"); return; }
    setFeedback("ANC visit updated"); setEditingAnc(null); load();
  }
  async function deleteAnc(id) {
    if (!window.confirm("Delete this ANC visit?")) return;
    const res = await fetch(`/api/anc/${id}`, { method: "DELETE" });
    if (!res.ok) { const data = await res.json(); setError(data.error || "Could not delete ANC visit"); return; }
    setFeedback("ANC visit deleted"); load();
  }
  async function submitAnc(e) {
    e.preventDefault();
    setError("");
    setFeedback("");
    const res = await fetch("/api/anc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...anc, patientId: patient.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not save visit");
      return;
    }
    setFeedback("Antenatal visit saved");
    setAnc(emptyAnc);
    load();
  }

  async function submitAppt(e) {
    e.preventDefault();
    setError("");
    setFeedback("");
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...appt, patientId: patient.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not book appointment");
      return;
    }
    setFeedback("Appointment booked");
    setAppt(emptyAppt);
    load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{patient.fullName}</h1>
          <p className="muted small">Card number {patient.cardNo}, registered {fmtDate(patient.registrationDate)}</p>
        </div>
        <span className="row-actions"><button className="btn btn-sm" onClick={() => setEditing((value) => !value)}>{editing ? "Close edit" : "Edit record"}</button><Link href="/patients" className="small">Back to mothers</Link></span>
      </div>

      {feedback ? <p className="success">{feedback}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {editing ? <div className="panel">
        <h2>Edit maternal and patient information</h2>
        <form className="grid-form" onSubmit={savePatient}>
          <label>Full name<input value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} required /></label>
          <label>Phone<input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} required /></label>
          <label>Address<input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></label>
          <label>Date of birth<input type="date" value={edit.dateOfBirth} onChange={(e) => setEdit({ ...edit, dateOfBirth: e.target.value })} /></label>
          <label>Blood group<input value={edit.bloodGroup} onChange={(e) => setEdit({ ...edit, bloodGroup: e.target.value })} /></label>
          <label>Genotype<input value={edit.genotype} onChange={(e) => setEdit({ ...edit, genotype: e.target.value })} /></label>
          <label>Next of kin<input value={edit.nextOfKin} onChange={(e) => setEdit({ ...edit, nextOfKin: e.target.value })} /></label>
          <label>Previous pregnancies<textarea rows="2" value={edit.previousPregnancies} onChange={(e) => setEdit({ ...edit, previousPregnancies: e.target.value })} /></label>
          <label>Pregnancy history<textarea rows="2" value={edit.pregnancyHistory} onChange={(e) => setEdit({ ...edit, pregnancyHistory: e.target.value })} placeholder="Previous pregnancies, births, or outcomes" /></label>
          <label>Medical history<textarea rows="2" value={edit.medicalHistory} onChange={(e) => setEdit({ ...edit, medicalHistory: e.target.value })} /></label>
          <label>Risk factors<textarea rows="2" value={edit.riskFactors} onChange={(e) => setEdit({ ...edit, riskFactors: e.target.value })} /></label>
          <label>Current pregnancy information<textarea rows="2" value={edit.pregnancyInformation} onChange={(e) => setEdit({ ...edit, pregnancyInformation: e.target.value })} /></label>
          <label>Clinical observations<textarea rows="2" value={edit.clinicalObservations} onChange={(e) => setEdit({ ...edit, clinicalObservations: e.target.value })} /></label>
          <label>Follow-up information<textarea rows="2" value={edit.followUpInformation} onChange={(e) => setEdit({ ...edit, followUpInformation: e.target.value })} /></label>
          <button className="btn btn-primary" type="submit">Save changes</button>
        </form>
      </div> : null}
      <div className="panel">
        <h2>Patient details</h2>
        <table>
          <tbody>
            <tr><td className="muted">Phone</td><td>{patient.phone}</td><td className="muted">Address</td><td>{patient.address || "-"}</td></tr>
            <tr><td className="muted">Blood group</td><td>{patient.bloodGroup || "-"}</td><td className="muted">Genotype</td><td>{patient.genotype || "-"}</td></tr>
            <tr><td className="muted">Previous pregnancies</td><td>{patient.previousPregnancies || "-"}</td><td className="muted">Pregnancy history</td><td>{patient.pregnancyHistory || "-"}</td></tr>
            <tr><td className="muted">Medical history</td><td>{patient.medicalHistory || "-"}</td><td className="muted">Current pregnancy</td><td>{patient.pregnancyInformation || "-"}</td></tr>
            <tr><td className="muted">Clinical observations</td><td>{patient.clinicalObservations || "-"}</td><td className="muted">Follow-up information</td><td>{patient.followUpInformation || "-"}</td></tr>
            <tr><td className="muted">Risk factors</td><td colSpan="3">{patient.riskFactors || "-"}</td></tr>
            <tr><td className="muted">EDD</td><td>{fmtDate(currentPregnancy?.estimatedDeliveryDate)}</td><td className="muted">Pregnancy status</td><td>{currentPregnancy?.status || "-"}</td></tr>
            <tr><td className="muted">Next of kin</td><td>{patient.nextOfKin || "-"}</td><td className="muted">Children</td><td>{patient.children.length}</td></tr>
          </tbody>
        </table>
      </div>

      <PregnancyPanel patientId={patient.id} pregnancies={patient.pregnancies || []} onCreated={load} />

      <div className="panel">
        <h2>Antenatal care</h2>{editingAnc ? <form className="grid-form" onSubmit={saveAnc}><label>Visit date<input type="date" value={editingAnc.visitDate.slice(0, 10)} onChange={(e) => setEditingAnc({ ...editingAnc, visitDate: e.target.value })} /></label><label>Gestational age<input value={editingAnc.gestationalAge} onChange={(e) => setEditingAnc({ ...editingAnc, gestationalAge: e.target.value })} /></label><label>Weight<input value={editingAnc.weight} onChange={(e) => setEditingAnc({ ...editingAnc, weight: e.target.value })} /></label><label>Blood pressure<input value={editingAnc.bloodPressure || ""} onChange={(e) => setEditingAnc({ ...editingAnc, bloodPressure: e.target.value })} /></label><label>Laboratory<textarea value={editingAnc.laboratoryInfo || ""} onChange={(e) => setEditingAnc({ ...editingAnc, laboratoryInfo: e.target.value })} /></label><label>Foetal assessment<textarea value={editingAnc.foetalAssessment || ""} onChange={(e) => setEditingAnc({ ...editingAnc, foetalAssessment: e.target.value })} /></label><label>Medications and supplements<textarea value={editingAnc.medicationsSupplements || ""} onChange={(e) => setEditingAnc({ ...editingAnc, medicationsSupplements: e.target.value })} /></label><label>Health education provided<textarea value={editingAnc.healthEducation || ""} onChange={(e) => setEditingAnc({ ...editingAnc, healthEducation: e.target.value })} /></label><label>Next visit<input type="date" value={editingAnc.nextVisit ? editingAnc.nextVisit.slice(0, 10) : ""} onChange={(e) => setEditingAnc({ ...editingAnc, nextVisit: e.target.value })} /></label><button className="btn btn-primary">Save ANC changes</button><button type="button" className="btn" onClick={() => setEditingAnc(null)}>Close</button></form> : null}
        <form className="grid-form" onSubmit={submitAnc}>
          <label>Visit date<input type="date" value={anc.visitDate} onChange={(e) => { const pregnancy = patient.pregnancies?.find((item) => String(item.id) === String(anc.pregnancyId)) || patient.pregnancies?.find((item) => item.status === "ONGOING"); const age = pregnancy ? calculateGestationalAge(getPregnancyAnchor(pregnancy), e.target.value) : null; setAnc({ ...anc, visitDate: e.target.value, pregnancyId: anc.pregnancyId || String(pregnancy?.id || ""), gestationalAge: age || anc.gestationalAge }); }} required /></label>
          <label>Pregnancy<select value={anc.pregnancyId} onChange={(e) => { const pregnancy = patient.pregnancies?.find((item) => String(item.id) === e.target.value); const age = pregnancy && anc.visitDate ? calculateGestationalAge(getPregnancyAnchor(pregnancy), anc.visitDate) : null; setAnc({ ...anc, pregnancyId: e.target.value, gestationalAge: age || anc.gestationalAge }); }}><option value="">No linked pregnancy</option>{(patient.pregnancies || []).map((item) => <option key={item.id} value={item.id}>{item.status}, EDD {fmtDate(item.estimatedDeliveryDate)}</option>)}</select></label>
          <label>Gestational age<input value={anc.gestationalAge} readOnly placeholder="Calculated from LMP when available" /></label>
          <label>Weight (kg)<input type="number" step="0.1" min="0" value={anc.weight} onChange={(e) => setAnc({ ...anc, weight: e.target.value })} required /></label>
          <label>Blood pressure<input value={anc.bloodPressure} onChange={(e) => setAnc({ ...anc, bloodPressure: e.target.value })} placeholder="110/70" /></label>
          <label>Symptoms<input value={anc.symptoms} onChange={(e) => setAnc({ ...anc, symptoms: e.target.value })} /></label>
          <label>Next visit<input type="date" value={anc.nextVisit} onChange={(e) => setAnc({ ...anc, nextVisit: e.target.value })} /></label>
          <label>Laboratory information<textarea rows="2" value={anc.laboratoryInfo} onChange={(e) => setAnc({ ...anc, laboratoryInfo: e.target.value })} placeholder="Tests and findings where applicable" /></label>
          <label>Foetal assessment<textarea rows="2" value={anc.foetalAssessment} onChange={(e) => setAnc({ ...anc, foetalAssessment: e.target.value })} /></label>
          <label>Medications and supplements<textarea rows="2" value={anc.medicationsSupplements} onChange={(e) => setAnc({ ...anc, medicationsSupplements: e.target.value })} /></label>
          <label>Health education provided<textarea rows="2" value={anc.healthEducation} onChange={(e) => setAnc({ ...anc, healthEducation: e.target.value })} /></label>
          <label className="span-2">Clinical notes<textarea rows="2" value={anc.clinicalNotes} onChange={(e) => setAnc({ ...anc, clinicalNotes: e.target.value })} /></label>
          <button className="btn btn-primary" type="submit">Save visit</button>
        </form>
        <table>
          <thead><tr><th>Visit date</th><th>Pregnancy</th><th>Gestational age</th><th>Weight</th><th>Blood pressure</th><th>Symptoms</th><th>Laboratory</th><th>Foetal assessment</th><th>Medications and supplements</th><th>Health education provided</th><th>Next visit</th><th>Recorded by</th><th>Action</th></tr></thead>
          <tbody>
            {patient.ancRecords.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.visitDate)}</td>
                <td>{r.pregnancyId || "-"}</td>
                <td>{r.gestationalAge}</td>
                <td>{r.weight} kg</td>
                <td>{r.bloodPressure || "-"}</td>
                <td>{r.symptoms || "-"}</td>
                <td>{r.laboratoryInfo || "-"}</td>
                <td>{r.foetalAssessment || "-"}</td>
                <td>{r.medicationsSupplements || "-"}</td>
                <td>{r.healthEducation || "-"}</td>
                <td>{fmtDate(r.nextVisit)}</td>
                <td>{r.recordedBy.fullName}</td><td><button className="btn btn-sm" onClick={() => setEditingAnc({ ...r })}>Edit</button>{isAdministratorRole(role) ? <button className="btn btn-sm" onClick={() => deleteAnc(r.id)}>Delete</button> : null}</td>
              </tr>
            ))}
            {patient.ancRecords.length === 0 ? <tr><td colSpan="13" className="muted">No antenatal visits recorded.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Children of this mother</h2>
        <table>
          <thead><tr><th>Child</th><th>Date of birth</th><th>Gender</th><th>Vaccines</th><th>Growth records</th></tr></thead>
          <tbody>
            {patient.children.map((c) => (
              <tr key={c.id}>
                <td><Link href="/children">{c.name}</Link></td>
                <td>{fmtDate(c.dateOfBirth)}</td>
                <td>{c.gender}</td>
                <td>{c.immunizations.length}</td>
                <td>{c.growthRecords.length}</td>
              </tr>
            ))}
            {patient.children.length === 0 ? <tr><td colSpan="5" className="muted">No children registered for this mother.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Appointments</h2>
        <form className="grid-form" onSubmit={submitAppt}>
          <label>Date<input type="date" value={appt.date} onChange={(e) => setAppt({ ...appt, date: e.target.value })} required /></label>
          <label>Child, optional<select value={appt.childId} onChange={(e) => setAppt({ ...appt, childId: e.target.value })}><option value="">Mother only</option>{patient.children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</select></label>
          <label>Time<input type="time" value={appt.time} onChange={(e) => setAppt({ ...appt, time: e.target.value })} /></label>
          <label>Type
            <select value={appt.type} onChange={(e) => setAppt({ ...appt, type: e.target.value })}>
              {typeOptions.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>Notes<input value={appt.notes} onChange={(e) => setAppt({ ...appt, notes: e.target.value })} /></label>
          <button className="btn btn-primary" type="submit">Book</button>
        </form>
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Type</th><th>Child</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            {patient.appointments.map((a) => (
              <tr key={a.id}>
                <td>{fmtDate(a.date)}</td>
                <td>{a.time || "-"}</td>
                <td>{a.type}</td>
                <td>{a.child?.name || "-"}</td>
                <td><span className={`badge ${badgeClass[a.status] || "badge-gray"}`}>{a.status}</span></td>
                <td>{a.notes || "-"}</td>
              </tr>
            ))}
            {patient.appointments.length === 0 ? <tr><td colSpan="6" className="muted">No appointments booked.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <CareManagementPanel patientId={patient.id} />
    </div>
  );
}
