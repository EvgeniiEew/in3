import { NextResponse } from "next/server";
import { clearSession, ADMIN_COOKIE } from "@/lib/auth";

// Submitted via a plain <form method="post">, so respond with a redirect
// (a full page navigation) rather than JSON.
export async function POST(req: Request) {
  clearSession(ADMIN_COOKIE);
  return NextResponse.redirect(new URL("/login", req.url));
}
