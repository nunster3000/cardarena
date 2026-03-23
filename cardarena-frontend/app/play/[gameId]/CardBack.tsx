"use client";

import Image from "next/image";

type Props = {
  className?: string;
};

export default function CardBack({ className = "" }: Props) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-white/14 bg-[radial-gradient(circle_at_50%_24%,rgba(192,132,252,0.18),transparent_32%),radial-gradient(circle_at_50%_62%,rgba(59,130,246,0.16),transparent_42%),linear-gradient(145deg,#090f20_0%,#111933_38%,#1d1440_72%,#090c19_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-10px_18px_rgba(0,0,0,0.42),0_10px_20px_rgba(0,0,0,0.28)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.16),transparent_20%),radial-gradient(circle_at_80%_82%,rgba(110,231,183,0.08),transparent_24%),repeating-linear-gradient(135deg,rgba(255,255,255,0.03)_0_2px,transparent_2px_10px)] opacity-80" />
      <div className="pointer-events-none absolute inset-[8%] rounded-[10px] border border-white/10" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300/12 blur-xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[44%] w-[68%] -translate-x-1/2 -translate-y-1/2">
        <Image src="/cardarena-logo.png" alt="CardArena card back" fill sizes="96px" className="object-contain drop-shadow-[0_0_10px_rgba(110,231,183,0.24)]" />
      </div>
      <div className="pointer-events-none absolute inset-x-[18%] top-[14%] h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-[18%] bottom-[14%] h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />
    </div>
  );
}
