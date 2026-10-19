"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/admin/bookings");
    router.refresh();
  };

  return (
    <main style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card" style={{ padding: 32, width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 13, color: "var(--steel)" }}>足 BioGround staff</div>
        <h1 style={{ fontSize: 24, margin: "4px 0 20px" }}>Sign in</h1>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input required type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: 12 }} />
          <input required type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: 12 }} />
          {error && <p role="alert" style={{ color: "#b3261e", fontSize: 14, margin: 0 }}>{error}</p>}
          <button className="btn btn-brass" disabled={loading} style={{ justifyContent: "center" }}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
