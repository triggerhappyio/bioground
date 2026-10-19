import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { assertRateLimiterConfigured, clientIpFrom } from "@/lib/rate-limit";
import {
  clearLoginFailures,
  LOGIN_RATE_LIMITED_CODE,
  loginBlocked,
  normalizeEmail,
  recordLoginFailure
} from "@/lib/login-guard";

/** Auth.js puts `code` in the sign-in response; the login page reads it. */
class LoginRateLimited extends CredentialsSignin {
  code = LOGIN_RATE_LIMITED_CODE;
}

// Staff sign-in: email + password against StaffUser (bcrypt), JWT sessions.
// Deactivated staff (active = false) cannot sign in. Failed attempts are
// rate-limited (lib/login-guard.ts): 5 per IP + email, 30 per IP, per 15 min.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 }, // one working day
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, request) {
        assertRateLimiterConfigured();
        const email = normalizeEmail(credentials?.email);
        const password = String(credentials?.password ?? "");
        const ip = clientIpFrom(request);
        if ((await loginBlocked(ip, email)).blocked) throw new LoginRateLimited();
        if (!email || !password) return null;
        const user = await prisma.staffUser.findUnique({ where: { email } });
        const ok = !!user && user.active && (await bcrypt.compare(password, user.passwordHash));
        if (!ok || !user) {
          await recordLoginFailure(ip, email);
          return null;
        }
        await clearLoginFailures(ip, email);
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      }
    })
  ]
});

export const STAFF_ROLES: string[] = ["STAFF", "ADMIN"];
