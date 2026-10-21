"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import Pagination from "@/components/Pagination";
import { isAdministratorRole } from "@/lib/rbac";
const statusLabel = { PENDING: "Pending", SENT: "Sent", COMPLETED: "Completed", DISMISSED: "Dismissed" };
export default function NotificationsPage() {
  const [items, setItems] = useState([]); const [role, setRole] = useState("HEALTH_WORKER"); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  async function load(page = 1) { const response = await fetch(`/api/notifications?page=${page}&pageSize=25`); const data = await response.json(); setItems(data.notifications || []); setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 }); }
  useEffect(() => { load(1); fetch("/api/auth/me").then((response) => response.json()).then((data) => setRole(data.user?.role || "HEALTH_WORKER")); }, []);
  async function update(id, status) { const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); if (!response.ok) { const data = await response.json(); setError(data.error || "Could not update reminder"); return; } await load(pagination.page); }
  async function dispatch() { setError(""); setMessage(""); setBusy(true); const response = await fetch("/api/reminders/dispatch", { method: "POST" }); const data = await response.json(); setBusy(false); if (!response.ok) { setError(data.error || "Could not dispatch reminders"); return; } setMessage(data.skipped || `Dispatched ${data.sent} reminder(s).`); await load(1); }
  return <div><div className="page-head"><div><h1>Reminders</h1><p className="muted small">Review patient reminders, delivery status, and follow-up.</p></div>{isAdministratorRole(role) ? <button className="btn btn-primary" onClick={dispatch} disabled={busy}>{busy ? "Sending" : "Send now"}</button> : null}</div>
    {error ? <p className="error">{error}</p> : null}{message ? <p className="success">{message}</p> : null}
    <div className="panel"><table><thead><tr><th>Mother</th><th>Type</th><th>Message</th><th>Due date</th><th>Status</th><th>Sent at</th><th>Channel</th><th>Action</th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><td><Link href={`/patients/${item.patient.id}`}>{item.patient.fullName}</Link><div className="muted small">{item.patient.cardNo}</div></td><td>{item.type}</td><td>{item.message}</td><td>{fmtDate(item.dueDate)}</td><td>{statusLabel[item.status] || item.status}</td><td>{fmtDate(item.sentAt)}</td><td>{item.channel || "-"}</td><td><span className="row-actions">{["PENDING", "SENT"].includes(item.status) ? <><button className="btn btn-sm" onClick={() => update(item.id, "COMPLETED")}>Completed</button><button className="btn btn-sm" onClick={() => update(item.id, "DISMISSED")}>Dismiss</button></> : "-"}</span></td></tr>)}
      {items.length === 0 ? <tr><td colSpan="8" className="muted">No active reminders.</td></tr> : null}
    </tbody></table><Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={load} /></div></div>;
}
