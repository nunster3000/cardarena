"use client";

import { Space_Grotesk } from "next/font/google";
import { useRouter } from "next/navigation";
import { useState } from "react";

const space = Space_Grotesk({ subsets: ["latin"] });
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

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

      router.push("/signup/pending");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Signup failed";
      setError(msg);
    } finally {
      setLoading(false);
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

          <button
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-emerald-500 py-3 font-semibold text-black hover:bg-emerald-400"
          >
            {loading ? "Creating account..." : "Sign Up Free"}
          </button>

          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          <p className="mt-6 text-xs text-gray-300">
            Already have an account? <a href="/login" className="font-semibold text-emerald-300 hover:text-emerald-200">Login</a>
          </p>
        </form>
      </div>
    </main>
  );
}
