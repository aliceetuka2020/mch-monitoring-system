"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [facilityName, setFacilityName] = useState("Karu Primary Healthcare Centre");

  useEffect(() => {
    fetch("/api/facility").then((response) => response.json()).then((data) => {
      if (data.facilityName) setFacilityName(data.facilityName);
    }).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Login failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>{facilityName}</h1>
        <p className="muted small">Maternal and Child Healthcare Monitoring System</p>
        {error ? <p className="error">{error}</p> : null}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
