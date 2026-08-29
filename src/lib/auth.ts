import { cookies } from "next/headers";
import { signSession, verifySession } from "./jwt";

export const ADMIN_COOKIE = "admin_token";
export const CLIENT_COOKIE = "client_token";
export const MASTER_COOKIE = "master_token";

export type AdminSession = { sub: string; role: "admin"; email: string; name: string };
export type ClientSession = { sub: string; role: "client"; phone: string };
export type MasterSession = { sub: string; role: "master"; phone: string; name: string };
// Either kind of staff session — used by endpoints the calendar shares
// between admins and masters, where permissions differ but access is shared.
export type StaffSession = AdminSession | MasterSession;

export async function setAdminSession(admin: { id: string; email: string; name: string }) {
  const token = await signSession({ sub: admin.id, role: "admin", email: admin.email, name: admin.name });
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function setClientSession(client: { id: string; phone: string }) {
  const token = await signSession({ sub: client.id, role: "client", phone: client.phone });
  cookies().set(CLIENT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function setMasterSession(master: { id: string; phone: string; name: string }) {
  const token = await signSession({ sub: master.id, role: "master", phone: master.phone, name: master.name });
  cookies().set(MASTER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession<AdminSession>(token);
  return session?.role === "admin" ? session : null;
}

export async function getClientSession(): Promise<ClientSession | null> {
  const token = cookies().get(CLIENT_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession<ClientSession>(token);
  return session?.role === "client" ? session : null;
}

export async function getMasterSession(): Promise<MasterSession | null> {
  const token = cookies().get(MASTER_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession<MasterSession>(token);
  return session?.role === "master" ? session : null;
}

// Admin or master — whichever is present. Admin takes priority if somehow
// both cookies are set on the same browser.
export async function getStaffSession(): Promise<StaffSession | null> {
  return (await getAdminSession()) ?? (await getMasterSession());
}

export function clearSession(name: string) {
  cookies().set(name, "", { path: "/", maxAge: 0 });
}
