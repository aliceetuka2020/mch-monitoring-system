"use client";
import { useEffect } from "react";
export default function ActivityTracker() {
  useEffect(() => { let last = 0; const ping = () => { const now = Date.now(); if (now - last > 60000) { last = now; fetch("/api/auth/activity", { method: "POST" }).catch(() => {}); } }; window.addEventListener("click", ping); window.addEventListener("keydown", ping); window.addEventListener("mousemove", ping); const timer = setInterval(ping, 60000); return () => { clearInterval(timer); window.removeEventListener("click", ping); window.removeEventListener("keydown", ping); window.removeEventListener("mousemove", ping); }; }, []);
  return null;
}
