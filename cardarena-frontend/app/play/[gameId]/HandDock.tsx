"use client";

import { useRef, useState } from "react";

type Card = { suit: "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS"; rank: number };

type Props = {
  cards: Card[];
  onPlayCard: (card: Card, slam?: boolean) => void;
  isMyTurn: boolean;
};

const suitSymbol: Record<Card["suit"], string> = {
  SPADES: "\u2660",
  HEARTS: "\u2665",
  DIAMONDS: "\u2666",
  CLUBS: "\u2663",
};

function rankLabel(rank: number) {
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  if (rank === 14) return "A";
  return String(rank);
}

function suitColor(suit: Card["suit"]) {
  return suit === "HEARTS" || suit === "DIAMONDS" ? "text-rose-500" : "text-slate-900";
}

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
    onPlayCard(card, shouldSlam);
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
          <div className="flex min-h-[7.75rem] items-end justify-center px-3 pt-1">
            {cards.map((card, index) => {
              const id = `${card.suit}-${card.rank}`;
              const slamReady = slamReadyId === id;
              return (
                <button
                  key={id}
                  onPointerDown={() => startHold(card)}
                  onPointerUp={() => releaseCard(card)}
                  onPointerCancel={() => cancelHold(card)}
                  onPointerLeave={() => cancelHold(card)}
                  disabled={!isMyTurn}
                  className={`relative -ml-5 h-24 w-16 shrink-0 rounded-md bg-gradient-to-b from-white to-slate-100 p-1 text-center shadow-[0_10px_24px_rgba(0,0,0,0.32)] ring-1 ring-black/20 transition hover:-translate-y-2 disabled:cursor-not-allowed disabled:opacity-75 ${
                    index === 0 ? "ml-0" : ""
                  } ${slamReady ? "ring-2 ring-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.35),0_10px_24px_rgba(0,0,0,0.32)]" : ""}`}
                  style={{
                    transform: `translateY(${slamReady ? -12 : 0}px) rotate(${(index - (cards.length - 1) / 2) * 2.5}deg) scale(${slamReady ? 1.05 : 1})`,
                    transformOrigin: "center bottom",
                    zIndex: index + 1,
                  }}
                >
                  <p className={`text-[11px] ${suitColor(card.suit)}`}>{rankLabel(card.rank)}</p>
                  <p className={`text-2xl leading-7 ${suitColor(card.suit)}`}>{suitSymbol[card.suit]}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
