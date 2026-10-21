"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import Pagination from "@/components/Pagination";

const emptyForm = { fullName: "", phone: "", address: "", dateOfBirth: "", bloodGroup: "", genotype: "", nextOfKin: "", previousPregnancies: "", pregnancyHistory: "", medicalHistory: "", riskFactors: "", pregnancyInformation: "", clinicalObservations: "", followUpInformation: "", gestationalAgeAtRegistration: "" };

export default function PatientsPage() {
  const [patients, setPatients] = useState([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  async function load(q, page = 1) {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (q) params.set("q", q);
    const res = await fetch(`/api/patients?${params}`);
    const data = await res.json();
    setPatients(data.patients || []);
    setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
  }

  useEffect(() => { load(""); }, []);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not register mother");
      return;
    }
    setMessage(`${data.patient.fullName} registered with card number ${data.patient.cardNo}`);
    setForm(emptyForm);
    setShowForm(false);
    load("", 1);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Mothers</h1>
          <p className="muted small">Register mothers and manage their maternal health records.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Close form" : "Register mother"}
        </button>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {showForm ? (
        <div className="panel">
          <h2>New mother registration</h2>
          <form className="grid-form" onSubmit={submit}>
            <label>Full name<input value={form.fullName} onChange={(e) => update("fullName", e.target.value)} required /></label>
            <label>Phone<input value={form.phone} onChange={(e) => update("phone", e.target.value)} required /></label>
            <label>Address<input value={form.address} onChange={(e) => update("address", e.target.value)} /></label>
            <label>Date of birth<input type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} /></label>
            <label>Blood group<input value={form.bloodGroup} onChange={(e) => update("bloodGroup", e.target.value)} placeholder="O+" /></label>
            <label>Genotype<input value={form.genotype} onChange={(e) => update("genotype", e.target.value)} placeholder="AA" /></label>
            <label>Next of kin<input value={form.nextOfKin} onChange={(e) => update("nextOfKin", e.target.value)} /></label>
            <label>Previous pregnancies<textarea rows="2" value={form.previousPregnancies} onChange={(e) => update("previousPregnancies", e.target.value)} /></label>
            <label>Pregnancy history<textarea rows="2" value={form.pregnancyHistory} onChange={(e) => update("pregnancyHistory", e.target.value)} /></label>
            <label>Current pregnancy information<textarea rows="2" value={form.pregnancyInformation} onChange={(e) => update("pregnancyInformation", e.target.value)} /></label>
            <label>Clinical observations<textarea rows="2" value={form.clinicalObservations} onChange={(e) => update("clinicalObservations", e.target.value)} /></label>
            <label>Follow-up information<textarea rows="2" value={form.followUpInformation} onChange={(e) => update("followUpInformation", e.target.value)} /></label>
            <label>Medical history<textarea rows="2" value={form.medicalHistory} onChange={(e) => update("medicalHistory", e.target.value)} /></label>
            <label>Risk factors<textarea rows="2" value={form.riskFactors} onChange={(e) => update("riskFactors", e.target.value)} /></label>
            <button className="btn btn-primary" type="submit">Save</button>
          </form>
        </div>
      ) : null}

      <div className="panel">
        <form className="search-row" onSubmit={(e) => { e.preventDefault(); load(query, 1); }}>
          <input placeholder="Search by name, card number or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn" type="submit">Search</button>
          {query ? <button className="btn" type="button" onClick={() => { setQuery(""); load("", 1); }}>Clear</button> : null}
        </form>
        <table>
          <thead><tr><th>Card No</th><th>Full name</th><th>Phone</th><th>Address</th><th>ANC visits</th><th>Children</th><th>Registered</th></tr></thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/patients/${p.id}`}>{p.cardNo}</Link></td>
                <td><Link href={`/patients/${p.id}`}>{p.fullName}</Link></td>
                <td>{p.phone}</td>
                <td>{p.address}</td>
                <td>{p._count.ancRecords}</td>
                <td>{p._count.children}</td>
                <td>{fmtDate(p.registrationDate)}</td>
              </tr>
            ))}
            {patients.length === 0 ? <tr><td colSpan="7" className="muted">No mothers found.</td></tr> : null}
          </tbody>
        </table>
        <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={(page) => load(query, page)} />
      </div>
    </div>
  );
}
