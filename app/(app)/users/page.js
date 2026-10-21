import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isAdministratorRole } from "@/lib/rbac";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const session = await getSession();
  if (!session || !isAdministratorRole(session.role)) redirect("/dashboard");
  return <UsersClient />;
}
