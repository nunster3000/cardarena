"use client";

import Image from "next/image";
import CardBack from "./CardBack";
import PlayingCard from "./PlayingCard";

type Card = { suit: "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS"; rank: number };
type TrickCard = Card & { seat: number };

type GameState = {
  dealerSeat: number;
  currentTurnSeat: number;
  hands: Record<string, Card[] | { count: number }>;
  bids: Record<string, number>;
  trick: TrickCard[];
  completedTricks: number;
  teamATricks: number;
  teamBTricks: number;
  teamAScore: number;
  teamBScore: number;
  spadesBroken: boolean;
  turnDeadlineAt?: number | null;
  turnTimeoutMs?: number;
};

type Player = {
  seat: number;
  isBot: boolean;
  user?: { id: string; username?: string | null } | null;
};

type Props = {
  gameState: GameState | null | undefined;
  mySeat: number;
  players: Player[] | undefined;
  trick: TrickCard[] | undefined;
  playedCardFx?: { id: number; card: Card } | null;
  potCents?: number;
  bookFx?: Array<{ id: number; team: "A" | "B" }>;
};

function seatForPosition(mySeat: number, position: "top" | "right" | "bottom" | "left") {
  const base = [1, 2, 3, 4];
  const myIndex = Math.max(0, base.indexOf(mySeat || 1));
  const shift = myIndex - 2;
  const posIndex = position === "top" ? 0 : position === "right" ? 1 : position === "bottom" ? 2 : 3;
  return base[(posIndex + shift + 4) % 4];
}

function seatCardCount(state: GameState | null | undefined, seat: number) {
  if (!state) return 0;
  const hand = state.hands?.[String(seat)];
  if (!hand) return 0;
  if (Array.isArray(hand)) return hand.length;
  if (typeof hand === "object" && "count" in hand) return Number(hand.count) || 0;
  return 0;
}

function bidForSeat(state: GameState | null | undefined, seat: number) {
  if (!state?.bids) return null;
  const value = state.bids[String(seat)] ?? (state.bids as Record<number, number>)[seat];
  return typeof value === "number" ? value : value != null ? Number(value) : null;
}

function playerLabel(players: Player[] | undefined, seat: number, mySeat: number) {
  const player = players?.find((entry) => entry.seat === seat);
  if (!player) return `Seat ${seat}${seat === mySeat ? " (You)" : ""}`;
  if (seat === mySeat) return `${player.user?.username || "You"} (You)`;
  if (player.isBot) return player.user?.username || `Bot ${seat}`;
  return player.user?.username || `Seat ${seat}`;
}

function avatarInitial(label: string) {
  const cleaned = label.replace(/\s*\(You\)\s*/g, "").trim();
  return cleaned.charAt(0).toUpperCase() || "P";
}

