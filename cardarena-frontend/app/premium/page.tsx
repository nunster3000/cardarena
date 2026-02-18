import Link from "next/link";

export default function PremiumPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a1524] px-6 py-16 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(59,130,246,0.16),transparent_40%),radial-gradient(circle_at_82%_40%,rgba(16,185,129,0.14),transparent_45%)]" />

      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-white/15 bg-black/35 p-8 backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.18em] text-blue-300">CardArena Premium</p>
          <h1 className="mt-3 text-4xl font-extrabold">Support the Platform. Unlock More Competition Tools.</h1>
          <p className="mt-4 max-w-3xl text-gray-300">
            Premium is a subscription for players who want deeper competitive insights and priority features.
            Core gameplay remains available to all users.
          </p>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            ["Advanced Match Insights", "Expanded hand trends, partner synergy stats, and match-pattern breakdowns."],
            ["Priority Table Access", "Faster access to high-activity queues and new competitive formats."],
            ["Extended Profile Customization", "More avatar themes, profile cards, and player identity options."],
            ["Replay and Clip Library", "Save and review key hands to improve strategy and decision quality."],
            ["Captain Tools", "Create private squad lobbies and invite top friends into focused training sets."],
            ["Supporter Badge", "Visible premium supporter badge across profile, lobbies, and leaderboards."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-white/15 bg-black/30 p-5">
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">{body}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-5 text-sm text-gray-200">
          Premium pricing and launch dates are being finalized. You can still create a free account today
          and begin competing immediately.
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/signup" className="rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-black hover:bg-emerald-400">Sign Up Free</a>
          <a href="/what-is-cardarena" className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-semibold hover:bg-white/20">See Platform Overview</a>
          <Link href="/" className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-semibold hover:bg-white/20">Back Home</Link>
        </div>
      </div>
    </main>
  );
}
