import type { NextAuthConfig } from "next-auth";

// Edge-safe subset of the auth config — no providers, no Prisma, no bcrypt.
// proxy.ts runs on the Edge runtime and uses this only to read the session
// JWT and gate /admin. The Credentials provider lives in lib/auth.ts.
export const authConfig: NextAuthConfig = {
  pages: { signIn: "/admin/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.uid = user.id as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: unknown }).id = token.uid;
        (session.user as { role?: unknown }).role = token.role;
      }
      return session;
    }
  }
};
