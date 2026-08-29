import { redirect } from "next/navigation";

// Login is now unified — everyone goes through /login.
export default function AdminLoginPage() {
  redirect("/login");
}
