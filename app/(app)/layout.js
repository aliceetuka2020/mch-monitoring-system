import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFacilityName } from "@/lib/settings";
import LogoutButton from "@/components/LogoutButton";
import ActivityTracker from "@/components/ActivityTracker";
import { permissionsForRole } from "@/lib/rbac";

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const facilityName = await getFacilityName();
  const nav = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/patients", label: "Mothers" },
    { href: "/children", label: "Children" },
    { href: "/appointments", label: "Appointments" },
    { href: "/reports", label: "Reports" },
    { href: "/notifications", label: "Reminders" },
    { href: "/settings", label: "Settings" },
  ];
  if (permissionsForRole(session.role).includes("users.view")) nav.push({ href: "/users", label: "Users" });
  return (
    <div className="shell"><ActivityTracker />
      <aside className="sidebar">
        <div><span className="brand-title">{facilityName}</span><span className="brand-sub">Maternal and Child Health</span></div>
        <nav>{nav.map((item) => <Link key={item.href} href={item.href} className="nav-link">{item.label}</Link>)}</nav>
        <div className="sidebar-footer"><span className="who">{session.name}</span><span className="role">{session.role}</span><LogoutButton /></div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
