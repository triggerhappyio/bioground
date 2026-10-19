import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);
const STAFF_ROLES = ["STAFF", "ADMIN"];

// First of two independent gates for /admin (Next.js 16 names this file
// proxy.ts, formerly middleware.ts). It only reads the JWT on the Edge; the
// (dashboard) layout and every Server Action re-check on the Node runtime.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin") || pathname === "/admin/login") return;
  const role = (req.auth?.user as { role?: string } | undefined)?.role;
  if (!req.auth || !role || !STAFF_ROLES.includes(role)) {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
});

export const config = {
  matcher: ["/admin/:path*"]
};
