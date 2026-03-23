"use client";

import { useRef, useState } from "react";
import PlayingCard from "./PlayingCard";

type Card = { suit: "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS"; rank: number };

type Props = {
  cards: Card[];
  onPlayCard: (card: Card, slam?: boolean) => void;
  isMyTurn: boolean;
};

export default function HandDock({ cards, onPlayCard, isMyTurn }: Props) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slamReadyId, setSlamReadyId] = useState<string | null>(null);

  function clearHold() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startHold(card: Card) {
    if (!isMyTurn) return;
    const id = `${card.suit}-${card.rank}`;
    clearHold();
    holdTimerRef.current = setTimeout(() => {
      setSlamReadyId(id);
    }, 300);
  }

  function cancelHold(card: Card) {
    const id = `${card.suit}-${card.rank}`;
    clearHold();
    if (slamReadyId === id) {
      setSlamReadyId(null);
    }
  }

  function releaseCard(card: Card) {
    if (!isMyTurn) return;
    const id = `${card.suit}-${card.rank}`;
    const shouldSlam = slamReadyId === id;
    clearHold();
    setSlamReadyId(null);
    setTimeout(() => {
      onPlayCard(card, shouldSlam);
    }, 40);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] md:px-4">
      <div className="mx-auto max-w-7xl rounded-t-[28px] border border-white/15 border-b-0 bg-[linear-gradient(180deg,rgba(3,7,18,0.18),rgba(3,7,18,0.82)_24%,rgba(3,7,18,0.97))] px-3 pt-4 shadow-[0_-18px_42px_rgba(0,0,0,0.45)] backdrop-blur-xl md:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-200/70">Hand Dock</p>
          <p className={`text-sm ${isMyTurn ? "text-emerald-300" : "text-white/70"}`}>
            {isMyTurn ? (slamReadyId ? "Release to slam" : "Tap to play or hold to slam") : "Waiting for your turn"}
          </p>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="perspective-[1200px]">
            <div className="flex min-h-[11rem] items-end justify-center px-4 pt-2 md:min-h-[13rem]">
            {cards.map((card, index) => {
              const id = `${card.suit}-${card.rank}`;
              const slamReady = slamReadyId === id;
              const spread = index - (cards.length - 1) / 2;
              const rotationJitter = ((index % 3) - 1) * 0.9;
              const liftJitter = index % 2 === 0 ? 1.5 : -0.5;
              const shadowDepth = 10 + index;
              const shadowBlur = 24 + index * 2;
              return (
                <button
                  key={id}
                  onPointerDown={() => startHold(card)}
                  onPointerUp={() => releaseCard(card)}
                  onPointerCancel={() => cancelHold(card)}
                  onPointerLeave={() => cancelHold(card)}
                  disabled={!isMyTurn}
                  className={`relative -ml-8 h-36 w-24 shrink-0 transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.05] hover:-translate-y-3.5 active:translate-y-[2px] active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-75 md:-ml-10 md:h-44 md:w-28 ${
                    index === 0 ? "ml-0" : ""
                  }`}
                  style={{
                    transform: `perspective(800px) rotateX(${slamReady ? 8 : 4}deg) rotateY(${spread * 2}deg) rotate(${spread * 6 + rotationJitter}deg) translateY(${Math.abs(spread) * 6 + liftJitter - (slamReady ? 12 : 0)}px) scale(${slamReady ? 1.08 : 1})`,
                    transformOrigin: "center bottom",
                    zIndex: 100 + index,
                  }}
                >
                  <PlayingCard
                    card={card}
                    className={`h-full w-full ${slamReady ? "ring-2 ring-emerald-300" : ""}`}
                    centerSuitClassName="text-[2.9rem] leading-none md:text-[3.35rem]"
                    cornerClassName="text-[13px] md:text-[15px]"
                    style={{
                      boxShadow: slamReady
                        ? `0 0 20px rgba(52,211,153,0.35), 0 ${shadowDepth}px ${shadowBlur}px rgba(0,0,0,0.35)`
                        : `0 ${shadowDepth}px ${shadowBlur}px rgba(0,0,0,0.35)`,
                    }}
                  />
                </button>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
