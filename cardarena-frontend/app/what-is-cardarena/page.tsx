import Link from "next/link";

export default function WhatIsCardArenaPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#091221] px-6 py-16 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.14),transparent_45%),radial-gradient(circle_at_80%_40%,rgba(59,130,246,0.16),transparent_45%)]" />

      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-white/15 bg-black/30 p-8 backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.18em] text-emerald-300">Platform Overview</p>
          <h1 className="mt-3 text-4xl font-extrabold md:text-5xl">What Is CardArena?</h1>
          <p className="mt-4 max-w-3xl text-gray-300">
            CardArena is a competition-first Spades platform where players build reputation through consistent play,
            team chemistry, and strategic decision-making. It is free to sign up and built for serious competitors.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/signup" className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-black hover:bg-emerald-400">Sign Up Free</a>
            <a href="/login" className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-semibold hover:bg-white/20">Login</a>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            ["Gameplay", "Queue into competitive Spades tables, track your outcomes, and adjust your strategy over time."],
            ["Social Layer", "Add friends, curate top friends, and quickly find trusted teammates that fit your style."],
            ["Player Control", "Use one dashboard to manage profile, wallet actions, and tournament participation."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-white/15 bg-black/30 p-5">
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">{body}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-white/15 bg-black/30 p-5">
            <h3 className="text-lg font-bold">Dashboard Preview</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                "Live online player count",
                "Top-friends quick panel",
                "Recent ledger and actions",
                "Tournament table browser",
              ].map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-gray-200">
                  {item}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-2xl border border-white/15 bg-black/30 p-5">
            <h3 className="text-lg font-bold">Competitive Snapshot (Demo)</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                ["42,180", "Matches Logged"],
                ["8,920", "Active Players"],
                ["67%", "Team Requeue Rate"],
                ["31 min", "Avg Session"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-center">
                  <p className="text-2xl font-extrabold text-emerald-300">{value}</p>
                  <p className="text-xs uppercase tracking-[0.12em] text-gray-300">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-400">Illustrative pre-launch metrics for competitive positioning.</p>
          </article>
        </section>

        <footer className="mt-8 text-center text-sm text-gray-400">
          <Link className="hover:text-white" href="/">Back to Home</Link>
        </footer>
      </div>
    </main>
  );
}
