"use client";

import { Space_Grotesk } from "next/font/google";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import GameTableLayout from "./GameTableLayout";
import HandDock from "./HandDock";
import PlayingCard from "./PlayingCard";
import TurnTimer from "./TurnTimer";
import { clearSession, getSession } from "../../../lib/session";
import { closeGameSocket, getGameSocket } from "../../../lib/socket";

const space = Space_Grotesk({ subsets: ["latin"] });
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

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

type GamePayload = {
  id: string;
  status: string;
  phase: string;
  tournamentId: string;
  potCents?: number;
  state: GameState;
  playerSeat: number;
  players: Array<{
    seat: number;
    isBot: boolean;
    user?: { id: string; username?: string | null } | null;
  }>;
};

type DeckBack = "emerald" | "cosmic" | "carbon";
type DeckTheme = "classic" | "neon" | "midnight";

const themeClass: Record<DeckTheme, string> = {
  classic: "from-white to-slate-100 text-slate-900",
  neon: "from-cyan-100 to-emerald-100 text-slate-900",
  midnight: "from-slate-200 to-slate-300 text-slate-900",
};

function cardId(card: Card) {
  return `${card.suit}-${card.rank}`;
}

function bidForSeat(state: GameState | undefined, seat: number) {
  if (!state?.bids) return null;
  const value = state.bids[String(seat)] ?? (state.bids as Record<number, number>)[seat];
  return typeof value === "number" ? value : value != null ? Number(value) : null;
}

