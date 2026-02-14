export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden text-white">

     {/* Hero Background Image */}
<div className="absolute inset-0 -z-20">
  <img
    src="/hero-bg.png"
    alt="CardArena Background"
    className="w-full h-full object-cover opacity-80"
  />
</div>

{/* Softer Gradient Overlay */}
<div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#0b1220]/60 via-[#0f172a]/50 to-[#052e2b]/60" />

{/* Subtle Glow Overlay Instead of Heavy Shimmer */}
<div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.15),transparent_50%),radial-gradient(circle_at_70%_60%,rgba(59,130,246,0.15),transparent_50%)]" />


      {/* Animated Shimmer Layer */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(120deg,rgba(255,255,255,0.05)_25%,transparent_50%,rgba(255,255,255,0.05)_75%)] bg-[length:200%_200%] animate-shimmer" />

      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center px-6 py-36 text-center">
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
          CardArena
        </h1>

        <p className="mt-6 max-w-2xl text-lg md:text-xl text-gray-200">
          Competitive Card Play. Real Prizes. Pure Skill.
        </p>

        <p className="mt-4 max-w-xl text-gray-400">
          Join structured tournaments, compete against real players,
          and earn prize awards based on performance.
        </p>

        <div className="mt-12">
          <a
          href="/notify"
          className="px-10 py-4 text-lg font-semibold rounded-2xl bg-emerald-500 hover:bg-emerald-400 transition-all duration-300 shadow-xl shadow-emerald-500/30"
          > Be First to Be Notified </a>
        </div>

        <p className="mt-6 text-sm text-gray-400">
          Free account required. Tournaments launching soon.
        </p>
      </section>

      {/* Divider Glow */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

      {/* About Section */}
      <section className="px-6 py-28 text-center backdrop-blur-sm">
        <h2 className="text-3xl md:text-4xl font-semibold text-white">
          What is CardArena?
        </h2>

        <p className="mt-8 max-w-3xl mx-auto text-gray-300 leading-relaxed text-lg">
          CardArena is a competitive online card platform built for strategic
          players who enjoy organized tournament play. Participants enter
          skill-based competitions and compete for prize awards in a secure,
          performance-driven environment designed for serious card enthusiasts.
        </p>
      </section>

      {/* Compliance Section */}
<section className="px-6 py-20 text-center bg-black/30 backdrop-blur-md border-t border-white/10">
  <h3 className="text-2xl font-semibold mb-6">
    Fair Play & Transparency
  </h3>

  <p className="max-w-3xl mx-auto text-gray-300 leading-relaxed">
    CardArena hosts organized, skill-based card competitions designed for strategic players.
    Prize awards are distributed based on performance within structured tournaments.
    We are committed to maintaining a secure, fair, and responsible competitive environment.
  </p>
</section>


      {/* Footer */}
<footer className="relative border-t border-white/10 bg-black/40 backdrop-blur-md">
  <div className="max-w-6xl mx-auto px-6 py-10 text-sm text-gray-400 flex flex-col md:flex-row items-center justify-between gap-6">

    <div className="text-center md:text-left">
      © {new Date().getFullYear()} CardArena. All rights reserved.
      <div className="mt-2 text-xs text-gray-500">
        Competitive skill-based card tournaments. Prize awards based on performance.
      </div>
    </div>

    <div className="flex gap-6 text-xs">
      <a href="/terms" className="hover:text-white transition">Terms</a>
      <a href="/privacy" className="hover:text-white transition">Privacy</a>
      <a href="/responsible-play" className="hover:text-white transition">Responsible Play</a>
      <a href="mailto:support@thecardarena.com" className="hover:text-white transition">Contact</a>
    </div>

  </div>

  <div className="text-center text-xs text-gray-500 pb-6">
    Must be 18+ to participate. Participation subject to local laws.
  </div>
</footer>

    </main>
  );
}



