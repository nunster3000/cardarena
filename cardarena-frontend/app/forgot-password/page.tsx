"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to process request.");
      }
      setMessage(body.message || "If an account exists, a reset email link has been sent.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to process request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(125deg,#091b2f,#0f2d3f,#142b26)] px-6 text-white flex items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/20 bg-black/35 p-8 backdrop-blur-xl shadow-2xl">
        <h1 className="text-3xl font-bold">Forgot Password</h1>
        <p className="mt-2 text-sm text-white/70">Enter your email and we&apos;ll send a password reset email link.</p>

        <label className="mt-6 block text-sm text-white/70">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-xl bg-white/10 px-4 py-3 outline-none ring-1 ring-white/20"
        />

        <button
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-blue-300 py-3 font-semibold text-slate-900 transition-all duration-300 hover:from-fuchsia-300 hover:via-cyan-300 hover:to-emerald-300"
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>

        {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        <p className="mt-5 text-xs text-gray-300"><Link href="/login" className="font-semibold text-emerald-300">Back to Login</Link></p>
      </form>
    </main>
  );
}
