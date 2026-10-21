"use client";

import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import { isAdministratorRole } from "@/lib/rbac";

const deliveryEmpty = { deliveryDate: "", deliveryMode: "", outcome: "", facility: "", complications: "", notes: "" };
const postnatalEmpty = { visitDate: "", motherCondition: "", babyCondition: "", feeding: "", complications: "", notes: "", nextVisit: "" };

export default function CareManagementPanel({ patientId }) {
  const [deliveries, setDeliveries] = useState([]);
  const [postnatal, setPostnatal] = useState([]);
  const [delivery, setDelivery] = useState(deliveryEmpty);
  const [post, setPost] = useState(postnatalEmpty);
  const [editing, setEditing] = useState(null);
  const [role, setRole] = useState("HEALTH_WORKER");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [records, currentUser] = await Promise.all([fetch(`/api/care?patientId=${patientId}`).then((response) => response.json()), fetch("/api/auth/me").then((response) => response.json())]);
    setDeliveries(records.deliveries || []); setPostnatal(records.postnatal || []); setRole(currentUser.user?.role || "HEALTH_WORKER");
  }
  useEffect(() => { load(); }, [patientId]);

  async function create(kind, body, reset) {
    setError(""); setMessage("");
    const response = await fetch("/api/care", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, patientId, ...body }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not save care record"); return; }
    setMessage("Care record saved"); reset(); await load();
  }

  async function saveEdit(event) {
    event.preventDefault(); setError("");
    const response = await fetch(`/api/care/${editing.kind}/${editing.row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing.row) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not update care record"); return; }
    setEditing(null); setMessage("Care record updated"); await load();
  }

  async function remove(kind, row) {
    if (!window.confirm("Delete this care record?")) return;
    const response = await fetch(`/api/care/${kind}/${row.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not delete care record"); return; }
    setMessage("Care record deleted"); await load();
  }

  const editFields = editing?.kind === "delivery"
    ? [["deliveryDate", "Delivery date", "date"], ["deliveryMode", "Mode"], ["outcome", "Outcome"], ["facility", "Facility"], ["complications", "Complications", "textarea"], ["notes", "Notes", "textarea"]]
    : [["visitDate", "Visit date", "date"], ["motherCondition", "Mother condition", "textarea"], ["babyCondition", "Baby condition", "textarea"], ["feeding", "Feeding"], ["complications", "Complications", "textarea"], ["notes", "Notes", "textarea"], ["nextVisit", "Next visit", "date"]];

  return <div className="panel"><h2>Delivery and postnatal care</h2>
    {message ? <p className="success">{message}</p> : null}{error ? <p className="error">{error}</p> : null}
    {editing ? <form className="grid-form" onSubmit={saveEdit}><h3 className="span-2">Edit {editing.kind} record</h3>{editFields.map(([key, label, type]) => <label key={key}>{label}{type === "textarea" ? <textarea value={editing.row[key] || ""} onChange={(event) => setEditing({ ...editing, row: { ...editing.row, [key]: event.target.value } })} /> : <input type={type || "text"} value={editing.row[key] ? (type === "date" ? editing.row[key].slice(0, 10) : editing.row[key]) : ""} onChange={(event) => setEditing({ ...editing, row: { ...editing.row, [key]: event.target.value } })} />}</label>)}<button className="btn btn-primary">Save changes</button><button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button></form> : null}
    <h3>Delivery record</h3>
    <form className="grid-form" onSubmit={(event) => { event.preventDefault(); create("delivery", delivery, () => setDelivery(deliveryEmpty)); }}><label>Delivery date<input type="date" value={delivery.deliveryDate} onChange={(event) => setDelivery({ ...delivery, deliveryDate: event.target.value })} required /></label><label>Mode<input placeholder="Vaginal or caesarean" value={delivery.deliveryMode} onChange={(event) => setDelivery({ ...delivery, deliveryMode: event.target.value })} required /></label><label>Outcome<input placeholder="Live birth, stillbirth" value={delivery.outcome} onChange={(event) => setDelivery({ ...delivery, outcome: event.target.value })} required /></label><label>Facility<input value={delivery.facility} onChange={(event) => setDelivery({ ...delivery, facility: event.target.value })} /></label><label>Complications<textarea value={delivery.complications} onChange={(event) => setDelivery({ ...delivery, complications: event.target.value })} /></label><label>Notes<textarea value={delivery.notes} onChange={(event) => setDelivery({ ...delivery, notes: event.target.value })} /></label><button className="btn btn-primary">Save delivery</button></form>
    <table><thead><tr><th>Date</th><th>Mode</th><th>Outcome</th><th>Facility</th><th>Complications</th><th>Action</th></tr></thead><tbody>{deliveries.map((row) => <tr key={row.id}><td>{fmtDate(row.deliveryDate)}</td><td>{row.deliveryMode}</td><td>{row.outcome}</td><td>{row.facility || "-"}</td><td>{row.complications || "-"}</td><td><span className="row-actions"><button className="btn btn-sm" onClick={() => setEditing({ kind: "delivery", row: { ...row, deliveryDate: row.deliveryDate.slice(0, 10) } })}>Edit</button>{isAdministratorRole(role) ? <button className="btn btn-sm" onClick={() => remove("delivery", row)}>Delete</button> : null}</span></td></tr>)}</tbody></table>
    <h3>Postnatal visit</h3>
    <form className="grid-form" onSubmit={(event) => { event.preventDefault(); create("postnatal", post, () => setPost(postnatalEmpty)); }}><label>Visit date<input type="date" value={post.visitDate} onChange={(event) => setPost({ ...post, visitDate: event.target.value })} required /></label><label>Mother condition<textarea value={post.motherCondition} onChange={(event) => setPost({ ...post, motherCondition: event.target.value })} /></label><label>Baby condition<textarea value={post.babyCondition} onChange={(event) => setPost({ ...post, babyCondition: event.target.value })} /></label><label>Feeding<input value={post.feeding} onChange={(event) => setPost({ ...post, feeding: event.target.value })} /></label><label>Complications<textarea value={post.complications} onChange={(event) => setPost({ ...post, complications: event.target.value })} /></label><label>Next visit<input type="date" value={post.nextVisit} onChange={(event) => setPost({ ...post, nextVisit: event.target.value })} /></label><button className="btn btn-primary">Save postnatal visit</button></form>
    <table><thead><tr><th>Visit date</th><th>Mother</th><th>Baby</th><th>Feeding</th><th>Complications</th><th>Next visit</th><th>Action</th></tr></thead><tbody>{postnatal.map((row) => <tr key={row.id}><td>{fmtDate(row.visitDate)}</td><td>{row.motherCondition || "-"}</td><td>{row.babyCondition || "-"}</td><td>{row.feeding || "-"}</td><td>{row.complications || "-"}</td><td>{fmtDate(row.nextVisit)}</td><td><span className="row-actions"><button className="btn btn-sm" onClick={() => setEditing({ kind: "postnatal", row: { ...row, visitDate: row.visitDate.slice(0, 10), nextVisit: row.nextVisit ? row.nextVisit.slice(0, 10) : "" } })}>Edit</button>{isAdministratorRole(role) ? <button className="btn btn-sm" onClick={() => remove("postnatal", row)}>Delete</button> : null}</span></td></tr>)}</tbody></table>
  </div>;
}
