import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/jwt";
import { ADMIN_COOKIE, MASTER_COOKIE, CLIENT_COOKIE } from "@/lib/auth";

// Login is unified at /login — every role gets redirected there when their
// session is missing or invalid, /login itself decides where to send them
// back based on who they turn out to be.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = req.cookies.get(ADMIN_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session || session.role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/master") && pathname !== "/master/login") {
    const token = req.cookies.get(MASTER_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session || session.role !== "master") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/calendar") || pathname.startsWith("/cabinet")) {
    const token = req.cookies.get(CLIENT_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session || session.role !== "client") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/master/:path*", "/calendar/:path*", "/cabinet/:path*"],
};
