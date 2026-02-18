import Image from "next/image";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="absolute inset-0 -z-20">
        <Image src="/hero-bg.png" alt="CardArena Background" fill priority sizes="100vw" className="h-full w-full object-cover opacity-80" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#0b1220]/60 via-[#0f172a]/50 to-[#052e2b]/60" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.15),transparent_50%),radial-gradient(circle_at_70%_60%,rgba(59,130,246,0.15),transparent_50%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(120deg,rgba(255,255,255,0.05)_25%,transparent_50%,rgba(255,255,255,0.05)_75%)] bg-[length:200%_200%] animate-shimmer" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-8">
        <p className="text-lg font-semibold tracking-wide text-emerald-300">CardArena</p>
        <nav className="flex items-center gap-5 text-sm text-gray-200">
          <a href="/what-is-cardarena" className="hidden hover:text-white md:inline">What Is CardArena</a>
          <a href="/premium" className="hidden hover:text-white md:inline">Premium</a>
          <a href="/login" className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 hover:bg-white/20">Login</a>
          <a href="/signup" className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400">Sign Up Free</a>
        </nav>
      </header>

      <section className="flex flex-col items-center justify-center px-6 py-32 text-center md:py-36">
        <h1 className="bg-gradient-to-r from-emerald-400 via-blue-400 to-indigo-400 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent md:text-7xl">
          CardArena
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-gray-200 md:text-xl">
          Competitive Spades. Ranked Lobbies. Pure Bragging Rights.
        </p>

        <p className="mt-4 max-w-xl text-gray-300">
          Test your Spades IQ against serious players, build your reputation,
          and climb the competitive scene with your team.
        </p>

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <a
            href="/signup"
            className="rounded-2xl bg-emerald-500 px-10 py-4 text-lg font-semibold text-black transition-all duration-300 hover:bg-emerald-400"
          >
            Create Free Account
          </a>
          <a
            href="/login"
            className="rounded-2xl bg-blue-500 px-10 py-4 text-lg font-semibold transition-all duration-300 hover:bg-blue-400"
          >
            Login
          </a>
          <a
            href="/what-is-cardarena"
            className="rounded-2xl border border-white/20 bg-white/10 px-10 py-4 text-lg font-semibold transition-all duration-300 hover:bg-white/20"
          >
            Explore Platform
          </a>
        </div>

        <p className="mt-6 text-sm text-emerald-300">
          Free to sign up. No table entry fees. Built for competition.
        </p>
      </section>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          {[
            ["Competitive Tables", "Queue into skill-focused Spades tables and sharpen your game against live opponents."],
            ["Top Friends", "Build your top-friends list so your favorite teammates are always one click away."],
            ["Profile Reputation", "Show online status, match history, and your signature style from one central dashboard."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-2xl border border-white/15 bg-black/35 p-5 backdrop-blur-sm">
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-300">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-6 py-20 text-center backdrop-blur-sm">
        <h2 className="text-3xl font-semibold text-white md:text-4xl">What is CardArena?</h2>

        <p className="mx-auto mt-8 max-w-3xl text-lg leading-relaxed text-gray-300">
          CardArena is a modern competition platform for Spades players who care
          about strategy, chemistry, and consistency. Build your circle, run sets,
          and prove your game against strong competition.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href="/what-is-cardarena" className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/20">See Gameplay Preview</a>
          <a href="/premium" className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/20">See Premium Features</a>
        </div>
      </section>

      <section className="border-t border-white/10 bg-black/30 px-6 py-20 text-center backdrop-blur-md">
        <h3 className="mb-6 text-2xl font-semibold">Fair Play and Competitive Integrity</h3>
        <p className="mx-auto max-w-3xl leading-relaxed text-gray-300">
          CardArena is focused on fair competition, anti-abuse controls, and transparent platform rules.
          The goal is simple: serious Spades competition and reputation earned at the table.
        </p>
      </section>

      <footer className="relative border-t border-white/10 bg-black/40 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 text-sm text-gray-400 md:flex-row">
          <div className="text-center md:text-left">
            © {new Date().getFullYear()} CardArena. All rights reserved.
            <div className="mt-2 text-xs text-gray-500">
              Competitive Spades platform built for skill, consistency, and bragging rights.
            </div>
          </div>

          <div className="flex gap-6 text-xs">
            <a href="/what-is-cardarena" className="transition hover:text-white">What Is CardArena</a>
            <a href="/premium" className="transition hover:text-white">Premium</a>
            <a href="/terms" className="transition hover:text-white">Terms</a>
            <a href="/privacy" className="transition hover:text-white">Privacy</a>
            <a href="/responsible" className="transition hover:text-white">Responsible Play</a>
            <a href="mailto:support@thecardarena.com" className="transition hover:text-white">Contact</a>
          </div>
        </div>

        <div className="pb-6 text-center text-xs text-gray-500">
          Must be 18+ to participate. Participation subject to local laws.
        </div>
      </footer>
    </main>
  );
}