function SeatBlock({
  position,
  label,
  bid,
  count,
  isCurrentTurn,
}: {
  position: "top" | "right" | "bottom" | "left";
  label: string;
  bid: number | null;
  count: number;
  isCurrentTurn: boolean;
}) {
  const positionClass =
    position === "top"
      ? "left-1/2 top-4 -translate-x-1/2"
      : position === "bottom"
        ? "bottom-4 left-1/2 -translate-x-1/2"
        : position === "left"
          ? "left-4 top-1/2 -translate-y-1/2"
          : "right-4 top-1/2 -translate-y-1/2";

  const cardClass = position === "left" || position === "right" ? "h-20 w-12" : "h-11 w-16";

  return (
    <div className={`absolute ${positionClass} z-10 text-center`}>
      <div
        className={`rounded-2xl border px-3 py-2 backdrop-blur-md shadow-[0_12px_26px_rgba(0,0,0,0.24)] ${
          isCurrentTurn
            ? "border-emerald-300/60 bg-[linear-gradient(180deg,rgba(16,185,129,0.2),rgba(0,0,0,0.4))] shadow-[0_0_34px_rgba(74,222,128,0.2),0_12px_26px_rgba(0,0,0,0.24)] animate-[activeSeatGlow_1.8s_ease-in-out_infinite]"
            : "border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(0,0,0,0.3))]"
        }`}
      >
        <div className="flex flex-col items-center">
          <div className="relative">
            <div
              className={`grid h-10 w-10 place-items-center rounded-full border text-sm font-black ${
                isCurrentTurn
                  ? "border-emerald-200/75 bg-[radial-gradient(circle_at_35%_30%,#d9f99d,#34d399_52%,#065f46)] text-slate-950 animate-[avatarPulse_1.5s_ease-in-out_infinite]"
                  : "border-white/20 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.22),rgba(148,163,184,0.2)_50%,rgba(15,23,42,0.85))] text-white"
              }`}
            >
              {avatarInitial(label)}
            </div>
            {isCurrentTurn ? (
              <>
                <div className="pointer-events-none absolute inset-0 rounded-full border border-emerald-200/55 animate-[ringPulse_1.6s_ease-out_infinite]" />
                <div className="pointer-events-none absolute -inset-2 rounded-full bg-emerald-300/12 blur-md" />
              </>
            ) : null}
          </div>
          <p className="mt-2 max-w-28 text-[11px] font-semibold leading-tight text-white/86">{label}</p>
          <p className={`mt-1 text-xs font-bold ${isCurrentTurn ? "text-emerald-200" : "text-amber-200"}`}>Bid: {bid ?? "-"}</p>
        </div>
        <CardBack className={`mx-auto mt-2 ${cardClass}`} />
        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/56">{count} cards</p>
      </div>
    </div>
  );
}

function formatPot(potCents?: number) {
  const dollars = Number(potCents ?? 0) / 100;
  return `$${dollars.toFixed(0)}`;
}

function trickWinAmount(potCents?: number) {
  const cents = Math.max(0, Math.round((potCents ?? 0) / 13));
  return cents / 100;
}

