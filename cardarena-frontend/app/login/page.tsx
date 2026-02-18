"use client";

import { Space_Grotesk } from "next/font/google";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveSession } from "../../lib/session";

const space = Space_Grotesk({ subsets: ["latin"] });
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Invalid credentials");
      }

      const role = String(body.user?.role || "USER");
      saveSession(body.token, role);

      if (role === "ADMIN") {
        router.replace("/admin");
      } else {
        router.replace("/dashboard");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function resendVerificationLink() {
    if (!resendEmail.trim()) {
      setResendMessage("Enter your email to resend the verification link.");
      return;
    }
    try {
      setResendLoading(true);
      setResendMessage("");
      const response = await fetch(`${API_BASE}/api/v1/auth/resend-admin-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to resend verification email.");
      }
      setResendMessage(body.message || "If applicable, a new verification email link has been sent.");
    } catch (err: unknown) {
      setResendMessage(err instanceof Error ? err.message : "Unable to resend verification email.");
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <main className={`${space.className} min-h-screen bg-[linear-gradient(125deg,#091b2f,#0f2d3f,#142b26)] text-white flex items-center justify-center px-6`}>
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md rounded-3xl border border-white/20 bg-black/35 p-8 backdrop-blur-xl shadow-2xl"
      >
        <h1 className="text-3xl font-bold">Welcome Back</h1>
        <p className="mt-2 text-sm text-white/70">
          One login for players and admins.
        </p>
        <p className="mt-1 text-xs text-emerald-300">
          New here? Sign up free.
        </p>

        <label className="mt-6 block text-sm text-white/70">Email</label>
        <input
          className="mt-1 w-full rounded-xl bg-white/10 px-4 py-3 outline-none ring-1 ring-white/20 focus:ring-emerald-400"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="mt-4 block text-sm text-white/70">Password</label>
        <input
          type="password"
          className="mt-1 w-full rounded-xl bg-white/10 px-4 py-3 outline-none ring-1 ring-white/20 focus:ring-emerald-400"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-blue-300 py-3 font-semibold text-slate-900 shadow-lg shadow-cyan-500/20 transition-all duration-300 hover:scale-[1.01] hover:from-fuchsia-300 hover:via-cyan-300 hover:to-emerald-300"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
        {error.toLowerCase().includes("verify") && (
          <div className="mt-4 rounded-xl border border-white/20 bg-white/5 p-3">
            <p className="text-xs text-white/75">
              Didn&apos;t get the verification email link yet?
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="you@thecardarena.com"
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-xs outline-none ring-1 ring-white/20"
              />
              <button
                type="button"
                onClick={resendVerificationLink}
                disabled={resendLoading}
                className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-70"
              >
                {resendLoading ? "Sending..." : "Resend Email"}
              </button>
            </div>
            {resendMessage && <p className="mt-2 text-xs text-emerald-300">{resendMessage}</p>}
          </div>
        )}
        <p className="mt-5 text-xs text-gray-300">
          Need an account?{" "}
          <a href="/signup" className="font-semibold text-emerald-300 hover:text-emerald-200">
            Create one free
          </a>
        </p>
      </form>
    </main>
  );
}
