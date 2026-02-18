"use client";

import { Space_Grotesk } from "next/font/google";
import { useState } from "react";

const space = Space_Grotesk({ subsets: ["latin"] });
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const passwordChecks = {
    hasLength: password.length >= 8,
    hasLetter: /[A-Za-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
    notSameAsUsername:
      password.trim().toLowerCase() !== username.trim().toLowerCase(),
  };
  const passwordValid = Object.values(passwordChecks).every(Boolean);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setStatusMessage("");

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to create account");
      }

      setSubmitted(true);
      setStatusMessage(
        body.message ||
          "Signup request received. Check your email for next steps."
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (!email.trim()) {
      setError("Enter your email to resend the verification email link.");
      return;
    }

    try {
      setResending(true);
      setError("");
      const response = await fetch(`${API_BASE}/api/v1/auth/resend-admin-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to resend verification email.");
      }

      setStatusMessage(
        body.message || "If needed, a new verification email link has been sent."
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to resend verification email."
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <main className={`${space.className} min-h-screen bg-[linear-gradient(125deg,#091b2f,#0f2d3f,#142b26)] px-6 text-white`}>
      <div className="mx-auto flex min-h-screen max-w-5xl items-center gap-8 py-10">
        <section className="hidden flex-1 rounded-3xl border border-white/15 bg-black/30 p-8 backdrop-blur-xl lg:block">
          <h1 className="text-4xl font-extrabold">Join CardArena Free</h1>
          <p className="mt-4 text-sm text-gray-300">
            Build your profile, compete in Spades tables, grow your top-friends list,
            and level up your reputation. No entry fees required.
          </p>
          <div className="mt-6 space-y-3 text-sm text-gray-200">
            <p>• Instant account creation</p>
            <p>• Competitive skill-first matchmaking</p>
            <p>• Social dashboard with friends and online status</p>
          </div>
        </section>

        <form
          onSubmit={handleSignup}
          className="w-full max-w-md rounded-3xl border border-white/20 bg-black/35 p-8 backdrop-blur-xl shadow-2xl"
        >
          <h2 className="text-3xl font-bold">Create Your Account</h2>
          <p className="mt-2 text-sm text-emerald-300">Free signup in under 1 minute.</p>

          <label className="mt-6 block text-sm text-white/70">Username</label>
          <input
            className="mt-1 w-full rounded-xl bg-white/10 px-4 py-3 outline-none ring-1 ring-white/20 focus:ring-emerald-400"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          <label className="mt-4 block text-sm text-white/70">Email</label>
          <input
            className="mt-1 w-full rounded-xl bg-white/10 px-4 py-3 outline-none ring-1 ring-white/20 focus:ring-emerald-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
          />

          <label className="mt-4 block text-sm text-white/70">Password</label>
          <input
            type="password"
            className="mt-1 w-full rounded-xl bg-white/10 px-4 py-3 outline-none ring-1 ring-white/20 focus:ring-emerald-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <div className="mt-3 rounded-xl border border-white/20 bg-white/5 p-3 text-xs">
            <p className="mb-2 text-white/80">Password requirements</p>
            <p className={passwordChecks.hasLength ? "text-emerald-300" : "text-white/70"}>{passwordChecks.hasLength ? "✓" : "○"} At least 8 characters</p>
            <p className={passwordChecks.hasLetter ? "text-emerald-300" : "text-white/70"}>{passwordChecks.hasLetter ? "✓" : "○"} At least 1 letter</p>
            <p className={passwordChecks.hasNumber ? "text-emerald-300" : "text-white/70"}>{passwordChecks.hasNumber ? "✓" : "○"} At least 1 number</p>
            <p className={passwordChecks.hasSpecial ? "text-emerald-300" : "text-white/70"}>{passwordChecks.hasSpecial ? "✓" : "○"} At least 1 special character</p>
            <p className={passwordChecks.notSameAsUsername ? "text-emerald-300" : "text-white/70"}>{passwordChecks.notSameAsUsername ? "✓" : "○"} Cannot match username</p>
          </div>

          <button
            disabled={loading || !passwordValid}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-blue-300 py-3 font-semibold text-slate-900 shadow-lg shadow-cyan-500/20 transition-all duration-300 hover:scale-[1.01] hover:from-fuchsia-300 hover:via-cyan-300 hover:to-emerald-300"
          >
            {loading ? "Creating account..." : "Sign Up Free"}
          </button>

          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          {statusMessage && <p className="mt-4 text-sm text-emerald-300">{statusMessage}</p>}

          {submitted && (
            <div className="mt-5 rounded-xl border border-white/20 bg-white/5 p-4">
              <p className="text-sm text-white/80">Didn&apos;t get the verification email link yet?</p>
              <button
                type="button"
                onClick={resendCode}
                disabled={resending}
                className="mt-2 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-70"
              >
                {resending ? "Sending..." : "Resend Email"}
              </button>
            </div>
          )}

          <p className="mt-6 text-xs text-gray-300">
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-emerald-300 hover:text-emerald-200">
              Login
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}
