import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut, STAFF_ROLES } from "@/lib/auth";
import { emailAlertStatus } from "@/lib/notify-health";

// Second, server-side gate (proxy.ts is the first): runs on every admin
// request with a real session check, so it holds even if proxy config drifts.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !role || !STAFF_ROLES.includes(role)) {
    redirect("/admin/login");
  }
  const alerts = emailAlertStatus();

  return (
    <div style={{ display: "flex", minHeight: "100vh", flexWrap: "wrap" }}>
      <aside style={{ width: 220, background: "var(--ink)", color: "var(--white)", padding: 24, flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 28 }}>足 BioGround</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Link href="/admin/bookings" style={{ color: "rgba(255,255,255,.9)", padding: "8px 10px", borderRadius: 4, fontSize: 14, textDecoration: "none" }}>
            Bookings
          </Link>
          <a href="/" target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,.7)", padding: "8px 10px", fontSize: 14, textDecoration: "none" }}>
            Landing page ↗
          </a>
        </nav>
        <div style={{ marginTop: 36, fontSize: 12, opacity: 0.7 }}>
          {session.user.email}
          <br />
          {role}
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/admin/login" });
          }}
          style={{ marginTop: 12 }}
        >
          <button type="submit" className="btn" style={{ color: "var(--white)", borderColor: "rgba(255,255,255,.5)", fontSize: 12, padding: "4px 10px" }}>
            Sign out
          </button>
        </form>
      </aside>
      <div style={{ flex: 1, background: "var(--white)", minWidth: 0 }}>
        {!alerts.active && (
          <div
            role="status"
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              margin: "16px 24px 0",
              padding: "10px 14px",
              borderRadius: 6,
              border: "1px solid #E6C27A",
              background: "#FFF7E6",
              color: "#5C4300",
              fontSize: 13,
              lineHeight: 1.5
            }}
          >
            <span aria-hidden="true">⚠</span>
            <span>
              <b>New-booking email alerts are off.</b> Bookings are still saving normally — check this page for new ones.
              {role === "ADMIN" && (
                <>
                  {" "}
                  To turn alerts on, set {alerts.missing.map((k, i) => (
                    <span key={k}>
                      {i > 0 ? ", " : ""}
                      <code>{k}</code>
                    </span>
                  ))}{" "}
                  in Vercel and redeploy.
                </>
              )}
            </span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