export default function GameTableLayout({ gameState, mySeat, players, trick, playedCardFx, potCents, bookFx = [] }: Props) {
  const topSeat = seatForPosition(mySeat || 1, "top");
  const rightSeat = seatForPosition(mySeat || 1, "right");
  const bottomSeat = seatForPosition(mySeat || 1, "bottom");
  const leftSeat = seatForPosition(mySeat || 1, "left");
  const rewardAmount = trickWinAmount(potCents);

  return (
    <div className="relative mx-auto min-h-[420px] w-full overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_50%_54%,rgba(83,240,199,0.18),transparent_20%),radial-gradient(circle_at_50%_55%,rgba(17,94,89,0.92),rgba(9,55,58,0.96)_38%,rgba(5,27,31,0.98)_76%,rgba(2,10,14,1)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-18px_34px_rgba(0,0,0,0.42),0_18px_50px_rgba(0,0,0,0.24)] animate-[tableFloat_6s_ease-in-out_infinite] md:min-h-[520px]">
      <div className="pointer-events-none absolute inset-0 rounded-[30px] bg-[radial-gradient(circle_at_50%_52%,rgba(167,243,208,0.12),transparent_24%),radial-gradient(circle_at_50%_50%,transparent_45%,rgba(0,0,0,0.18)_76%,rgba(0,0,0,0.42)_100%)]" />
      <div className="pointer-events-none absolute inset-[10px] rounded-[28px] border border-white/8 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]" />
      <div className="pointer-events-none absolute inset-6 rounded-[26px] border border-white/8 bg-[radial-gradient(circle_at_50%_52%,rgba(255,255,255,0.02),transparent_58%)]" />
      <div className="pointer-events-none absolute inset-0 rounded-[30px] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_18%,transparent_82%,rgba(0,0,0,0.26))]" />

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="relative mx-auto h-28 w-40 opacity-25 drop-shadow-[0_0_18px_rgba(110,231,183,0.16)] animate-[logoPulse_4.6s_ease-in-out_infinite] md:h-36 md:w-56">
          <Image src="/cardarena-logo.png" alt="CardArena" fill sizes="224px" className="object-contain" />
        </div>
      </div>

      <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 text-center">
        <div className="rounded-full border border-emerald-300/35 bg-[linear-gradient(180deg,rgba(6,95,70,0.82),rgba(2,44,34,0.92))] px-4 py-2 shadow-[0_0_24px_rgba(74,222,128,0.16),0_10px_24px_rgba(0,0,0,0.24)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/60">Pot</p>
          <p className="mt-0.5 text-xl font-black text-emerald-300 drop-shadow-[0_0_10px_rgba(74,222,128,0.24)]">{formatPot(potCents)}</p>
        </div>
      </div>

      <SeatBlock
        position="top"
        label={playerLabel(players, topSeat, mySeat)}
        bid={bidForSeat(gameState, topSeat)}
        count={seatCardCount(gameState, topSeat)}
        isCurrentTurn={gameState?.currentTurnSeat === topSeat}
      />
      <SeatBlock
        position="left"
        label={playerLabel(players, leftSeat, mySeat)}
        bid={bidForSeat(gameState, leftSeat)}
        count={seatCardCount(gameState, leftSeat)}
        isCurrentTurn={gameState?.currentTurnSeat === leftSeat}
      />
      <SeatBlock
        position="right"
        label={playerLabel(players, rightSeat, mySeat)}
        bid={bidForSeat(gameState, rightSeat)}
        count={seatCardCount(gameState, rightSeat)}
        isCurrentTurn={gameState?.currentTurnSeat === rightSeat}
      />
      <SeatBlock
        position="bottom"
        label={playerLabel(players, bottomSeat, mySeat)}
        bid={bidForSeat(gameState, bottomSeat)}
        count={seatCardCount(gameState, bottomSeat)}
        isCurrentTurn={gameState?.currentTurnSeat === bottomSeat}
      />

      <div className="absolute left-1/2 top-1/2 z-10 h-48 w-48 -translate-x-1/2 -translate-y-1/2 md:h-60 md:w-60">
        <div className="relative flex h-full w-full items-center justify-center rounded-full border border-white/8 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.08),rgba(0,0,0,0.16)_70%)] px-2 shadow-[inset_0_12px_22px_rgba(255,255,255,0.04),inset_0_-18px_30px_rgba(0,0,0,0.26)] backdrop-blur-[2px]">
          {bookFx.map((fx) => (
            <div key={fx.id} className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 rounded-full border border-white/15 animate-[trickCenterFlash_700ms_ease-out]" />
              <div
                className={`absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl ${
                  fx.team === "A" ? "bg-emerald-300/30 animate-[teamGlowLeft_820ms_ease-out]" : "bg-sky-300/30 animate-[teamGlowRight_820ms_ease-out]"
                }`}
              />
              <div
                className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-black ${
                  fx.team === "A" ? "text-emerald-200" : "text-sky-200"
                } animate-[trickMoneyFloat_820ms_ease-out_forwards]`}
              >
                +${rewardAmount.toFixed(2)}
              </div>
            </div>
          ))}
          {playedCardFx ? (
            <div
              key={playedCardFx.id}
              className="pointer-events-none absolute left-1/2 top-[88%] h-16 w-11 -translate-x-1/2 -translate-y-1/2 animate-[playToCenter_320ms_cubic-bezier(0.22,1,0.36,1)_forwards]"
            >
              <PlayingCard card={playedCardFx.card} className="h-full w-full shadow-[0_14px_26px_rgba(0,0,0,0.28)]" centerSuitClassName="text-[1.25rem] leading-none" cornerClassName="text-[9px]" />
            </div>
          ) : null}
          {(trick || []).map((card, idx) => {
            const isMostRecent = idx === (trick?.length || 0) - 1;
            const offsetX = (idx % 2 === 0 ? -1 : 1) * (10 + idx * 3);
            const offsetY = idx < 2 ? -8 + idx * 6 : 8 + (idx - 2) * 4;
            const rotation = (idx - ((trick?.length || 1) - 1) / 2) * 8;
            return (
              <div
                key={`${card.seat}-${idx}`}
                className="absolute h-16 w-11"
                style={{
                  transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${isMostRecent ? 1.05 : 1})`,
                  zIndex: idx + 1,
                }}
              >
                <div
                  className={`h-full w-full animate-[trickCardIn_280ms_cubic-bezier(0.22,1,0.36,1)] ${
                    isMostRecent
                      ? "shadow-[0_0_0_2px_rgba(255,255,255,0.48),0_14px_28px_rgba(0,0,0,0.28)] animate-[trickCardIn_280ms_cubic-bezier(0.22,1,0.36,1),recentCardGlow_1.8s_ease-in-out]"
                      : "shadow-[0_10px_18px_rgba(0,0,0,0.22)]"
                  }`}
                >
                  <PlayingCard card={card} className="h-full w-full" centerSuitClassName="text-[1.2rem] leading-none" cornerClassName="text-[9px]" footerLabel={`S${card.seat}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style jsx>{`
        @keyframes trickCardIn {
          0% {
            opacity: 0;
            transform: scale(0.82);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes recentCardGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(255,255,255,0.0), 0 10px 18px rgba(0,0,0,0.22);
          }
          50% {
            box-shadow: 0 0 0 2px rgba(255,255,255,0.48), 0 0 18px rgba(255,255,255,0.18), 0 14px 28px rgba(0,0,0,0.28);
          }
          100% {
            box-shadow: 0 0 0 2px rgba(255,255,255,0.48), 0 14px 28px rgba(0,0,0,0.28);
          }
        }
        @keyframes activeSeatGlow {
          0% {
            box-shadow: 0 0 18px rgba(74,222,128,0.08), 0 12px 26px rgba(0,0,0,0.24);
          }
          50% {
            box-shadow: 0 0 30px rgba(74,222,128,0.18), 0 12px 26px rgba(0,0,0,0.24);
          }
          100% {
            box-shadow: 0 0 18px rgba(74,222,128,0.08), 0 12px 26px rgba(0,0,0,0.24);
          }
        }
        @keyframes avatarPulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes ringPulse {
          0% {
            opacity: 0;
            transform: scale(0.9);
          }
          30% {
            opacity: 0.5;
          }
          100% {
            opacity: 0;
            transform: scale(1.22);
          }
        }
        @keyframes tableFloat {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-3px);
          }
          100% {
            transform: translateY(0px);
          }
        }
        @keyframes logoPulse {
          0% {
            opacity: 0.2;
            filter: drop-shadow(0 0 0 rgba(110,231,183,0));
          }
          50% {
            opacity: 0.28;
            filter: drop-shadow(0 0 12px rgba(110,231,183,0.18));
          }
          100% {
            opacity: 0.2;
            filter: drop-shadow(0 0 0 rgba(110,231,183,0));
          }
        }
        @keyframes playToCenter {
          0% {
            opacity: 0.98;
            transform: translate(-50%, -50%) translateY(0px) rotate(-10deg) scale(1);
          }
          68% {
            opacity: 1;
            transform: translate(-50%, -50%) translateY(-176px) rotate(4deg) scale(1.1);
          }
          82% {
            opacity: 0.98;
            transform: translate(-50%, -50%) translateY(-166px) rotate(2deg) scale(0.94);
          }
          92% {
            opacity: 0.95;
            transform: translate(-50%, -50%) translateY(-171px) rotate(3deg) scale(1.03);
          }
          100% {
            opacity: 0.9;
            transform: translate(-50%, -50%) translateY(-170px) rotate(3deg) scale(1);
          }
        }
        @keyframes trickCenterFlash {
          0% {
            opacity: 0;
            transform: scale(0.72);
          }
          25% {
            opacity: 0.55;
          }
          100% {
            opacity: 0;
            transform: scale(1.22);
          }
        }
        @keyframes trickMoneyFloat {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) translateY(6px) scale(0.9);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) translateY(-36px) scale(1.05);
          }
        }
        @keyframes teamGlowLeft {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) translateX(0px) scale(0.8);
          }
          30% {
            opacity: 0.7;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) translateX(-90px) scale(1.35);
          }
        }
        @keyframes teamGlowRight {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) translateX(0px) scale(0.8);
          }
          30% {
            opacity: 0.7;
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) translateX(90px) scale(1.35);
          }
        }
      `}</style>
    </div>
  );
}
