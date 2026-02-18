"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

function VerifyAdminContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your admin email...");

  useEffect(() => {
    async function verify() {
      if (!token) {
        setStatus("error");
        setMessage("Missing verification token.");
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE}/api/v1/auth/verify-admin-email?token=${encodeURIComponent(token)}`
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body.error || "Verification failed");
        }

        setStatus("success");
        setMessage(body.message || "Admin email verified. You can now login.");
      } catch (err: unknown) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed");
      }
    }

    verify();
  }, [token]);

  return (
    <main className="min-h-screen bg-[linear-gradient(130deg,#091b2f,#0f2d3f,#142b26)] px-6 py-20 text-white">
      <div className="mx-auto max-w-2xl rounded-3xl border border-white/20 bg-black/35 p-10 backdrop-blur-xl">
        <h1 className="text-3xl font-extrabold">Admin Email Verification</h1>
        <p
          className={`mt-5 text-sm ${
            status === "success" ? "text-emerald-300" : status === "error" ? "text-red-300" : "text-white/80"
          }`}
        >
          {message}
        </p>

        <div className="mt-8 flex gap-3">
          <Link href="/login" className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black hover:bg-emerald-400">
            Go to Login
          </Link>
          <Link href="/" className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/20">
            Back Home
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function VerifyAdminPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[linear-gradient(130deg,#091b2f,#0f2d3f,#142b26)] px-6 py-20 text-white">
          <div className="mx-auto max-w-2xl rounded-3xl border border-white/20 bg-black/35 p-10 backdrop-blur-xl">
            <h1 className="text-3xl font-extrabold">Admin Email Verification</h1>
            <p className="mt-5 text-sm text-white/80">Preparing verification...</p>
          </div>
        </main>
      }
    >
      <VerifyAdminContent />
    </Suspense>
  );
}
