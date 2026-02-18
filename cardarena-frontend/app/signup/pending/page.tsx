"use client";

import Link from "next/link";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

export default function SignupPendingPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function resendVerification() {
    if (!email.trim()) {
      setMessage("Enter your email to resend verification.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      const response = await fetch(`${API_BASE}/api/v1/auth/resend-admin-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Unable to resend verification right now.");
      }

      setMessage(body.message || "If your account requires admin email verification, a fresh link has been sent.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to resend verification right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(130deg,#091b2f,#0f2d3f,#142b26)] px-6 py-20 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/20 bg-black/35 p-10 backdrop-blur-xl">
        <h1 className="text-4xl font-extrabold">Thank You for Signing Up!</h1>
        <p className="mt-5 text-lg leading-relaxed text-gray-200">
          We are excited that you want to be one of the first to show off your competitive Spades skills.
        </p>
        <p className="mt-4 leading-relaxed text-gray-300">
          CardArena is currently in beta testing mode and sign-up is limited during this phase.
          An admin is reviewing your request and will get you started shortly.
        </p>
        <p className="mt-6 text-sm text-emerald-300">
          You can close this page for now. We will approve or waitlist your access based on beta capacity.
        </p>

        <section className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-4">
          <h2 className="text-sm font-semibold">Need another admin verification email?</h2>
          <p className="mt-1 text-xs text-white/70">
            For `@thecardarena.com` signups, enter your email below and resend the verification link.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@thecardarena.com"
              className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/20"
            />
            <button
              onClick={resendVerification}
              disabled={loading}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-70"
            >
              {loading ? "Sending..." : "Resend"}
            </button>
          </div>
          {message && <p className="mt-2 text-xs text-emerald-300">{message}</p>}
        </section>

        <div className="mt-8">
          <Link href="/" className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/20">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
