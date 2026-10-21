"use client";
import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import Pagination from "@/components/Pagination";
import { RBAC_ROLES } from "@/lib/rbac";
const emptyUser = { fullName: "", email: "", password: "", role: "HEALTH_WORKER" };
const roleOptions = [{ id: "HEALTH_WORKER", name: "Legacy health worker" }, { id: "ADMIN", name: "Legacy administrator" }, ...RBAC_ROLES.map((role) => ({ id: role.id, name: role.name }))];
function passwordIsValid(password) { return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password); }
export default function UsersClient() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyUser);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  async function load(page = 1) { const response = await fetch(`/api/users?page=${page}&pageSize=25`); const data = await response.json(); setUsers(data.users || []); setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 }); }
  useEffect(() => { load(1); }, []);
  async function submit(event) {
    event.preventDefault(); setError(""); setFeedback("");
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not create user"); return; }
    setFeedback("User account created"); setForm(emptyUser); await load(1);
  }
  async function updateAccess(user, patch) {
    const response = await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Could not update account"); return; }
    await load(pagination.page);
  }
  async function resetPassword(user) {
    const password = window.prompt("Enter a password with at least eight characters, including one letter and one number");
    if (!password) return;
    if (!passwordIsValid(password)) { setError("Password must have at least eight characters, including one letter and one number"); return; }
    await updateAccess(user, { password });
  }
  return <div>
    <div className="page-head"><div><h1>Users</h1><p className="muted small">Create accounts and manage access for health workers.</p></div></div>
    {feedback ? <p className="success">{feedback}</p> : null}{error ? <p className="error">{error}</p> : null}
    <div className="panel"><h2>New user account</h2><form className="grid-form" onSubmit={submit}>
      <label>Full name<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></label>
      <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
      <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength="8" pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}" title="Use at least eight characters with a letter and a number" required /></label>
      <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roleOptions.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
      <button className="btn btn-primary" type="submit">Create account</button>
    </form></div>
    <div className="panel"><h2>System users</h2><table><thead><tr><th>Full name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Change role</th><th>Action</th></tr></thead><tbody>
      {users.map((user) => <tr key={user.id}><td>{user.fullName}</td><td>{user.email}</td><td>{roleOptions.find((role) => role.id === user.role)?.name || user.role}</td><td><span className={`badge ${user.active ? "badge-green" : "badge-gray"}`}>{user.active ? "Active" : "Disabled"}</span></td><td>{fmtDate(user.createdAt)}</td><td><select value={user.role} onChange={(event) => updateAccess(user, { role: event.target.value })}>{roleOptions.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></td><td><button className="btn btn-sm" onClick={() => resetPassword(user)}>Reset password</button><button className="btn btn-sm" onClick={() => updateAccess(user, { active: !user.active })}>{user.active ? "Deactivate" : "Activate"}</button></td></tr>)}
      {users.length === 0 ? <tr><td colSpan="7" className="muted">No users found.</td></tr> : null}
    </tbody></table><Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={load} /></div>
  </div>;
}
