import Link from "next/link";

export default function SignupPendingPage() {
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
        <div className="mt-8">
          <Link href="/" className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold hover:bg-white/20">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
