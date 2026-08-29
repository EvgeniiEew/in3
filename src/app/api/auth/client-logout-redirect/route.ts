import { NextResponse } from "next/server";
import { clearSession, CLIENT_COOKIE } from "@/lib/auth";

// Submitted via a plain <form method="post"> from the calendar layout, so
// respond with a redirect (full navigation) rather than JSON — mirrors
// /api/admin/logout and /api/master/logout.
export async function POST(req: Request) {
  clearSession(CLIENT_COOKIE);
  return NextResponse.redirect(new URL("/", req.url));
}
