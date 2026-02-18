"use client";

import { useState } from "react";

export default function Notify() {
  const [form, setForm] = useState({ name: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setSuccess(true);
      setForm({ name: "", email: "" });
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#0b1220] text-white flex items-center justify-center px-6">
      <div className="bg-black/40 backdrop-blur-md p-10 rounded-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold mb-6 text-center">
          Be First to Be Notified
        </h1>

        {success && (
          <p className="text-green-400 text-center mb-4">
            You&apos;re on the list. We&apos;ll notify you when tournaments launch.
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Your Name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="px-4 py-3 rounded-lg bg-white/10 border border-white/20 focus:outline-none"
          />

          <input
            type="email"
            placeholder="Your Email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="px-4 py-3 rounded-lg bg-white/10 border border-white/20 focus:outline-none"
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-4 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 transition font-semibold"
          >
            {loading ? "Submitting..." : "Notify Me"}
          </button>
        </form>
      </div>
    </main>
  );
}
