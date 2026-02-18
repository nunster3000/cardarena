import Link from "next/link";

export default function PremiumPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a1524] px-6 py-16 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(59,130,246,0.16),transparent_40%),radial-gradient(circle_at_82%_40%,rgba(16,185,129,0.14),transparent_45%)]" />

      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-white/15 bg-black/35 p-8 backdrop-blur-xl">
          <p className="text-sm uppercase tracking-[0.18em] text-blue-300">CardArena Premium</p>
          <h1 className="mt-3 text-4xl font-extrabold">Premium Competition Experience</h1>
          <p className="mt-4 max-w-3xl text-gray-300">
            Upgrade to unlock premium features, custom table experiences, and virtual coin gameplay.
            Core ranked competition stays free for everyone.
          </p>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-cyan-300/30 bg-black/35 p-6 md:col-span-1">
            <p className="text-xs uppercase tracking-[0.16em] text-cyan-300">Plan</p>
            <h2 className="mt-2 text-2xl font-bold">CardArena Premium</h2>
            <p className="mt-3 text-4xl font-extrabold">$9.99<span className="text-base font-medium text-white/70"> / month</span></p>
            <p className="mt-3 text-sm text-gray-300">Monthly subscription. Cancel any time.</p>
            <button className="mt-5 w-full rounded-xl bg-gradient-to-r from-cyan-300 via-emerald-300 to-blue-300 py-3 font-semibold text-slate-900 hover:from-fuchsia-300 hover:via-cyan-300 hover:to-emerald-300">
              Start Premium
            </button>
          </article>

          <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
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
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-6">
          <h3 className="text-2xl font-bold">Virtual Coins + Premium Tables</h3>
          <p className="mt-2 text-sm text-gray-200">
            Premium members can buy virtual chip coins and use them in virtual coin tables for a different gameplay loop.
            Use coins for platform advantages, custom cards, visual upgrades, and exclusive events.
          </p>
          <div className="mt-4 grid gap-3 text-sm text-gray-200 md:grid-cols-3">
            <div className="rounded-xl border border-white/15 bg-black/20 p-4">
              <p className="font-semibold">Use Coins To</p>
              <p className="mt-2 text-white/80">Enter virtual coin tables and premium challenge formats.</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-black/20 p-4">
              <p className="font-semibold">Buy In-Platform Perks</p>
              <p className="mt-2 text-white/80">Custom cards, profile flex items, and strategic advantage tools.</p>
            </div>
            <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-4">
              <p className="font-semibold">Important Rule</p>
              <p className="mt-2 text-white/80">Virtual coins are not redeemable for cash and have no cash value.</p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/15 bg-black/30 p-5 text-sm text-gray-200">
          Core free play remains available. Premium is an optional subscription designed for players who want deeper tools and a richer platform experience.
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
