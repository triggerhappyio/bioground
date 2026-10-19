import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

// Staff sign-in: email + password against StaffUser (bcrypt), JWT sessions.
// Deactivated staff (active = false) cannot sign in.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 }, // one working day
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await prisma.staffUser.findUnique({ where: { email } });
        if (!user || !user.active) return null;
        if (!(await bcrypt.compare(password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      }
    })
  ]
});

export const STAFF_ROLES: string[] = ["STAFF", "ADMIN"];
