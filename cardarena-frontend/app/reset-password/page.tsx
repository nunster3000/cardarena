"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

function ResetPasswordContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const checks = {
    hasLength: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
  const passwordValid = Object.values(checks).every(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    if (!token) {
      setError("Missing reset token.");
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to reset password.");
      }
      setMessage(body.message || "Password reset successfully.");
      setPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(125deg,#091b2f,#0f2d3f,#142b26)] px-6 text-white flex items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/20 bg-black/35 p-8 backdrop-blur-xl shadow-2xl">
        <h1 className="text-3xl font-bold">Reset Password</h1>
        <p className="mt-2 text-sm text-white/70">Set a new secure password.</p>

        <label className="mt-6 block text-sm text-white/70">New Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-xl bg-white/10 px-4 py-3 outline-none ring-1 ring-white/20"
        />

        <div className="mt-3 rounded-xl border border-white/20 bg-white/5 p-3 text-xs">
          <p className={checks.hasLength ? "text-emerald-300" : "text-white/70"}>{checks.hasLength ? "✓" : "○"} At least 8 characters</p>
          <p className={checks.hasLetter ? "text-emerald-300" : "text-white/70"}>{checks.hasLetter ? "✓" : "○"} At least 1 letter</p>
          <p className={checks.hasNumber ? "text-emerald-300" : "text-white/70"}>{checks.hasNumber ? "✓" : "○"} At least 1 number</p>
          <p className={checks.hasSpecial ? "text-emerald-300" : "text-white/70"}>{checks.hasSpecial ? "✓" : "○"} At least 1 special character</p>
        </div>

        <label className="mt-4 block text-sm text-white/70">Confirm Password</label>
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1 w-full rounded-xl bg-white/10 px-4 py-3 outline-none ring-1 ring-white/20"
        />

        <button
          disabled={loading || !passwordValid}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-blue-300 py-3 font-semibold text-slate-900 transition-all duration-300 hover:from-fuchsia-300 hover:via-cyan-300 hover:to-emerald-300 disabled:opacity-70"
        >
          {loading ? "Updating..." : "Update Password"}
        </button>

        {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        <p className="mt-5 text-xs text-gray-300"><Link href="/login" className="font-semibold text-emerald-300">Back to Login</Link></p>
      </form>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[linear-gradient(125deg,#091b2f,#0f2d3f,#142b26)]" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
