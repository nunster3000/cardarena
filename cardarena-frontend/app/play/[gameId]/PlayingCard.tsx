"use client";

import type { CSSProperties } from "react";
import SuitIcon from "./SuitIcon";

type Card = { suit: "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS"; rank: number | string };

type Props = {
  card: Card;
  className?: string;
  centerSuitClassName?: string;
  cornerClassName?: string;
  footerLabel?: string;
  style?: CSSProperties;
  tone?: "default" | "playArea";
};

function rankLabel(rank: number | string) {
  const numericRank = Number(rank);
  if (numericRank === 11) return "J";
  if (numericRank === 12) return "Q";
  if (numericRank === 13) return "K";
  if (numericRank === 14) return "A";
  return String(rank);
}

function suitTone(suit: Card["suit"], tone: "default" | "playArea") {
  if (tone === "playArea") {
    if (suit === "SPADES") {
      return {
        rank: "text-sky-950",
        glow: "drop-shadow-[0_0_2px_rgba(59,130,246,0.08)]",
      };
    }
    if (suit === "HEARTS") {
      return {
        rank: "text-red-700",
        glow: "drop-shadow-[0_0_2px_rgba(220,38,38,0.1)]",
      };
    }
    if (suit === "DIAMONDS") {
      return {
        rank: "text-fuchsia-700",
        glow: "drop-shadow-[0_0_2px_rgba(192,38,211,0.1)]",
      };
    }
    return {
      rank: "text-emerald-800",
      glow: "drop-shadow-[0_0_2px_rgba(5,150,105,0.1)]",
    };
  }
  if (suit === "SPADES") {
    return {
      rank: "text-sky-800",
      glow: "drop-shadow-[0_0_7px_rgba(59,130,246,0.2)]",
    };
  }
  if (suit === "HEARTS") {
    return {
      rank: "text-rose-600",
      glow: "drop-shadow-[0_0_8px_rgba(244,63,94,0.24)]",
    };
  }
  if (suit === "DIAMONDS") {
    return {
      rank: "text-fuchsia-600",
      glow: "drop-shadow-[0_0_8px_rgba(217,70,239,0.22)]",
    };
  }
  return {
    rank: "text-emerald-700",
    glow: "drop-shadow-[0_0_8px_rgba(16,185,129,0.2)]",
  };
}

export default function PlayingCard({
  card,
  className = "",
  centerSuitClassName = "text-[2rem] leading-none",
  cornerClassName = "text-[11px]",
  footerLabel,
  style,
  tone = "default",
}: Props) {
  const visualTone = suitTone(card.suit, tone);
  const rank = rankLabel(card.rank);

  return (
    <div
      className={`card-face relative overflow-hidden rounded-md border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.98)_52%,rgba(226,232,240,0.96))] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-10px_16px_rgba(148,163,184,0.12),0_14px_30px_rgba(0,0,0,0.35)] ring-1 ring-black/8 ${className}`}
      style={style}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_16%,rgba(255,255,255,0.95),transparent_22%),linear-gradient(145deg,rgba(255,255,255,0.16),transparent_42%,rgba(148,163,184,0.08))]" />
      <div className="absolute left-[10%] top-[8%] flex flex-col items-center leading-none">
        <span className={`font-black ${cornerClassName} ${visualTone.rank}`}>{rank}</span>
        <SuitIcon suit={card.suit} tone={tone} className={`${cornerClassName} ${visualTone.glow}`} size="1em" />
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <SuitIcon suit={card.suit} tone={tone} className={`${centerSuitClassName} ${visualTone.glow}`} size="1em" />
      </div>
      <div className="absolute bottom-[8%] right-[10%] flex rotate-180 flex-col items-center leading-none">
        <span className={`font-black ${cornerClassName} ${visualTone.rank}`}>{rank}</span>
        <SuitIcon suit={card.suit} tone={tone} className={`${cornerClassName} ${visualTone.glow}`} size="1em" />
      </div>
      {footerLabel ? (
        <div className="absolute inset-x-0 bottom-[6%] text-center">
          <span className="rounded-full bg-slate-900/8 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            {footerLabel}
          </span>
        </div>
      ) : null}
      <style jsx>{`
        .card-face::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 6px;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            inset 0 -2px 4px rgba(0, 0, 0, 0.15);
          pointer-events: none;
        }
        .card-face::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            120deg,
            transparent,
            rgba(255, 255, 255, 0.25),
            transparent
          );
          opacity: 0.3;
          pointer-events: none;
        }
        .card-face:hover {
          filter: brightness(1.05);
        }
        .card-face {
          backface-visibility: hidden;
          transform: translateZ(0);
          -webkit-font-smoothing: antialiased;
          image-rendering: -webkit-optimize-contrast;
        }
      `}</style>
    </div>
  );
}
