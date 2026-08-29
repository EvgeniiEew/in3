import { NextResponse } from "next/server";
import { clearSession, MASTER_COOKIE } from "@/lib/auth";

// Submitted via a plain <form method="post">, so respond with a redirect.
export async function POST(req: Request) {
  clearSession(MASTER_COOKIE);
  return NextResponse.redirect(new URL("/login", req.url));
}
