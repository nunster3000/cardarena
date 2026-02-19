"use client";

import { Space_Grotesk } from "next/font/google";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
};

type GamePayload = {
  id: string;
  status: string;
  phase: string;
  tournamentId: string;
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

const suitSymbol: Record<Card["suit"], string> = {
  SPADES: "\u2660",
  HEARTS: "\u2665",
  DIAMONDS: "\u2666",
  CLUBS: "\u2663",
};

const backClass: Record<DeckBack, string> = {
  emerald: "bg-[radial-gradient(circle_at_20%_20%,#34d399,#0f766e_55%,#062a24)]",
  cosmic: "bg-[radial-gradient(circle_at_20%_20%,#60a5fa,#2563eb_45%,#0b1024)]",
  carbon: "bg-[linear-gradient(135deg,#1f2937,#0f172a_45%,#111827)]",
};

const themeClass: Record<DeckTheme, string> = {
  classic: "from-white to-slate-100 text-slate-900",
  neon: "from-cyan-100 to-emerald-100 text-slate-900",
  midnight: "from-slate-200 to-slate-300 text-slate-900",
};

function cardId(card: Card) {
  return `${card.suit}-${card.rank}`;
}

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

function seatCardCount(state: GameState | undefined, seat: number) {
  if (!state) return 0;
  const hand = state.hands?.[String(seat)];
  if (!hand) return 0;
  if (Array.isArray(hand)) return hand.length;
  if (typeof hand === "object" && "count" in hand) return Number(hand.count) || 0;
  return 0;
}

function seatForPosition(mySeat: number, position: "top" | "right" | "bottom" | "left") {
  const base = [1, 2, 3, 4];
  const myIndex = Math.max(0, base.indexOf(mySeat || 1));
  const shift = myIndex - 2; // bottom position should always be the local player
  const posIndex = position === "top" ? 0 : position === "right" ? 1 : position === "bottom" ? 2 : 3;
  return base[(posIndex + shift + 4) % 4];
}

export default function PlayPage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params?.gameId;
  const router = useRouter();

  const [token, setToken] = useState("");
  const [game, setGame] = useState<GamePayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [bidValue, setBidValue] = useState("3");
  const [submitting, setSubmitting] = useState(false);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [dragCard, setDragCard] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0, active: false });
  const [holdReadyCard, setHoldReadyCard] = useState<string | null>(null);
  const [tableShake, setTableShake] = useState(false);
  const [slamPulse, setSlamPulse] = useState(false);
  const [spadeBreakFx, setSpadeBreakFx] = useState(false);
  const [deckBack, setDeckBack] = useState<DeckBack>("emerald");
  const [deckTheme, setDeckTheme] = useState<DeckTheme>("classic");
  const [socketConnected, setSocketConnected] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [sfxVolume, setSfxVolume] = useState(0.8);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const [spotlight, setSpotlight] = useState({ x: 50, y: 50, active: false });

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapRef = useRef<{ id: string; at: number } | null>(null);
  const downRef = useRef<{ id: string; x: number; y: number; at: number } | null>(null);
  const playZoneRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const prevSpadeBroken = useRef<boolean>(false);
  const slamAudioRef = useRef<HTMLAudioElement | null>(null);
  const spadeBreakAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);

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
        return { ...prev, state: nextState };
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
  const phase = game?.phase || "WAITING";
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
  const topSeat = seatForPosition(mySeat || 1, "top");
  const rightSeat = seatForPosition(mySeat || 1, "right");
  const bottomSeat = seatForPosition(mySeat || 1, "bottom");
  const leftSeat = seatForPosition(mySeat || 1, "left");
  const topCount = seatCardCount(game?.state, topSeat);
  const rightCount = seatCardCount(game?.state, rightSeat);
  const bottomCount = seatCardCount(game?.state, bottomSeat);
  const leftCount = seatCardCount(game?.state, leftSeat);

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
      const socket = getGameSocket(token);
      if (socket.connected) {
        socket.emit("place_bid", { gameId, bid: Number(bidValue) });
      } else {
        await api(`/api/v1/games/${gameId}/bid`, {
          method: "POST",
          body: JSON.stringify({ bid: Number(bidValue) }),
        });
      }
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
      if (slam) {
        setSlamPulse(true);
        setTableShake(true);
        playSfx("SLAM");
        if (navigator.vibrate) navigator.vibrate(28);
        setTimeout(() => setTableShake(false), 360);
        setTimeout(() => setSlamPulse(false), 420);
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
      setSelectedCard(null);
      setDragCard(null);
      setHoldReadyCard(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to play card");
      setSubmitting(false);
    } finally {
      setTimeout(() => setSubmitting(false), 500);
    }
  }

  function clearHold() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLButtonElement>, card: Card) {
    if (!myTurn || phase !== "PLAYING" || submitting) return;
    const id = cardId(card);
    const now = Date.now();
    const sameAsLastTap = tapRef.current && tapRef.current.id === id && now - tapRef.current.at < 320;
    tapRef.current = { id, at: now };
    setSelectedCard(id);
    downRef.current = { id, x: e.clientX, y: e.clientY, at: now };
    void unlockAudioIfNeeded();

    if (sameAsLastTap) {
      setDragCard(id);
      setDragPos({ x: 0, y: 0, active: false });
      setMessage("Slide card into center to play.");
    }

    clearHold();
    holdTimerRef.current = setTimeout(() => {
      setHoldReadyCard(id);
      setMessage("Slam ready: release to slam this card.");
      if (navigator.vibrate) navigator.vibrate(15);
    }, 360);
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLButtonElement>, card: Card) {
    const id = cardId(card);
    if (dragCard !== id || !downRef.current) return;
    const dx = e.clientX - downRef.current.x;
    const dy = e.clientY - downRef.current.y;
    setDragPos({ x: dx, y: dy, active: Math.abs(dx) + Math.abs(dy) > 12 });
  }

  function onCardPointerUp(e: React.PointerEvent<HTMLButtonElement>, card: Card) {
    const id = cardId(card);
    const down = downRef.current;
    const wasHoldReady = holdReadyCard === id;
    clearHold();

    if (wasHoldReady) {
      void playCardAction(card, true);
      setHoldReadyCard(null);
      downRef.current = null;
      return;
    }

    if (dragCard === id && dragPos.active && playZoneRef.current) {
      const rect = playZoneRef.current.getBoundingClientRect();
      const inZone =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      const nearCenter =
        Math.abs(e.clientX - (rect.left + rect.width / 2)) < 120 &&
        Math.abs(e.clientY - (rect.top + rect.height / 2)) < 120;
      if (inZone || nearCenter) {
        void playCardAction(card, false);
      }
    }

    if (down && Date.now() - down.at > 2000) {
      setMessage("Tip: double tap and slide, or press and hold to slam.");
    }
    setDragCard(null);
    setDragPos({ x: 0, y: 0, active: false });
    downRef.current = null;
  }

  function logout() {
    clearSession();
    router.replace("/");
  }

  function onTableMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = tableRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
    const y = (e.clientY - (rect.top + rect.height / 2)) / rect.height;
    setParallax({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    setSpotlight({
      x: Math.max(0, Math.min(100, px)),
      y: Math.max(0, Math.min(100, py)),
      active: true,
    });
  }

  return (
    <main className={`${space.className} min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_20%,#123f4e,#0b1f32_45%,#050b15)] px-4 py-4 text-white`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-2xl border border-white/15 bg-black/35 px-4 py-3 backdrop-blur-xl">
        <div>
          <p className="text-xs text-white/70">Game ID: {gameId}</p>
          <h1 className="text-lg font-bold">CardArena Table</h1>
          <p className="text-xs text-emerald-300">Tournament: {game?.tournamentId || "Loading..."}</p>
          <p className={`text-[11px] ${socketConnected ? "text-cyan-200" : "text-amber-300"}`}>
            {socketConnected ? "Realtime Connected" : "Realtime Reconnecting"}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <button onClick={() => router.push("/dashboard")} className="rounded bg-white/15 px-3 py-1 text-xs hover:bg-white/25">Dashboard</button>
          <button onClick={logout} className="rounded bg-red-500/30 px-3 py-1 text-xs hover:bg-red-500/40">Logout</button>
        </div>
      </div>

      <div
        ref={tableRef}
        onMouseMove={onTableMouseMove}
        onMouseLeave={() => {
          setParallax({ x: 0, y: 0 });
          setSpotlight((prev) => ({ ...prev, active: false }));
        }}
        className={`relative mx-auto mt-4 max-w-7xl rounded-[36px] border border-cyan-300/20 bg-[radial-gradient(circle_at_50%_50%,#0c5f59,#063244_55%,#051022)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.55)] ${tableShake ? "animate-[tableShake_360ms_ease]" : ""}`}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-[36px] transition-opacity duration-300"
          style={{
            opacity: spotlight.active ? 0.55 : 0.25,
            background: `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, rgba(125, 250, 235, 0.16), rgba(90, 190, 255, 0.07) 22%, rgba(2, 12, 26, 0) 46%)`,
          }}
        />
        <div className="pointer-events-none absolute inset-6 rounded-[30px] border border-white/10" />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center opacity-20 transition-transform duration-150"
          style={{
            transform: `translate3d(calc(-50% + ${parallax.x * 10}px), calc(-50% + ${parallax.y * 8}px), 0)`,
          }}
        >
          <Image
            src="/cardarena-logo.png"
            alt="CardArena"
            width={280}
            height={90}
            className="mx-auto object-contain"
          />
          <p className="mt-2 text-xs tracking-[0.6em] text-emerald-200">COMPETE</p>
        </div>

        {spadeBreakFx && (
          <div className="pointer-events-none absolute inset-0 z-30 animate-[fadeOut_1s_ease_forwards]">
            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/60 bg-cyan-200/10 blur-[1px]" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-8xl text-cyan-100">\u2660</div>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_35%,rgba(173,216,230,0.15)_36%,transparent_60%)]" />
          </div>
        )}

        {slamPulse && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/70 animate-[slamRipple_420ms_ease-out]" />
          </div>
        )}

        <div className="relative z-10 grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border border-white/15 bg-black/30 p-3">
            <p>Status: <span className="font-semibold">{game?.status || "..."}</span></p>
            <p>Phase: <span className="font-semibold">{phase}</span></p>
            <p>Your Seat: <span className="font-semibold">{mySeat || "-"}</span></p>
            <p>Turn: <span className={myTurn ? "font-semibold text-emerald-300" : "font-semibold"}>{game?.state?.currentTurnSeat ?? "-"}</span></p>
          </div>
          <div className="rounded-xl border border-white/15 bg-black/30 p-3">
            <p>Tricks</p>
            <p className="text-emerald-300">Team A: {game?.state?.teamATricks ?? 0}</p>
            <p className="text-blue-300">Team B: {game?.state?.teamBTricks ?? 0}</p>
            <p>Spades Broken: {game?.state?.spadesBroken ? "Yes" : "No"}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-black/30 p-3">
            <p>Scores</p>
            <p className="text-emerald-300">Team A: {game?.state?.teamAScore ?? 0}</p>
            <p className="text-blue-300">Team B: {game?.state?.teamBScore ?? 0}</p>
            <p>Completed Tricks: {game?.state?.completedTricks ?? 0}/13</p>
          </div>
        </div>

        <div className="relative mt-6 h-[380px] rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="absolute left-1/2 top-3 -translate-x-1/2 text-center">
            <p className="text-[11px] text-white/70">Seat {topSeat}{topSeat === mySeat ? " (You)" : ""}</p>
            <div className={`relative mx-auto mt-1 h-10 w-16 overflow-hidden rounded-md ${backClass[deckBack]} ring-1 ring-white/20`}>
              <Image src="/cardarena-logo.png" alt="CardArena card back" fill sizes="64px" className="object-contain opacity-35" />
            </div>
            <p className="mt-1 text-[10px] text-white/60">{topCount} cards</p>
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-center">
            <p className="text-[11px] text-white/70">Seat {rightSeat}{rightSeat === mySeat ? " (You)" : ""}</p>
            <div className={`relative mx-auto mt-1 h-16 w-10 overflow-hidden rounded-md ${backClass[deckBack]} ring-1 ring-white/20`}>
              <Image src="/cardarena-logo.png" alt="CardArena card back" fill sizes="40px" className="object-contain opacity-35" />
            </div>
            <p className="mt-1 text-[10px] text-white/60">{rightCount} cards</p>
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center">
            <p className="text-[11px] text-white/70">Seat {bottomSeat}{bottomSeat === mySeat ? " (You)" : ""}</p>
            <div className={`relative mx-auto mt-1 h-10 w-16 overflow-hidden rounded-md ${backClass[deckBack]} ring-1 ring-white/20`}>
              <Image src="/cardarena-logo.png" alt="CardArena card back" fill sizes="64px" className="object-contain opacity-35" />
            </div>
            <p className="mt-1 text-[10px] text-white/60">{bottomCount} cards</p>
          </div>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-center">
            <p className="text-[11px] text-white/70">Seat {leftSeat}{leftSeat === mySeat ? " (You)" : ""}</p>
            <div className={`relative mx-auto mt-1 h-16 w-10 overflow-hidden rounded-md ${backClass[deckBack]} ring-1 ring-white/20`}>
              <Image src="/cardarena-logo.png" alt="CardArena card back" fill sizes="40px" className="object-contain opacity-35" />
            </div>
            <p className="mt-1 text-[10px] text-white/60">{leftCount} cards</p>
          </div>

          <div
            className="pointer-events-none absolute left-[18%] top-[56%] z-0 hidden -translate-y-1/2 md:block"
            style={{
              transform: `translate3d(${parallax.x * 14}px, ${parallax.y * 10}px, 0) rotate(${parallax.x * 3}deg)`,
            }}
          >
            <div className={`relative h-20 w-14 rounded-md ${backClass[deckBack]} ring-1 ring-white/20 animate-[deckFloat_4.4s_ease-in-out_infinite]`}>
              <Image src="/cardarena-logo.png" alt="CardArena deck back" fill sizes="56px" className="object-contain opacity-35" />
            </div>
            <div className={`relative -mt-16 ml-1 h-20 w-14 rounded-md ${backClass[deckBack]} ring-1 ring-white/20 animate-[deckFloatAlt_4.9s_ease-in-out_infinite]`}>
              <Image src="/cardarena-logo.png" alt="CardArena deck back" fill sizes="56px" className="object-contain opacity-35" />
            </div>
            <div className={`relative -mt-16 ml-2 h-20 w-14 rounded-md ${backClass[deckBack]} ring-1 ring-white/20 animate-[deckFloat_5.6s_ease-in-out_infinite]`}>
              <Image src="/cardarena-logo.png" alt="CardArena deck back" fill sizes="56px" className="object-contain opacity-35" />
            </div>
          </div>

          <div
            ref={playZoneRef}
            className="absolute left-1/2 top-1/2 z-10 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/40 bg-black/25 transition-transform duration-100"
            style={{
              transform: `translate3d(calc(-50% + ${parallax.x * 6}px), calc(-50% + ${parallax.y * 5}px), 0)`,
            }}
          >
            <p className="pt-3 text-center text-[11px] text-cyan-200">Play Zone</p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 px-2">
              {(game?.state?.trick || []).map((c, idx) => (
                <div key={`${c.seat}-${idx}`} className={`h-16 w-11 rounded-md bg-gradient-to-b ${themeClass[deckTheme]} p-1 text-center shadow-md`}>
                  <p className={`text-[10px] ${suitColor(c.suit)}`}>{rankLabel(c.rank)}</p>
                  <p className={`text-xl leading-6 ${suitColor(c.suit)}`}>{suitSymbol[c.suit]}</p>
                  <p className="text-[9px] text-slate-600">S{c.seat}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
          {phase === "WAITING" || phase === "DEALING" ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-white/80">Game is waiting to begin.</p>
              <button disabled={submitting} onClick={startGameAction} className="rounded-lg bg-[linear-gradient(110deg,#22d3ee,#60a5fa,#34d399)] bg-[length:200%_200%] px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-[position:100%_0%] disabled:opacity-70">
                Start Game
              </button>
            </div>
          ) : null}

          {phase === "BIDDING" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-white/80">Bidding phase {myTurn ? "(your turn)" : ""}</p>
                <input value={bidValue} onChange={(e) => setBidValue(e.target.value)} type="number" min={0} max={13} className="w-20 rounded bg-white/10 px-2 py-1 text-sm ring-1 ring-white/20" />
                <button disabled={!myTurn || submitting} onClick={submitBidAction} className="rounded bg-emerald-500 px-3 py-1 text-sm font-semibold text-slate-900 disabled:opacity-50">
                  Submit Bid
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {myHand.map((card) => (
                  <div key={cardId(card)} className={`h-20 w-14 rounded-md bg-gradient-to-b ${themeClass[deckTheme]} p-1 text-center shadow-md ring-1 ring-black/20`}>
                    <p className={`text-[11px] ${suitColor(card.suit)}`}>{rankLabel(card.rank)}</p>
                    <p className={`text-xl leading-6 ${suitColor(card.suit)}`}>{suitSymbol[card.suit]}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {phase === "PLAYING" ? (
            <>
              <p className="mb-2 text-sm text-white/80">
                {myTurn ? "Your turn: double tap + slide to center, or press/hold then release to slam." : "Waiting for current player..."}
              </p>
              <div className="flex flex-wrap gap-2 pb-2">
                {myHand.map((card) => {
                  const id = cardId(card);
                  const isSelected = selectedCard === id;
                  const isDragging = dragCard === id;
                  return (
                    <button
                      key={id}
                      onPointerDown={(e) => onCardPointerDown(e, card)}
                      onPointerMove={(e) => onCardPointerMove(e, card)}
                      onPointerUp={(e) => onCardPointerUp(e, card)}
                      className={`relative h-24 w-16 rounded-md bg-gradient-to-b ${themeClass[deckTheme]} p-1 text-center shadow-md transition ${isSelected ? "ring-2 ring-cyan-300" : "ring-1 ring-black/20"} ${holdReadyCard === id ? "scale-105 ring-2 ring-emerald-300" : ""}`}
                      style={
                        isDragging
                          ? {
                              transform: `translate(${dragPos.x}px, ${dragPos.y}px) rotate(${dragPos.x / 8}deg)`,
                              zIndex: 40,
                            }
                          : undefined
                      }
                      disabled={!myTurn || submitting}
                    >
                      <p className={`text-[11px] ${suitColor(card.suit)}`}>{rankLabel(card.rank)}</p>
                      <p className={`text-2xl leading-7 ${suitColor(card.suit)}`}>{suitSymbol[card.suit]}</p>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="mx-auto mt-3 max-w-7xl text-sm text-white/80">
        {message && <p className="text-cyan-200">{message}</p>}
        {error && <p className="text-rose-300">{error}</p>}
      </div>

      <style jsx global>{`
        @keyframes tableShake {
          0% { transform: translate(0, 0); }
          25% { transform: translate(4px, -2px); }
          50% { transform: translate(-4px, 2px); }
          75% { transform: translate(2px, 1px); }
          100% { transform: translate(0, 0); }
        }
        @keyframes slamRipple {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.95; }
          100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
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
      `}</style>
    </main>
  );
}