export default function PlayPage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params?.gameId;
  const router = useRouter();

  const [token, setToken] = useState("");
  const [game, setGame] = useState<GamePayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [bidValue, setBidValue] = useState("3");
  const [submitting, setSubmitting] = useState(false);
  const [tableShake, setTableShake] = useState(false);
  const [slamZoom, setSlamZoom] = useState(false);
  const [slamPulse, setSlamPulse] = useState(false);
  const [slamFlash, setSlamFlash] = useState(false);
  const [spadeBreakFx, setSpadeBreakFx] = useState(false);
  const [deckBack, setDeckBack] = useState<DeckBack>("emerald");
  const [deckTheme, setDeckTheme] = useState<DeckTheme>("classic");
  const [socketConnected, setSocketConnected] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [sfxVolume, setSfxVolume] = useState(0.8);
  const [bookFx, setBookFx] = useState<Array<{ id: number; team: "A" | "B" }>>([]);
  const [playedCardFx, setPlayedCardFx] = useState<{ id: number; card: Card } | null>(null);

  const prevSpadeBroken = useRef<boolean>(false);
  const slamAudioRef = useRef<HTMLAudioElement | null>(null);
  const spadeBreakAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const nextBookFxIdRef = useRef(1);
  const nextPlayedFxIdRef = useRef(1);
  const prevTricksRef = useRef({ a: 0, b: 0 });

  async function api(path: string, init: RequestInit = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Request failed");
    return body;
  }

  async function loadGame() {
    if (!gameId) return;
    const body = await api(`/api/v1/games/${gameId}`);
    const nextGame = body.data as GamePayload;
    if (nextGame?.state?.spadesBroken && !prevSpadeBroken.current) {
      setSpadeBreakFx(true);
      setTableShake(true);
      setTimeout(() => setTableShake(false), 420);
      setTimeout(() => setSpadeBreakFx(false), 1000);
    }
    prevSpadeBroken.current = Boolean(nextGame?.state?.spadesBroken);
    setGame(nextGame);
  }

  useEffect(() => {
    const session = getSession();
    if (!session.token) {
      router.replace("/login");
      return;
    }
    setToken(session.token);
    const savedBack = localStorage.getItem("cardarena_card_back") as DeckBack | null;
    const savedTheme = localStorage.getItem("cardarena_deck_theme") as DeckTheme | null;
    const savedSfxEnabled = localStorage.getItem("cardarena_sfx_enabled");
    const savedSfxVolume = localStorage.getItem("cardarena_sfx_volume");
    if (savedBack && ["emerald", "cosmic", "carbon"].includes(savedBack)) setDeckBack(savedBack);
    if (savedTheme && ["classic", "neon", "midnight"].includes(savedTheme)) setDeckTheme(savedTheme);
    if (savedSfxEnabled != null) setSfxEnabled(savedSfxEnabled === "true");
    if (savedSfxVolume != null) {
      const parsed = Number(savedSfxVolume);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) setSfxVolume(parsed);
    }
  }, [router]);

  useEffect(() => {
    if (!token || !gameId) return;
    loadGame().catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load game"));
    const socket = getGameSocket(token);

    const onConnect = () => {
      setSocketConnected(true);
      socket.emit("join_game", { gameId });
    };
    const onDisconnect = () => setSocketConnected(false);
    const onGameState = (nextState: GameState) => {
      setGame((prev) => {
        if (!prev) {
          return prev;
        }
        if (nextState?.spadesBroken && !prevSpadeBroken.current) {
          setSpadeBreakFx(true);
          setTableShake(true);
          playSfx("SPADE_BREAK");
          if (navigator.vibrate) navigator.vibrate(35);
          setTimeout(() => setTableShake(false), 420);
          setTimeout(() => setSpadeBreakFx(false), 1000);
        }
        prevSpadeBroken.current = Boolean(nextState?.spadesBroken);
        const nextPhase = (nextState as any)?.phase || prev.phase;
        return { ...prev, phase: nextPhase, state: nextState };
      });
      setSubmitting(false);
    };
    const onSocketError = (payload: { message?: string }) => {
      setSubmitting(false);
      setError(payload?.message || "Game action failed");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("game_state", onGameState);
    socket.on("error", onSocketError);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("game_state", onGameState);
      socket.off("error", onSocketError);
      closeGameSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, gameId]);

  useEffect(() => {
    localStorage.setItem("cardarena_card_back", deckBack);
  }, [deckBack]);

  useEffect(() => {
    localStorage.setItem("cardarena_deck_theme", deckTheme);
  }, [deckTheme]);

  useEffect(() => {
    localStorage.setItem("cardarena_sfx_enabled", String(sfxEnabled));
  }, [sfxEnabled]);

  useEffect(() => {
    localStorage.setItem("cardarena_sfx_volume", String(sfxVolume));
    if (slamAudioRef.current) slamAudioRef.current.volume = sfxVolume;
    if (spadeBreakAudioRef.current) spadeBreakAudioRef.current.volume = sfxVolume;
  }, [sfxVolume]);

  useEffect(() => {
    slamAudioRef.current = new Audio("/audio/slam-boom.mp3");
    spadeBreakAudioRef.current = new Audio("/audio/glass-break.mp3");
    if (slamAudioRef.current) slamAudioRef.current.preload = "auto";
    if (spadeBreakAudioRef.current) spadeBreakAudioRef.current.preload = "auto";
    return () => {
      slamAudioRef.current = null;
      spadeBreakAudioRef.current = null;
    };
  }, []);

  const mySeat = game?.playerSeat || 0;
  const phase = (game?.state as any)?.phase || game?.phase || "WAITING";
  const myTurn = Boolean(game?.state && game.state.currentTurnSeat === mySeat);
  const myHand = useMemo(() => {
    const hand = (game?.state?.hands?.[String(mySeat)] || []) as Card[];
    const suitOrder: Record<Card["suit"], number> = {
      SPADES: 0,
      HEARTS: 1,
      DIAMONDS: 2,
      CLUBS: 3,
    };
    return [...hand].sort((a, b) => suitOrder[a.suit] - suitOrder[b.suit] || a.rank - b.rank);
  }, [game, mySeat]);
  const showTurnTimer = phase === "BIDDING" || phase === "PLAYING";

  function spawnBookFx(team: "A" | "B") {
    const id = nextBookFxIdRef.current++;
    setBookFx((prev) => [...prev, { id, team }]);
    setTimeout(() => {
      setBookFx((prev) => prev.filter((fx) => fx.id !== id));
    }, 850);
  }

  function spawnPlayedCardFx(card: Card) {
    const id = nextPlayedFxIdRef.current++;
    setPlayedCardFx({ id, card });
    setTimeout(() => {
      setPlayedCardFx((prev) => (prev?.id === id ? null : prev));
    }, 320);
  }

  useEffect(() => {
    const a = Number(game?.state?.teamATricks ?? 0);
    const b = Number(game?.state?.teamBTricks ?? 0);
    const prev = prevTricksRef.current;

    if (a > prev.a) {
      const diff = a - prev.a;
      for (let i = 0; i < diff; i++) spawnBookFx("A");
    }
    if (b > prev.b) {
      const diff = b - prev.b;
      for (let i = 0; i < diff; i++) spawnBookFx("B");
    }

    prevTricksRef.current = { a, b };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.state?.teamATricks, game?.state?.teamBTricks]);

  async function unlockAudioIfNeeded() {
    if (audioUnlockedRef.current) return;
    const audios = [slamAudioRef.current, spadeBreakAudioRef.current].filter(
      (a): a is HTMLAudioElement => Boolean(a)
    );
    if (!audios.length) return;

    for (const audio of audios) {
      try {
        audio.volume = 0;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
      } catch {
        return;
      } finally {
        audio.volume = sfxVolume;
      }
    }
    audioUnlockedRef.current = true;
  }

  function playSfx(type: "SLAM" | "SPADE_BREAK") {
    if (!sfxEnabled) return;
    const audio = type === "SLAM" ? slamAudioRef.current : spadeBreakAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = sfxVolume;
    void audio.play().catch(() => undefined);
  }

  async function startGameAction() {
    if (!gameId) return;
    try {
      await unlockAudioIfNeeded();
      setSubmitting(true);
      const socket = getGameSocket(token);
      if (socket.connected) {
        socket.emit("start_game", { gameId });
      } else {
        await api(`/api/v1/games/${gameId}/start`, { method: "POST" });
        await loadGame();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to start game");
      setSubmitting(false);
    } finally {
      setTimeout(() => setSubmitting(false), 500);
    }
  }

  async function submitBidAction() {
    if (!gameId) return;
    try {
      await unlockAudioIfNeeded();
      setSubmitting(true);
      await api(`/api/v1/games/${gameId}/bid`, {
        method: "POST",
        body: JSON.stringify({ bid: Number(bidValue) }),
      });
      setMessage("Bid submitted.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to submit bid");
      setSubmitting(false);
    } finally {
      setTimeout(() => setSubmitting(false), 500);
    }
  }

  async function playCardAction(card: Card, slam = false) {
    if (!gameId) return;
    try {
      await unlockAudioIfNeeded();
      setSubmitting(true);
      spawnPlayedCardFx(card);
      if (slam) {
        setSlamPulse(true);
        setTableShake(true);
        setSlamZoom(true);
        setSlamFlash(true);
        setTimeout(() => playSfx("SLAM"), 40);
        if (navigator.vibrate) navigator.vibrate(28);
        setTimeout(() => setTableShake(false), 340);
        setTimeout(() => setSlamZoom(false), 320);
        setTimeout(() => setSlamFlash(false), 180);
        setTimeout(() => setSlamPulse(false), 380);
      }
      const socket = getGameSocket(token);
      if (socket.connected) {
        socket.emit("play_card", { gameId, card: { suit: card.suit, rank: String(card.rank) } });
      } else {
        await api(`/api/v1/games/${gameId}/play`, {
          method: "POST",
          body: JSON.stringify({ suit: card.suit, rank: card.rank }),
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to play card");
      setSubmitting(false);
    } finally {
      setTimeout(() => setSubmitting(false), 500);
    }
  }

  function logout() {
    clearSession();
    router.replace("/");
  }

  async function leaveGameAction() {
    if (!gameId || leaving) return;
    const confirmed = window.confirm("Leave this game now?");
    if (!confirmed) return;
    try {
      setLeaving(true);
      await api(`/api/v1/games/${gameId}/leave`, { method: "POST" });
      closeGameSocket();
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to leave game");
      setLeaving(false);
    }
  }

  return (
    <main className={`${space.className} min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#123f4e,#0b1f32_45%,#050b15)] px-3 py-3 text-white md:px-4 md:py-4`}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-black/35 px-4 py-3 backdrop-blur-xl">
        <div>
          <p className="text-xs text-white/70">Game ID: {gameId}</p>
          <h1 className="text-lg font-bold">CardArena Table</h1>
          <p className="text-xs text-emerald-300">Tournament: {game?.tournamentId || "Loading..."}</p>
          <p className={`text-[11px] ${socketConnected ? "text-cyan-200" : "text-amber-300"}`}>
            {socketConnected ? "Realtime Connected" : "Realtime Reconnecting"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSfxEnabled((prev) => !prev)}
            className={`rounded px-2 py-1 text-xs ${sfxEnabled ? "bg-emerald-500/25 hover:bg-emerald-500/35" : "bg-white/10 hover:bg-white/20"}`}
          >
            SFX: {sfxEnabled ? "On" : "Off"}
          </button>
          <label className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs">
            Vol
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sfxVolume}
              onChange={(e) => setSfxVolume(Number(e.target.value))}
              className="w-20"
            />
          </label>
          <select value={deckBack} onChange={(e) => setDeckBack(e.target.value as DeckBack)} className="rounded bg-white/10 px-2 py-1 text-xs ring-1 ring-white/20">
            <option value="emerald">Back: Emerald</option>
            <option value="cosmic">Back: Cosmic</option>
            <option value="carbon">Back: Carbon</option>
          </select>
          <select value={deckTheme} onChange={(e) => setDeckTheme(e.target.value as DeckTheme)} className="rounded bg-white/10 px-2 py-1 text-xs ring-1 ring-white/20">
            <option value="classic">Deck: Classic</option>
            <option value="neon">Deck: Neon</option>
            <option value="midnight">Deck: Midnight</option>
          </select>
          <button
            onClick={leaveGameAction}
            disabled={leaving}
            className="rounded bg-amber-500/30 px-3 py-1 text-xs hover:bg-amber-500/40 disabled:opacity-60"
          >
            {leaving ? "Leaving..." : "Leave Game"}
          </button>
          <button onClick={() => router.push("/dashboard")} className="rounded bg-white/15 px-3 py-1 text-xs hover:bg-white/25">Dashboard</button>
          <button onClick={logout} className="rounded bg-red-500/30 px-3 py-1 text-xs hover:bg-red-500/40">Logout</button>
        </div>
      </div>

      <section className="mx-auto mt-4 max-w-7xl space-y-3">
        <div className="rounded-2xl border border-white/15 bg-black/35 px-4 py-3 text-[11px] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/78">
              <span>Status: <span className="font-semibold text-white">{game?.status || "..."}</span></span>
              <span>Phase: <span className="font-semibold text-white">{phase}</span></span>
              <span>Your Seat: <span className="font-semibold text-white">{mySeat || "-"}</span></span>
              <span>Turn: <span className={myTurn ? "font-semibold text-emerald-300" : "font-semibold text-white"}>{game?.state?.currentTurnSeat ?? "-"}</span></span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-white/72">
              <span className="text-emerald-300">A Tricks {game?.state?.teamATricks ?? 0}</span>
              <span className="text-blue-300">B Tricks {game?.state?.teamBTricks ?? 0}</span>
              <span className="text-emerald-300">A Score {game?.state?.teamAScore ?? 0}</span>
              <span className="text-blue-300">B Score {game?.state?.teamBScore ?? 0}</span>
              <span>Books {game?.state?.completedTricks ?? 0}/13</span>
              <span>{game?.state?.spadesBroken ? "Spades broken" : "Spades unbroken"}</span>
            </div>
          </div>
          {(spadeBreakFx || bookFx.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {spadeBreakFx ? <span className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 text-cyan-100">Spades broken</span> : null}
              {bookFx.length > 0 ? <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-white/85">Book won</span> : null}
            </div>
          )}
        </div>

        <TurnTimer
          visible={showTurnTimer}
          turnDeadlineAt={game?.state?.turnDeadlineAt}
          currentTurnSeat={game?.state?.currentTurnSeat}
          isMyTurn={myTurn}
        />

        <div
          className={`relative rounded-[36px] border border-cyan-300/20 bg-[radial-gradient(circle_at_50%_50%,#0c5f59,#063244_55%,#051022)] p-3 shadow-[0_20px_80px_rgba(0,0,0,0.55)] md:p-5 ${
            tableShake ? "animate-[tableShake_340ms_ease-in-out]" : ""
          } ${slamZoom ? "animate-[slamZoom_320ms_ease-in-out]" : ""}`}
        >
          {slamFlash ? <div className="pointer-events-none absolute inset-0 z-30 rounded-[36px] bg-white/10 animate-[slamFlash_180ms_ease-out]" /> : null}
          {slamPulse ? (
            <div className="pointer-events-none absolute inset-0 z-20">
              <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/70 animate-[slamRipple_420ms_ease-out]" />
            </div>
          ) : null}
          <GameTableLayout
            gameState={game?.state}
            mySeat={mySeat}
            players={game?.players}
            trick={game?.state?.trick}
            playedCardFx={playedCardFx}
            potCents={game?.potCents}
            bookFx={bookFx}
          />
        </div>

        <div className="rounded-[28px] border border-white/15 bg-[linear-gradient(180deg,rgba(3,7,18,0.18),rgba(3,7,18,0.78)_22%,rgba(3,7,18,0.96))] px-3 py-6 shadow-[0_-14px_36px_rgba(0,0,0,0.4)] backdrop-blur-xl md:px-5 md:pt-7">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Your Seat</p>
              <h2 className="mt-1 text-lg font-bold text-white">Seat {mySeat || "-"}</h2>
              <p className="text-sm text-white/72">Bid: {bidForSeat(game?.state, mySeat) ?? "-"} | {myHand.length} cards</p>
            </div>
            <p className="max-w-lg text-sm text-white/78">
              {phase === "PLAYING"
                ? myTurn
                  ? "Your turn: tap a card in the hand dock to play."
                  : "Waiting for the current player. Your hand stays docked and readable."
                : phase === "BIDDING"
                  ? myTurn
                    ? "Choose your bid from the tray below. Your hand stays visible for quick reading."
                    : "Bidding is in progress. Review your hand while you wait."
                  : "The table is set. Start the game when everyone is ready."}
            </p>
          </div>

          {phase === "WAITING" || phase === "DEALING" ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="text-sm text-white/80">Game is waiting to begin.</p>
              <button disabled={submitting} onClick={startGameAction} className="rounded-xl bg-[linear-gradient(110deg,#22d3ee,#60a5fa,#34d399)] bg-[length:200%_200%] px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-[position:100%_0%] disabled:opacity-70">
                Start Game
              </button>
            </div>
          ) : null}

          {phase === "BIDDING" ? (
            <div className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {myHand.map((card) => (
                  <PlayingCard
                    key={cardId(card)}
                    card={card}
                    className={`h-20 min-w-14 ${themeClass[deckTheme]}`}
                    centerSuitClassName="text-[1.3rem] leading-none"
                    cornerClassName="text-[9px]"
                  />
                ))}
              </div>
              <p className="text-sm text-white/72">
                {myTurn ? "Your bid options are centered on screen." : "Waiting for the active player to choose a bid."}
              </p>
            </div>
          ) : null}

        </div>
      </section>

      {phase === "PLAYING" ? <HandDock cards={myHand} onPlayCard={(card, slam) => void playCardAction(card, slam)} isMyTurn={myTurn && !submitting} /> : null}

      {phase === "BIDDING" && myTurn ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-xl rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(7,18,32,0.98),rgba(6,13,24,0.96))] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200/70">Bidding</p>
            <h2 className="mt-2 text-3xl font-black text-white">Choose Your Bid</h2>
            <p className="mt-2 text-sm text-white/72">Select a value to submit immediately. Your hand stays visible underneath for reference.</p>

            <div className="mt-5 grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-7">
              {Array.from({ length: 14 }, (_, i) => i).map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setBidValue(String(n));
                    void submitBidAction();
                  }}
                  disabled={submitting}
                  className={`rounded-2xl border px-3 py-4 text-2xl font-black transition ${
                    bidValue === String(n)
                      ? "border-cyan-300 bg-cyan-400/20 text-white shadow-[0_0_24px_rgba(34,211,238,0.18)]"
                      : "border-white/15 bg-white/6 text-white hover:border-white/30 hover:bg-white/10"
                  } disabled:opacity-60`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto mt-3 max-w-7xl pb-36 text-sm text-white/80 md:pb-44">
        {message && <p className="text-cyan-200">{message}</p>}
        {error && <p className="text-rose-300">{error}</p>}
      </div>

      <style jsx global>{`
        @keyframes tableShake {
          0% { transform: translate(0, 0); }
          20% { transform: translate(6px, -3px); }
          40% { transform: translate(-6px, 3px); }
          60% { transform: translate(3px, -1px); }
          80% { transform: translate(-2px, 1px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes slamRipple {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.95; }
          100% { transform: translate(-50%, -50%) scale(2.3); opacity: 0; }
        }
        @keyframes slamZoom {
          0% { transform: scale(1); }
          45% { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
        @keyframes slamFlash {
          0% { opacity: 0; }
          30% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes fadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes deckFloat {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-3px) rotate(-1deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        @keyframes deckFloatAlt {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(2px) rotate(1deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        @keyframes bookToTopLeft {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-530px, -190px) scale(0.55); opacity: 0; }
        }
        @keyframes bookToTopRight {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(490px, -190px) scale(0.55); opacity: 0; }
        }
      `}</style>
    </main>
  );
}
