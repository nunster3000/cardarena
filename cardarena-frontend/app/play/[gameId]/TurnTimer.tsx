"use client";

import { useEffect, useState } from "react";

type Props = {
  turnDeadlineAt?: number | null;
  currentTurnSeat?: number | null;
  isMyTurn: boolean;
  visible: boolean;
};

export default function TurnTimer({ turnDeadlineAt, currentTurnSeat, isMyTurn, visible }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!visible || !turnDeadlineAt) return;
    setNow(Date.now());
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 200);
    return () => window.clearInterval(interval);
  }, [visible, turnDeadlineAt]);

  if (!visible || !turnDeadlineAt) return null;

  const remainingMs = Math.max(0, turnDeadlineAt - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const urgent = remainingSec <= 3;

  return (
    <div className="flex justify-center">
      <div
        className={`rounded-full border px-4 py-2 text-center text-xs shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-xl transition ${
          urgent
            ? "border-rose-300/45 bg-rose-500/12 animate-[urgentTimerPulse_800ms_ease-in-out_infinite]"
            : "border-white/15 bg-black/35"
        }`}
      >
        <p className={`${urgent ? "text-rose-100/90" : "text-white/70"}`}>Seat {currentTurnSeat ?? "-"} on the clock</p>
        <p className={`mt-0.5 text-base font-bold ${urgent ? "text-rose-300" : isMyTurn ? "text-emerald-300" : "text-amber-200"}`}>
          {remainingSec}s
        </p>
      </div>
      <style jsx>{`
        @keyframes urgentTimerPulse {
          0% {
            transform: scale(1);
            box-shadow: 0 8px 24px rgba(0,0,0,0.28), 0 0 0 rgba(244,63,94,0);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 8px 24px rgba(0,0,0,0.28), 0 0 22px rgba(244,63,94,0.22);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 8px 24px rgba(0,0,0,0.28), 0 0 0 rgba(244,63,94,0);
          }
        }
      `}</style>
    </div>
  );
}
