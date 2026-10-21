"use client";
import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import { formatAgeMonths, getChildVaccinationSummary, getImmunizationStatuses, getWeightForAgeStatus } from "@/lib/health";
import { IMMUNIZATION_SCHEDULE, findScheduledDose, getNextScheduledDueDate } from "@/lib/schedule";
import Pagination from "@/components/Pagination";
import { isAdministratorRole } from "@/lib/rbac";

const emptyChild = { patientId: "", name: "", dateOfBirth: "", gender: "Female", birthWeight: "", medicalHistory: "", guardianName: "", guardianPhone: "", guardianRelationship: "", placeOfBirth: "", deliveryType: "" };
const emptyVaccine = { vaccineName: "", dose: "", otherVaccineName: "", otherDose: "", dateGiven: "", nextDueDate: "", remarks: "" };
const emptyGrowth = { measurementDate: "", weight: "", height: "", headCircumference: "", observation: "" };
const emptyVisit = { visitDate: "", reason: "", findings: "", treatment: "", nextVisit: "" };

export default function ChildrenPage() {
  const [children, setChildren] = useState([]);
  const [mothers, setMothers] = useState([]);
  const [role, setRole] = useState("HEALTH_WORKER");
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyChild);
  const [vaccine, setVaccine] = useState(emptyVaccine);
  const [growth, setGrowth] = useState(emptyGrowth);
  const [visit, setVisit] = useState(emptyVisit);
  const [editingChild, setEditingChild] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editingVisit, setEditingVisit] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  async function load(q = query, page = 1) {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (q) params.set("q", q);
    const [childResponse, motherResponse] = await Promise.all([fetch(`/api/children?${params}`).then((r) => r.json()), fetch("/api/patients?pageSize=100").then((r) => r.json())]);
    setChildren(childResponse.children || []);
    setMothers(motherResponse.patients || []);
    setPagination(childResponse.pagination || { page: 1, totalPages: 1, total: 0 });
  }
  useEffect(() => {
    load("");
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setRole(d.user?.role || "HEALTH_WORKER"));
  }, []);
  const selected = children.find((child) => child.id === selectedId) || null;
  const vaccination = selected ? getChildVaccinationSummary(selected) : null;
  const scheduleStatuses = selected ? getImmunizationStatuses(selected) : [];

  async function send(url, method, body) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Operation failed"); return false; }
    return true;
  }
  async function submitChild(event) {
    event.preventDefault(); setError("");
    if (await send("/api/children", "POST", form)) { setFeedback("Child registered"); setForm(emptyChild); await load(); }
  }
  async function saveChild(event) {
    event.preventDefault(); setError("");
    if (await send(`/api/children/${editingChild.id}`, "PUT", editingChild)) { setFeedback("Child details updated"); setEditingChild(null); await load(); }
  }
  async function remove(url, label) {
    if (!window.confirm(`Delete this ${label}?`)) return;
    if (await send(url, "DELETE", {})) { setFeedback(`${label} deleted`); setEditingRecord(null); setEditingVisit(null); await load(); }
  }
  async function submitVaccine(event) {
    event.preventDefault(); setError("");
    if (await send("/api/immunizations", "POST", { ...vaccine, childId: selected.id })) { setFeedback("Immunization recorded"); setVaccine(emptyVaccine); await load(); }
  }
  async function submitGrowth(event) {
    event.preventDefault(); setError("");
    if (await send("/api/growth", "POST", { ...growth, childId: selected.id })) { setFeedback("Growth record saved"); setGrowth(emptyGrowth); await load(); }
  }
  async function saveVisit(event) {
    event.preventDefault(); setError("");
    const isEdit = Boolean(editingVisit);
    const data = isEdit ? editingVisit : { ...visit, childId: selected.id };
    const path = isEdit ? `/api/child-visits/${editingVisit.id}` : "/api/child-visits";
    if (await send(path, isEdit ? "PATCH" : "POST", data)) { setFeedback(isEdit ? "Child visit updated" : "Child visit recorded"); setVisit(emptyVisit); setEditingVisit(null); await load(); }
  }
  async function saveRecord(event) {
    event.preventDefault();
    const record = editingRecord;
    const path = record.recordType === "immunization" ? `/api/immunizations/${record.id}` : `/api/growth/${record.id}`;
    if (await send(path, "PATCH", record)) { setFeedback("Record updated"); setEditingRecord(null); await load(); }
  }
  function editChild(child) {
    setEditingChild({ ...child, dateOfBirth: child.dateOfBirth.slice(0, 10), patientId: String(child.patientId), birthWeight: child.birthWeight ?? "", guardianName: child.guardianName || "", guardianPhone: child.guardianPhone || "", guardianRelationship: child.guardianRelationship || "", placeOfBirth: child.placeOfBirth || "", deliveryType: child.deliveryType || "", medicalHistory: child.medicalHistory || "" });
  }
  function selectDose(value) {
    if (value === "Other") { setVaccine({ ...vaccine, vaccineName: "Other", dose: "", otherVaccineName: "", otherDose: "", nextDueDate: "" }); return; }
    const [vaccineName, dose] = value.split("|");
    const due = selected ? getNextScheduledDueDate(selected.dateOfBirth, vaccineName, dose) : null;
    setVaccine({ ...vaccine, vaccineName, dose, nextDueDate: due ? due.toISOString().slice(0, 10) : "" });
  }
  function selectEditedDose(value) {
    if (value === "Other") { setEditingRecord({ ...editingRecord, vaccineName: "Other", dose: "", otherVaccineName: editingRecord.otherVaccineName || "", otherDose: editingRecord.otherDose || "", nextDueDate: "" }); return; }
    const [vaccineName, dose] = value.split("|");
    const due = selected ? getNextScheduledDueDate(selected.dateOfBirth, vaccineName, dose) : null;
    setEditingRecord({ ...editingRecord, vaccineName, dose, otherVaccineName: "", otherDose: "", nextDueDate: due ? due.toISOString().slice(0, 10) : "" });
  }

  return <div>
    <div className="page-head"><div><h1>Children</h1><p className="muted small">Maintain child health details, vaccination, growth, and visits.</p></div></div>
    {feedback ? <p className="success">{feedback}</p> : null}{error ? <p className="error">{error}</p> : null}
    <div className="panel"><h2>Register child</h2><form className="grid-form" onSubmit={submitChild}>
      <label>Mother<select value={form.patientId} onChange={(event) => setForm({ ...form, patientId: event.target.value })} required><option value="">Select mother</option>{mothers.map((mother) => <option key={mother.id} value={mother.id}>{mother.fullName} ({mother.cardNo})</option>)}</select></label>
      <label>Child name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
      <label>Date of birth<input type="date" value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} required /></label>
      <label>Gender<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option>Female</option><option>Male</option></select></label>
      <label>Birth weight, kg<input type="number" step="0.1" min="0.3" max="8" value={form.birthWeight} onChange={(event) => setForm({ ...form, birthWeight: event.target.value })} /></label>
      <label>Guardian name<input value={form.guardianName} onChange={(event) => setForm({ ...form, guardianName: event.target.value })} placeholder="Defaults to mother" /></label>
      <label>Guardian phone<input value={form.guardianPhone} onChange={(event) => setForm({ ...form, guardianPhone: event.target.value })} placeholder="Defaults to mother's phone" /></label>
      <label>Guardian relationship<input value={form.guardianRelationship} onChange={(event) => setForm({ ...form, guardianRelationship: event.target.value })} placeholder="Defaults to Mother" /></label>
      <label>Place of birth<input value={form.placeOfBirth} onChange={(event) => setForm({ ...form, placeOfBirth: event.target.value })} /></label>
      <label>Delivery type<input value={form.deliveryType} onChange={(event) => setForm({ ...form, deliveryType: event.target.value })} placeholder="Vaginal, caesarean" /></label>
      <label>Medical history<textarea value={form.medicalHistory} onChange={(event) => setForm({ ...form, medicalHistory: event.target.value })} /></label>
      <button className="btn btn-primary">Save</button>
    </form></div>

    <div className="panel"><form className="search-row" onSubmit={(event) => { event.preventDefault(); load(query, 1); }}><input placeholder="Search child name, child number or mother" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="btn">Search</button>{query ? <button type="button" className="btn" onClick={() => { setQuery(""); load("", 1); }}>Clear</button> : null}</form>
      <table><thead><tr><th>Child number</th><th>Child</th><th>Mother</th><th>Date of birth</th><th>Vaccination summary</th><th>Growth</th><th>Action</th></tr></thead><tbody>
        {children.map((child) => { const summary = getChildVaccinationSummary(child); return <tr key={child.id} className={child.id === selectedId ? "selected" : ""}><td>{child.childNo || "-"}</td><td><button className="btn btn-sm" onClick={() => setSelectedId(child.id)}>{child.name}</button></td><td>{child.patient.fullName}</td><td>{fmtDate(child.dateOfBirth)}</td><td>{summary.givenCount} given, {summary.dueCount} due, {summary.overdueCount} overdue{summary.zeroDose ? ", zero-dose" : ""}</td><td>{child.growthRecords.length}</td><td><span className="row-actions"><button className="btn btn-sm" onClick={() => editChild(child)}>Edit</button>{isAdministratorRole(role) ? <button className="btn btn-sm" onClick={() => remove(`/api/children/${child.id}`, "child record")}>Delete</button> : null}</span></td></tr>; })}
        {children.length === 0 ? <tr><td colSpan="7" className="muted">No children found.</td></tr> : null}
      </tbody></table><Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={(page) => load(query, page)} />
    </div>

    {editingChild ? <div className="panel"><h2>Edit child and guardian details</h2><form className="grid-form" onSubmit={saveChild}>
      <label>Mother<select value={editingChild.patientId} onChange={(event) => setEditingChild({ ...editingChild, patientId: event.target.value })}>{mothers.map((mother) => <option key={mother.id} value={mother.id}>{mother.fullName} ({mother.cardNo})</option>)}</select></label>
      <label>Name<input value={editingChild.name} onChange={(event) => setEditingChild({ ...editingChild, name: event.target.value })} /></label>
      <label>Date of birth<input type="date" value={editingChild.dateOfBirth} onChange={(event) => setEditingChild({ ...editingChild, dateOfBirth: event.target.value })} /></label>
      <label>Gender<select value={editingChild.gender} onChange={(event) => setEditingChild({ ...editingChild, gender: event.target.value })}><option>Female</option><option>Male</option></select></label>
      <label>Birth weight<input type="number" step="0.1" min="0.3" max="8" value={editingChild.birthWeight} onChange={(event) => setEditingChild({ ...editingChild, birthWeight: event.target.value })} /></label>
      <label>Guardian name<input value={editingChild.guardianName} onChange={(event) => setEditingChild({ ...editingChild, guardianName: event.target.value })} /></label>
      <label>Guardian phone<input value={editingChild.guardianPhone} onChange={(event) => setEditingChild({ ...editingChild, guardianPhone: event.target.value })} /></label>
      <label>Guardian relationship<input value={editingChild.guardianRelationship} onChange={(event) => setEditingChild({ ...editingChild, guardianRelationship: event.target.value })} /></label>
      <label>Place of birth<input value={editingChild.placeOfBirth} onChange={(event) => setEditingChild({ ...editingChild, placeOfBirth: event.target.value })} /></label>
      <label>Delivery type<input value={editingChild.deliveryType} onChange={(event) => setEditingChild({ ...editingChild, deliveryType: event.target.value })} /></label>
      <label>Medical history<textarea value={editingChild.medicalHistory} onChange={(event) => setEditingChild({ ...editingChild, medicalHistory: event.target.value })} /></label>
      <button className="btn btn-primary">Save changes</button><button type="button" className="btn" onClick={() => setEditingChild(null)}>Close</button>
    </form></div> : null}

    {selected ? <>
      <div className="panel"><h2>Selected child, {selected.name}</h2><table><tbody>
        <tr><td className="muted">Child number</td><td>{selected.childNo || "-"}</td><td className="muted">Mother</td><td>{selected.patient.fullName}</td></tr>
        <tr><td className="muted">Date of birth</td><td>{fmtDate(selected.dateOfBirth)}</td><td className="muted">Gender</td><td>{selected.gender}</td></tr>
        <tr><td className="muted">Birth weight</td><td>{selected.birthWeight ? `${selected.birthWeight} kg` : "-"}</td><td className="muted">Guardian relationship</td><td>{selected.guardianRelationship || "Mother"}</td></tr>
        <tr><td className="muted">Guardian</td><td>{selected.guardianName || selected.patient.fullName}</td><td className="muted">Guardian phone</td><td>{selected.guardianPhone || selected.patient.phone}</td></tr>
        <tr><td className="muted">Relationship</td><td>{selected.guardianRelationship || "Mother"}</td><td className="muted">Place of birth</td><td>{selected.placeOfBirth || "-"}</td></tr>
        <tr><td className="muted">Delivery type</td><td>{selected.deliveryType || "-"}</td><td className="muted">Medical history</td><td>{selected.medicalHistory || "-"}</td></tr>
      </tbody></table></div>

      <div className="panel"><h2>Immunization record for {selected.name}</h2><form className="grid-form" onSubmit={submitVaccine}>
        <label>Vaccine and dose<select value={vaccine.vaccineName === "Other" ? "Other" : vaccine.vaccineName ? `${vaccine.vaccineName}|${vaccine.dose}` : ""} onChange={(event) => selectDose(event.target.value)} required><option value="">Select scheduled dose</option>{IMMUNIZATION_SCHEDULE.map((dose) => <option key={`${dose.vaccineName}|${dose.dose}`} value={`${dose.vaccineName}|${dose.dose}`}>{dose.vaccineName}, {dose.dose}</option>)}<option value="Other">Other</option></select></label>
        {vaccine.vaccineName === "Other" ? <><label>Other vaccine<input value={vaccine.otherVaccineName} onChange={(event) => setVaccine({ ...vaccine, otherVaccineName: event.target.value })} required /></label><label>Other dose<input value={vaccine.otherDose} onChange={(event) => setVaccine({ ...vaccine, otherDose: event.target.value })} required /></label></> : null}
        <label>Date given<input type="date" value={vaccine.dateGiven} onChange={(event) => setVaccine({ ...vaccine, dateGiven: event.target.value })} required /></label><label>Next due<input type="date" value={vaccine.nextDueDate} onChange={(event) => setVaccine({ ...vaccine, nextDueDate: event.target.value })} /></label>
        <label>Remarks<input value={vaccine.remarks} onChange={(event) => setVaccine({ ...vaccine, remarks: event.target.value })} /></label><button className="btn btn-primary">Record vaccine</button>
      </form>
      <h3>Scheduled doses and status</h3><table><thead><tr><th>Vaccine</th><th>Dose</th><th>Due date</th><th>Status</th></tr></thead><tbody>
        {scheduleStatuses.map((dose) => <tr key={`${dose.vaccineName}|${dose.dose}`}><td>{dose.vaccineName}</td><td>{dose.dose}</td><td>{fmtDate(dose.dueDate)}</td><td>{dose.status}</td></tr>)}
      </tbody></table>
      <h3>Recorded immunizations</h3><table><thead><tr><th>Vaccine</th><th>Dose</th><th>Date</th><th>Next due</th><th>Administered by</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {selected.immunizations.map((item) => <tr key={item.id}><td>{item.vaccineName}</td><td>{item.dose}</td><td>{fmtDate(item.dateGiven)}</td><td>{fmtDate(item.nextDueDate)}</td><td>{item.administeredBy?.fullName || "-"}</td><td>Given</td><td><span className="row-actions"><button className="btn btn-sm" onClick={() => { const scheduled = findScheduledDose(item.vaccineName, item.dose); setEditingRecord({ ...item, recordType: "immunization", vaccineName: scheduled ? item.vaccineName : "Other", dose: scheduled ? item.dose : "", otherVaccineName: scheduled ? "" : item.vaccineName, otherDose: scheduled ? "" : item.dose, dateGiven: item.dateGiven.slice(0, 10), nextDueDate: item.nextDueDate ? item.nextDueDate.slice(0, 10) : "" }); }}>Edit</button>{isAdministratorRole(role) ? <button className="btn btn-sm" onClick={() => remove(`/api/immunizations/${item.id}`, "immunization")}>Delete</button> : null}</span></td></tr>)}
        {selected.immunizations.length === 0 ? <tr><td colSpan="7" className="muted">No immunizations recorded.</td></tr> : null}
      </tbody></table></div>

      <div className="panel"><h2>Growth records for {selected.name}</h2><p className="muted small">The displayed weight-for-age status is a simplified aid, not a replacement for WHO growth standards.</p>
        <form className="grid-form" onSubmit={submitGrowth}><label>Date<input type="date" value={growth.measurementDate} onChange={(event) => setGrowth({ ...growth, measurementDate: event.target.value })} required /></label>
          <label>Weight, kg<input type="number" step="0.1" min="0.3" max="300" value={growth.weight} onChange={(event) => setGrowth({ ...growth, weight: event.target.value })} required /></label><label>Height, cm<input type="number" step="0.1" min="20" max="250" value={growth.height} onChange={(event) => setGrowth({ ...growth, height: event.target.value })} required /></label>
          <label>Head circumference, cm<input type="number" step="0.1" min="10" max="100" value={growth.headCircumference} onChange={(event) => setGrowth({ ...growth, headCircumference: event.target.value })} /></label><label>Observation<textarea value={growth.observation} onChange={(event) => setGrowth({ ...growth, observation: event.target.value })} /></label><button className="btn btn-primary">Save measurement</button>
        </form><table><thead><tr><th>Date</th><th>Age</th><th>Weight</th><th>Weight-for-age status</th><th>Height</th><th>Head circumference</th><th>Action</th></tr></thead><tbody>
          {selected.growthRecords.map((record) => <tr key={record.id}><td>{fmtDate(record.measurementDate)}</td><td>{formatAgeMonths(record.ageInMonths)}</td><td>{record.weight} kg</td><td>{getWeightForAgeStatus(record.ageInMonths, record.weight)}</td><td>{record.height} cm</td><td>{record.headCircumference ?? "-"}</td><td><span className="row-actions"><button className="btn btn-sm" onClick={() => setEditingRecord({ ...record, recordType: "growth", measurementDate: record.measurementDate.slice(0, 10), headCircumference: record.headCircumference ?? "" })}>Edit</button>{isAdministratorRole(role) ? <button className="btn btn-sm" onClick={() => remove(`/api/growth/${record.id}`, "growth record")}>Delete</button> : null}</span></td></tr>)}
          {selected.growthRecords.length === 0 ? <tr><td colSpan="7" className="muted">No growth measurements recorded.</td></tr> : null}
        </tbody></table>
      </div>

      <div className="panel"><h2>Child healthcare visits for {selected.name}</h2><form className="grid-form" onSubmit={saveVisit}>
        <label>Visit date<input type="date" value={editingVisit ? editingVisit.visitDate : visit.visitDate} onChange={(event) => editingVisit ? setEditingVisit({ ...editingVisit, visitDate: event.target.value }) : setVisit({ ...visit, visitDate: event.target.value })} required /></label>
        <label>Reason<input value={editingVisit ? editingVisit.reason : visit.reason} onChange={(event) => editingVisit ? setEditingVisit({ ...editingVisit, reason: event.target.value }) : setVisit({ ...visit, reason: event.target.value })} required /></label>
        <label>Findings<textarea value={editingVisit ? editingVisit.findings || "" : visit.findings} onChange={(event) => editingVisit ? setEditingVisit({ ...editingVisit, findings: event.target.value }) : setVisit({ ...visit, findings: event.target.value })} /></label>
        <label>Treatment<textarea value={editingVisit ? editingVisit.treatment || "" : visit.treatment} onChange={(event) => editingVisit ? setEditingVisit({ ...editingVisit, treatment: event.target.value }) : setVisit({ ...visit, treatment: event.target.value })} /></label>
        <label>Next visit<input type="date" value={editingVisit?.nextVisit ? editingVisit.nextVisit.slice(0, 10) : visit.nextVisit} onChange={(event) => editingVisit ? setEditingVisit({ ...editingVisit, nextVisit: event.target.value }) : setVisit({ ...visit, nextVisit: event.target.value })} /></label>
        <button className="btn btn-primary">{editingVisit ? "Save visit changes" : "Record visit"}</button>{editingVisit ? <button type="button" className="btn" onClick={() => setEditingVisit(null)}>Cancel edit</button> : null}
      </form><table><thead><tr><th>Date</th><th>Reason</th><th>Findings</th><th>Treatment</th><th>Next visit</th><th>Recorded by</th><th>Action</th></tr></thead><tbody>
        {selected.visits.map((row) => <tr key={row.id}><td>{fmtDate(row.visitDate)}</td><td>{row.reason}</td><td>{row.findings || "-"}</td><td>{row.treatment || "-"}</td><td>{fmtDate(row.nextVisit)}</td><td>{row.recordedBy?.fullName || "-"}</td><td><span className="row-actions"><button className="btn btn-sm" onClick={() => setEditingVisit({ ...row, visitDate: row.visitDate.slice(0, 10), nextVisit: row.nextVisit ? row.nextVisit.slice(0, 10) : "" })}>Edit</button>{isAdministratorRole(role) ? <button className="btn btn-sm" onClick={() => remove(`/api/child-visits/${row.id}`, "child visit")}>Delete</button> : null}</span></td></tr>)}
        {selected.visits.length === 0 ? <tr><td colSpan="7" className="muted">No visits recorded.</td></tr> : null}
      </tbody></table></div>
    </> : <p className="muted">Select a child to manage healthcare records.</p>}

    {editingRecord ? <div className="panel"><h2>Edit {editingRecord.recordType} record</h2><form className="grid-form" onSubmit={saveRecord}>
      {editingRecord.recordType === "immunization" ? <><label>Vaccine and dose<select value={editingRecord.vaccineName === "Other" ? "Other" : editingRecord.vaccineName ? `${editingRecord.vaccineName}|${editingRecord.dose}` : ""} onChange={(event) => selectEditedDose(event.target.value)}><option value="">Select scheduled dose</option>{IMMUNIZATION_SCHEDULE.map((dose) => <option key={`${dose.vaccineName}|${dose.dose}`} value={`${dose.vaccineName}|${dose.dose}`}>{dose.vaccineName}, {dose.dose}</option>)}<option value="Other">Other</option></select></label>{editingRecord.vaccineName === "Other" ? <><label>Other vaccine<input value={editingRecord.otherVaccineName || ""} onChange={(event) => setEditingRecord({ ...editingRecord, otherVaccineName: event.target.value })} required /></label><label>Other dose<input value={editingRecord.otherDose || ""} onChange={(event) => setEditingRecord({ ...editingRecord, otherDose: event.target.value })} required /></label></> : null}<label>Date given<input type="date" value={editingRecord.dateGiven} onChange={(event) => setEditingRecord({ ...editingRecord, dateGiven: event.target.value })} /></label><label>Next due<input type="date" value={editingRecord.nextDueDate} onChange={(event) => setEditingRecord({ ...editingRecord, nextDueDate: event.target.value })} /></label><label>Remarks<input value={editingRecord.remarks || ""} onChange={(event) => setEditingRecord({ ...editingRecord, remarks: event.target.value })} /></label></> : <><label>Date<input type="date" value={editingRecord.measurementDate} onChange={(event) => setEditingRecord({ ...editingRecord, measurementDate: event.target.value })} /></label><label>Weight<input type="number" step="0.1" value={editingRecord.weight} onChange={(event) => setEditingRecord({ ...editingRecord, weight: event.target.value })} /></label><label>Height<input type="number" step="0.1" value={editingRecord.height} onChange={(event) => setEditingRecord({ ...editingRecord, height: event.target.value })} /></label><label>Head circumference<input type="number" step="0.1" value={editingRecord.headCircumference} onChange={(event) => setEditingRecord({ ...editingRecord, headCircumference: event.target.value })} /></label><label>Observation<textarea value={editingRecord.observation || ""} onChange={(event) => setEditingRecord({ ...editingRecord, observation: event.target.value })} /></label></>}
      <button className="btn btn-primary">Save record</button><button type="button" className="btn" onClick={() => setEditingRecord(null)}>Cancel</button>
    </form></div> : null}
  </div>;
}
