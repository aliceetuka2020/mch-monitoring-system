"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/format";

const blank = { startDate: "", lastMenstrualPeriod: "", gravida: "", parity: "", status: "ONGOING", outcome: "" };

export default function PregnancyPanel({ patientId, pregnancies = [], onCreated }) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event) {
    event.preventDefault(); setError(""); setMessage("");
    const response = await fetch("/api/pregnancies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, patientId }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not register pregnancy"); return; }
    setMessage("Pregnancy registered"); setForm(blank); onCreated();
  }
  return <div className="panel"><h2>Pregnancy registration</h2>
    {error ? <p className="error">{error}</p> : null}{message ? <p className="success">{message}</p> : null}
    <form className="grid-form" onSubmit={submit}>
      <label>Pregnancy start date<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
      <label>Last menstrual period<input type="date" value={form.lastMenstrualPeriod} onChange={(event) => setForm({ ...form, lastMenstrualPeriod: event.target.value })} /></label>
      <label>Gravida<input type="number" min="0" max="20" value={form.gravida} onChange={(event) => setForm({ ...form, gravida: event.target.value })} /></label>
      <label>Parity<input type="number" min="0" max="20" value={form.parity} onChange={(event) => setForm({ ...form, parity: event.target.value })} /></label>
      <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="ONGOING">Ongoing</option><option value="COMPLETED">Completed</option><option value="LOSS">Pregnancy loss</option></select></label>
      <label>Outcome<input value={form.outcome} onChange={(event) => setForm({ ...form, outcome: event.target.value })} /></label>
      <button className="btn btn-primary">Register pregnancy</button>
    </form>
    <table><thead><tr><th>Start date</th><th>Last menstrual period</th><th>Estimated delivery date</th><th>Gravida</th><th>Parity</th><th>Status</th><th>Outcome</th></tr></thead><tbody>
      {pregnancies.map((row) => <tr key={row.id}><td>{fmtDate(row.startDate)}</td><td>{fmtDate(row.lastMenstrualPeriod)}</td><td>{fmtDate(row.estimatedDeliveryDate)}</td><td>{row.gravida ?? "-"}</td><td>{row.parity ?? "-"}</td><td>{row.status}</td><td>{row.outcome || "-"}</td></tr>)}
      {pregnancies.length === 0 ? <tr><td colSpan="7" className="muted">No pregnancy registered.</td></tr> : null}
    </tbody></table>
  </div>;
}
