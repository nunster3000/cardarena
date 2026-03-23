"use client";

import { Space_Grotesk } from "next/font/google";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { closeGameSocket, getGameSocket } from "../../lib/socket";
import { clearSession, getSession, setRoleView } from "../../lib/session";

const space = Space_Grotesk({ subsets: ["latin"] });
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
const DAILY_DEPOSIT_LIMIT_CENTS = 50000;
const DAILY_WITHDRAW_LIMIT_CENTS = 50000;
const AVATARS = [
  { key: "ACE", label: "Ace", src: "/avatars/ace-spade.svg" },
  { key: "KING", label: "King", src: "/avatars/king-crown.svg" },
  { key: "QUEEN", label: "Queen", src: "/avatars/queen-heart.svg" },
  { key: "JACK", label: "Jack", src: "/avatars/jack-club.svg" },
  { key: "DICE", label: "Dice", src: "/avatars/dice.svg" },
  { key: "ROCKET", label: "Rocket", src: "/avatars/rocket.svg" },
  { key: "SHIELD", label: "Shield", src: "/avatars/shield.svg" },
  { key: "STAR", label: "Star", src: "/avatars/star.svg" },
];

type Me = {
  id: string;
  username: string;
  email: string;
  avatarPreset?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  wallet?: { balance: string | number; isFrozen: boolean } | null;
  stripeOnboarded?: boolean;
  stripeAccountId?: string | null;
};

type Friend = {
  id: string;
  username: string;
  avatarPreset?: string | null;
  avatarUrl?: string | null;
  isOnline: boolean;
  isTop: boolean;
};

type FriendSearch = {
  id: string;
  username: string;
  avatarPreset?: string | null;
  avatarUrl?: string | null;
  isOnline: boolean;
};

type TournamentRow = {
  id: string;
  entryFee: number;
  status: string;
  totalPrize: number;
};

type QueueMode = "RANDOMS" | "FRIENDS" | "BOTS";

type PartyMember = {
  userId: string;
  isReady: boolean;
  isLeader: boolean;
  user: {
    id: string;
    username: string;
    avatarPreset?: string | null;
    avatarUrl?: string | null;
    isOnline: boolean;
  } | null;
};

type PartyState = {
  id: string;
  leaderId: string;
  isLeader: boolean;
  queue: {
    status: "IDLE" | "SEARCHING" | "MATCHED";
    entryFee: number | null;
    startedAt: string | null;
    matchGameId: string | null;
  };
  members: PartyMember[];
};

type PartyInvite = {
  id: string;
  partyId: string;
  createdAt: string;
  from: {
    id: string;
    username: string;
    avatarPreset?: string | null;
    avatarUrl?: string | null;
    isOnline: boolean;
  } | null;
};

type ActiveGame = {
  id: string;
  status: string;
  phase: string;
  tournamentId: string;
  createdAt: string;
};

type LedgerEntry = {
  id: string;
  type: string;
  amount: string | number;
  balanceAfter: string | number;
  createdAt: string;
};

type UserNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
  payload?: {
    requestId?: string;
    inviteId?: string;
    partyId?: string;
    fromUserId?: string;
    fromUsername?: string;
  } | null;
};

async function toCroppedDataUrl(file: File, size = 800) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unable to read image"));
      img.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");

    const crop = Math.min(image.width, image.height);
    const sx = Math.floor((image.width - crop) / 2);
    const sy = Math.floor((image.height - crop) / 2);
    ctx.drawImage(image, sx, sy, crop, crop, 0, 0, size, size);

    let quality = 0.9;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > 280_000 && quality > 0.45) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [message, setMessage] = useState("");
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<Array<{ requestId: string; from: Friend }>>([]);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendSearch, setFriendSearch] = useState<FriendSearch[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [stripeReady, setStripeReady] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  const [queueingTableId, setQueueingTableId] = useState<string | null>(null);
  const [queueSeconds, setQueueSeconds] = useState(0);
  const [freeQueueMode, setFreeQueueMode] = useState<QueueMode>("RANDOMS");
  const [party, setParty] = useState<PartyState | null>(null);
  const [partyInvites, setPartyInvites] = useState<PartyInvite[]>([]);
  const [partyInviteTarget, setPartyInviteTarget] = useState("");
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const socketRef = useRef<ReturnType<typeof getGameSocket> | null>(null);
  const botFillRequestedRef = useRef(false);

  const topFriends = useMemo(() => friends.filter((f) => f.isTop), [friends]);
  const walletBalance = Number(me?.wallet?.balance || 0);
  const depositDollars = Number(depositAmount || 0);
  const withdrawDollars = Number(withdrawAmount || 0);
  const depositCents = Math.round(depositDollars * 100);
  const withdrawCents = Math.round(withdrawDollars * 100);
  const depositInvalid =
    !depositAmount ||
    Number.isNaN(depositDollars) ||
    depositCents < 1000 ||
    depositCents > DAILY_DEPOSIT_LIMIT_CENTS;
  const withdrawInvalid =
    !withdrawAmount ||
    Number.isNaN(withdrawDollars) ||
    withdrawCents < 2500 ||
    withdrawCents > DAILY_WITHDRAW_LIMIT_CENTS ||
    withdrawCents > walletBalance;

  async function api(path: string, init: RequestInit = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: "no-store",
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

  async function loadAll() {
    const [meData, online, friendData, tournamentData, ledgerData, partyData, notifyData, activeGameData] = await Promise.all([
      api("/api/v1/users/me"),
      api("/api/v1/users/online/count"),
      api("/api/v1/users/friends"),
      api("/api/v1/tournaments"),
      api("/api/v1/users/me/ledger?take=15"),
      api("/api/v1/party/me"),
      api("/api/v1/users/me/notifications?take=20"),
      api("/api/v1/games/me/active"),
    ]);

    setMe(meData);
    setOnlinePlayers(online.onlinePlayers || 0);
    setFriends(friendData.friends || []);
    setIncoming(friendData.incomingRequests || []);
    setTournaments(tournamentData.data || []);
    setLedger(ledgerData.entries || []);
    setParty(partyData.party || null);
    setPartyInvites(partyData.pendingInvites || []);
    setNotifications(notifyData.data || []);
    setActiveGame(activeGameData.data || null);
    setStripeReady(Boolean(meData.stripeOnboarded));
  }

  useEffect(() => {
    const session = getSession();
    if (!session.token) {
      router.replace("/login");
      return;
    }
    setIsAdminAccount(session.role === "ADMIN");
    if (session.activeRole !== "USER") {
      router.replace("/admin");
      return;
    }
    setToken(session.token);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    loadAll().catch((err: unknown) =>
      setMessage(err instanceof Error ? err.message : "Unable to load dashboard")
    );
    const pollMs = queueingTableId === "free" ? 2000 : 15000;
    const interval = setInterval(() => {
      loadAll().catch(() => undefined);
    }, pollMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, queueingTableId]);

  useEffect(() => {
    if (!token) return;
    if (queueingTableId !== "free") return;

    let canceled = false;
    const checkActive = async () => {
      try {
        const active = await api("/api/v1/games/me/active");
        const game = active?.data;
        if (!canceled && game?.id) {
          setMessage("Game is ready. Loading table...");
          enterGame(game.id);
        }
      } catch {
        // Keep trying while queueing.
      }
    };

    void checkActive();
    const interval = setInterval(() => {
      void checkActive();
    }, 1200);

    return () => {
      canceled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, queueingTableId]);

  async function saveProfile(payload: { avatarPreset?: string; avatarUrl?: string; bio?: string }) {
    try {
      await api("/api/v1/users/me/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      await loadAll();
      setMessage("Profile updated.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Profile update failed");
    }
  }

  async function onAvatarUpload(file: File) {
    try {
      setUploading(true);
      const dataUrl = await toCroppedDataUrl(file);
      await saveProfile({ avatarUrl: dataUrl, avatarPreset: "" });
    } finally {
      setUploading(false);
    }
  }

  async function searchFriends() {
    try {
      const result = await api(`/api/v1/users/friends/search?q=${encodeURIComponent(friendQuery)}`);
      setFriendSearch(result.data || []);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Search failed");
    }
  }

  async function friendAction(path: string, method: "POST" | "DELETE" = "POST", body?: object) {
    try {
      await api(path, { method, body: JSON.stringify(body || {}) });
      await loadAll();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Friend action failed");
    }
  }

  async function deposit() {
    try {
      if (depositInvalid) {
        setMessage("Deposit must be between $10 and daily max $500.");
        return;
      }
      const body = await api("/api/v1/deposits/checkout", {
        method: "POST",
        body: JSON.stringify({ amount: depositCents }),
      });
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      setMessage("Unable to open Stripe checkout.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Deposit failed");
    }
  }

  async function startPayoutVerification() {
    try {
      await api("/api/v1/connect/create-account", { method: "POST" });
      const onboard = await api("/api/v1/connect/onboard", { method: "POST" });
      if (onboard.url) {
        window.location.href = onboard.url;
        return;
      }
      setMessage("Unable to open Stripe onboarding.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to start payout verification");
    }
  }

  async function withdraw() {
    try {
      if (withdrawInvalid) {
        setMessage("Withdrawal must be at least $25, not exceed wallet balance, and stay within daily max $500.");
        return;
      }
      const body = await api("/api/v1/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amount: withdrawCents }),
      });
      setMessage(body.message || "Withdrawal requested.");
      await loadAll();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Withdrawal failed");
    }
  }

  async function joinTournament(id: string) {
    try {
      await api(`/api/v1/tournaments/${id}/enter`, { method: "POST" });
      setMessage("Joined tournament.");
      await loadAll();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to join table");
    }
  }

  async function partyAction(path: string, body: object = {}) {
    const result = await api(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    await loadAll();
    return result;
  }

  async function createParty() {
    try {
      await partyAction("/api/v1/party/create");
      setMessage("Party created.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to create party");
    }
  }

  async function inviteToParty(friendId: string) {
    try {
      await partyAction("/api/v1/party/invite", { friendId });
      setMessage("Party invite sent.");
      setPartyInviteTarget("");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to invite player");
    }
  }

  async function respondPartyInvite(inviteId: string, action: "ACCEPT" | "REJECT") {
    try {
      await partyAction(`/api/v1/party/invites/${inviteId}/respond`, { action });
      setMessage(action === "ACCEPT" ? "Joined party." : "Invite declined.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to respond to invite");
    }
  }

  async function dismissNotification(notificationId: string) {
    try {
      await api(`/api/v1/users/me/notifications/${notificationId}/dismiss`, { method: "POST" });
      await loadAll();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to dismiss notification");
    }
  }

  async function handleNotificationFriendRequest(notification: UserNotification, action: "accept" | "decline") {
    try {
      const requestId = notification.payload?.requestId;
      if (!requestId) {
        setMessage("Friend request details are unavailable.");
        return;
      }
      const endpointAction = action === "accept" ? "accept" : "reject";
      await friendAction(`/api/v1/users/friends/${requestId}/${endpointAction}`, "POST");
      await dismissNotification(notification.id);
      setMessage(action === "accept" ? "Friend request accepted." : "Friend request declined.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to process friend request");
    }
  }

  async function handleNotificationPartyInvite(notification: UserNotification, action: "ACCEPT" | "REJECT") {
    try {
      const inviteId = notification.payload?.inviteId;
      if (!inviteId) {
        setMessage("Party invite details are unavailable.");
        return;
      }
      await respondPartyInvite(inviteId, action);
      await dismissNotification(notification.id);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to process party invite");
    }
  }

  async function togglePartyReady(isReady: boolean) {
    try {
      await partyAction("/api/v1/party/ready", { isReady });
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to update readiness");
    }
  }

  async function leaveParty() {
    try {
      await partyAction("/api/v1/party/leave");
      setMessage("Left party.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to leave party");
    }
  }

  async function kickPartyMember(userId: string) {
    try {
      await partyAction("/api/v1/party/kick", { userId });
      setMessage("Player removed from party.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to remove player");
    }
  }

  async function queuePartyForFreeTable() {
    try {
      await partyAction("/api/v1/party/queue", { entryFee: 0 });
      setQueueingTableId("free");
      setQueueSeconds(0);
      setMessage("Party queue started for Free Table.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to queue party");
    }
  }

  async function cancelPartyQueue() {
    try {
      await partyAction("/api/v1/party/queue/cancel");
      setQueueingTableId(null);
      setQueueSeconds(0);
      setMessage("Party queue canceled.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to cancel party queue");
    }
  }

  function enterGame(gameId: string) {
    setQueueingTableId(null);
    setQueueSeconds(0);
    botFillRequestedRef.current = false;
    router.push(`/play/${gameId}`);
  }

  async function startFreeQueue() {
    if (!token) return;
    try {
      await api("/api/v1/games/queue/free", { method: "POST" });
      setQueueingTableId("free");
      setQueueSeconds(0);
      botFillRequestedRef.current = false;
      setMessage("Searching free table...");
      const socket = socketRef.current ?? getGameSocket(token);
      socketRef.current = socket;
      socket.emit("find_table", { entryFee: 0 });
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to start matchmaking");
    }
  }

  async function startFreeBotsGame() {
    if (!token) return;
    try {
      setQueueingTableId("free");
      setQueueSeconds(0);
      setMessage("Creating bot table...");
      const body = await api("/api/v1/games/queue/free/bots", { method: "POST" });
      if (body?.gameId) {
        setMessage("Bot table ready. Loading game...");
        enterGame(body.gameId);
        return;
      }
      throw new Error("Unable to create bot table");
    } catch (err: unknown) {
      setQueueingTableId(null);
      setQueueSeconds(0);
      setMessage(err instanceof Error ? err.message : "Unable to start bot game");
    }
  }

  async function cancelQueue() {
    try {
      socketRef.current?.emit("cancel_find_table", { entryFee: 0 });
      await api("/api/v1/games/queue/free/cancel", { method: "POST" });
      setQueueingTableId(null);
      setQueueSeconds(0);
      botFillRequestedRef.current = false;
      setMessage("Match search canceled.");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Unable to cancel matchmaking");
    }
  }

  function logout() {
    clearSession();
    router.replace("/");
  }

  function switchToAdmin() {
    setRoleView("ADMIN");
    router.replace("/admin");
  }

  const avatar =
    me?.avatarUrl ||
    (me?.avatarPreset ? null : null);
  const avatarPreset = AVATARS.find((a) => a.key === me?.avatarPreset);

  const freeTournament = tournaments.find((t) => t.entryFee === 0 && t.status === "OPEN");
  const canUseFriendsMode = Boolean(party && party.members.length > 1);
  const freeFriendsModeBlocked = freeQueueMode === "FRIENDS" && !canUseFriendsMode;
  const paidTableFees = [1000, 2000, 5000];
  const paidTables = paidTableFees.map((fee) => {
    const tournament =
      tournaments.find((t) => t.entryFee === fee && t.status === "OPEN") ||
      tournaments.find((t) => t.entryFee === fee) ||
      null;

    const canAfford = walletBalance >= fee;
    const isOpen = tournament?.status === "OPEN";

    return {
      key: `paid-${fee}`,
      label: `$${(fee / 100).toFixed(0)} Table`,
      fee,
      tournamentId: tournament?.id ?? null,
      status: tournament?.status ?? "COMING_SOON",
      canJoin: Boolean(tournament?.id && isOpen && canAfford),
      disabledReason: !tournament?.id
        ? "Coming soon"
        : !canAfford
          ? "Insufficient balance"
          : !isOpen
            ? "Unavailable"
            : "",
    };
  });

  useEffect(() => {
    if (!queueingTableId) return;
    const timer = setInterval(() => {
      setQueueSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [queueingTableId]);

  useEffect(() => {
    if (queueingTableId !== "free") return;
    if (queueSeconds >= 15 && !botFillRequestedRef.current) {
      botFillRequestedRef.current = true;
      setMessage("No live opponents found in 15s. Filling open seats with bots now.");
      api("/api/v1/games/queue/free/fill-bots", { method: "POST" })
        .then((body) => {
          if (body?.gameId) {
            setMessage("Bots seated. Loading table...");
            enterGame(body.gameId);
            return;
          }
          return api("/api/v1/games/me/active")
            .then((active) => {
              if (active?.data?.id) {
                setMessage("Game is ready. Loading table...");
                enterGame(active.data.id);
              }
            })
            .catch(() => undefined);
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueSeconds, queueingTableId]);

  useEffect(() => {
    if (!token) return;

    const socket = getGameSocket(token);
    socketRef.current = socket;

    const onMatchFound = (payload: { gameId?: string }) => {
      if (!payload?.gameId) return;
      setMessage("Match found. Loading table...");
      enterGame(payload.gameId);
    };

    const onSocketError = (payload: { message?: string }) => {
      setQueueingTableId(null);
      setQueueSeconds(0);
      setMessage(payload?.message || "Matchmaking connection error.");
    };

    socket.on("match_found", onMatchFound);
    socket.on("error", onSocketError);

    return () => {
      socket.off("match_found", onMatchFound);
      socket.off("error", onSocketError);
      closeGameSocket();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!party) return;
    if (party.queue.status === "MATCHED" && party.queue.matchGameId) {
      setQueueingTableId(null);
      setQueueSeconds(0);
      setMessage(`Party match found. Game ID: ${party.queue.matchGameId}`);
      enterGame(party.queue.matchGameId);
    }
    if (party.queue.status === "SEARCHING") {
      setQueueingTableId("free");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party]);

  useEffect(() => {
    if (queueingTableId !== "free") return;
    if (!activeGame?.id) return;
    setMessage("Game is ready. Loading table...");
    enterGame(activeGame.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGame?.id, queueingTableId]);

  return (
    <main className={`${space.className} relative min-h-screen overflow-hidden text-white`}>
      <div className="absolute inset-0 -z-20">
        <Image src="/hero-bg.png" alt="Background" fill priority sizes="100vw" className="h-full w-full object-cover opacity-60" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#0b1220]/70 via-[#0f172a]/70 to-[#052e2b]/70" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.2),transparent_45%),radial-gradient(circle_at_80%_60%,rgba(59,130,246,0.2),transparent_45%)]" />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="rounded-3xl border border-white/15 bg-black/35 p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold">Player Control Center</h1>
              <p className="text-sm text-white/80">
                Welcome, <span className="font-semibold text-emerald-300">{me?.username || "Player"}</span>
              </p>
              <p className="text-sm text-white/70">
                Online Players: <span className="font-semibold text-emerald-300">{onlinePlayers}</span>
              </p>
            </div>
            <div className="flex gap-2">
              {activeGame?.id && (
                <button
                  onClick={() => enterGame(activeGame.id)}
                  className="rounded-xl bg-[linear-gradient(110deg,#22d3ee,#60a5fa,#34d399)] bg-[length:200%_200%] px-4 py-2 text-sm font-semibold text-slate-950 transition-all duration-300 hover:bg-[position:100%_0%]"
                >
                  Resume Game
                </button>
              )}
              {isAdminAccount && (
                <button
                  onClick={switchToAdmin}
                  className="rounded-xl bg-blue-500/30 px-4 py-2 text-sm hover:bg-blue-500/40"
                >
                  Admin View
                </button>
              )}
              <button onClick={logout} className="rounded-xl bg-red-500/30 px-4 py-2 text-sm hover:bg-red-500/40">
                Logout
              </button>
            </div>
          </div>
          {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
        </header>

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/15 bg-black/35 p-4">
            <h2 className="text-lg font-bold">My Profile</h2>
            <div className="mt-3 flex items-start gap-4">
              {avatar ? (
                <Image src={avatar} alt="Avatar" width={112} height={112} unoptimized className="h-28 w-28 rounded-full border border-white/20 object-cover" />
              ) : avatarPreset ? (
                <Image src={avatarPreset.src} alt={avatarPreset.label} width={112} height={112} className="h-28 w-28 rounded-full border border-white/20 bg-white/10 object-cover" />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl">
                  {me?.avatarPreset || "USER"}
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold">{me?.username}</p>
                <p className="text-xs text-white/70">{me?.email}</p>
                <p className="mt-1 text-xs text-emerald-300">{me?.wallet?.isFrozen ? "Wallet Frozen" : "Wallet Active"}</p>
                <label className="mt-3 block text-xs text-white/70">Upload profile photo (auto-cropped to 800x800)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onAvatarUpload(file);
                  }}
                  className="mt-1 w-full text-xs text-white/80"
                />
                {uploading && <p className="mt-1 text-xs text-white/70">Processing photo...</p>}
              </div>
            </div>

            <p className="mt-4 text-xs text-white/70">Choose avatar preset</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {AVATARS.map((icon) => (
                <button
                  key={icon.key}
                  onClick={() => saveProfile({ avatarPreset: icon.key, avatarUrl: "" })}
                  className="rounded-lg bg-white/10 p-2 text-xs hover:bg-white/20"
                >
                  <Image src={icon.src} alt={icon.label} width={48} height={48} className="mx-auto h-12 w-12 rounded-full object-cover" />
                  <span className="mt-1 block">{icon.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/35 p-4">
            <h2 className="text-lg font-bold">Top Friends</h2>
            <p className="text-xs text-white/70">Pin up to 8 players to your top list.</p>
            <div className="mt-3 space-y-2">
              {topFriends.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg bg-white/10 p-2">
                  <div className="flex items-center gap-2">
                    {f.avatarUrl ? (
                      <Image src={f.avatarUrl} alt={f.username} width={32} height={32} unoptimized className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm">
                        {f.avatarPreset || "USER"}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold">{f.username}</p>
                      <p className="text-[11px] text-white/70">
                        <span className={`mr-1 inline-block h-2 w-2 rounded-full ${f.isOnline ? "bg-emerald-400" : "bg-white/40"}`} />
                        {f.isOnline ? "Online" : "Offline"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => friendAction(`/api/v1/users/friends/${f.id}/top`, "POST", { isTop: false })}
                    className="rounded bg-white/15 px-2 py-1 text-xs"
                  >
                    Unpin
                  </button>
                </div>
              ))}
              {!topFriends.length && <p className="text-xs text-white/65">No top friends selected yet.</p>}
            </div>

            <h3 className="mt-4 text-sm font-semibold">Incoming Requests</h3>
            <div className="mt-2 space-y-2">
              {incoming.map((req) => (
                <div key={req.requestId} className="flex items-center justify-between rounded-lg bg-white/10 p-2 text-sm">
                  <span>{req.from.username}</span>
                  <div className="space-x-2">
                    <button
                      onClick={() => friendAction(`/api/v1/users/friends/${req.requestId}/accept`)}
                      className="rounded bg-emerald-500/30 px-2 py-1 text-xs"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => friendAction(`/api/v1/users/friends/${req.requestId}/reject`)}
                      className="rounded bg-red-500/30 px-2 py-1 text-xs"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
              {!incoming.length && <p className="text-xs text-white/65">No incoming requests.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/35 p-4">
            <h2 className="text-lg font-bold">Wallet Control</h2>
            <p className="mt-1 text-xs text-white/70">
              Balance: <span className="font-semibold">${Number(me?.wallet?.balance || 0).toFixed(2)}</span>
            </p>
            <div className="mt-3 space-y-2">
              <button
                onClick={startPayoutVerification}
                className="w-full rounded-lg bg-white/15 py-2 text-sm font-semibold text-white hover:bg-white/25"
              >
                {stripeReady ? "Payout Verification Complete" : "Verify Payout Identity (Stripe)"}
              </button>
              <p className="text-xs text-white/70">
                {stripeReady
                  ? "Your Stripe payout profile is active."
                  : "Required before withdrawals are processed."}
              </p>
              <input
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                type="number"
                step="0.01"
                min={10}
                max={DAILY_DEPOSIT_LIMIT_CENTS / 100}
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/20 outline-none"
                placeholder="Deposit amount ($)"
              />
              <p className="text-[11px] text-white/50">Daily deposit max: $500.00</p>
              {depositAmount && depositInvalid && (
                <p className="text-[11px] text-amber-300">Enter a valid amount between $10.00 and $500.00.</p>
              )}
              <button
                onClick={deposit}
                disabled={depositInvalid}
                className="w-full rounded-lg bg-emerald-500 py-2 font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-500/50 disabled:text-slate-200"
              >
                Deposit Funds
              </button>
              <input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                type="number"
                step="0.01"
                min={25}
                max={DAILY_WITHDRAW_LIMIT_CENTS / 100}
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/20 outline-none"
                placeholder="Withdraw amount ($)"
              />
              <p className="text-[11px] text-white/50">Daily withdrawal max: $500.00 · Available now: ${(walletBalance / 100).toFixed(2)}</p>
              {withdrawAmount && withdrawInvalid && (
                <p className="text-[11px] text-amber-300">Enter at least $25.00 and no more than your available balance or $500.00 daily.</p>
              )}
              <button
                onClick={withdraw}
                disabled={withdrawInvalid || !stripeReady}
                className="w-full rounded-lg bg-blue-500 py-2 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-500/50 disabled:text-slate-200"
              >
                Withdraw Funds
              </button>
            </div>

            <h3 className="mt-4 text-sm font-semibold">Recent Wallet Activity</h3>
            <div className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
              {ledger.map((l) => (
                <div key={l.id} className="rounded bg-white/10 p-2">
                  <p className="font-semibold">{l.type}</p>
                  <p>Amount: {Number(l.amount).toFixed(2)}</p>
                  <p>Balance: {Number(l.balanceAfter).toFixed(2)}</p>
                </div>
              ))}
              {!ledger.length && <p className="text-white/70">No entries yet.</p>}
            </div>
          </div>
        </section>

        <section className="mt-4">
          <div className="rounded-2xl border border-white/15 bg-black/35 p-4">
            <h2 className="text-lg font-bold">Notification Center</h2>
            <p className="text-xs text-white/70">Deposits, withdrawals, freezes, friend requests, and policy alerts.</p>
            <div className="mt-3 max-h-64 space-y-2 overflow-auto">
              {notifications.map((n) => (
                <div key={n.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-xs text-white/80">{n.message}</p>
                  <p className="mt-1 text-[11px] text-white/60">{new Date(n.createdAt).toLocaleString()} · {n.status}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {n.type === "FRIEND_REQUEST" && n.payload?.requestId && (
                      <>
                        <button
                          onClick={() => handleNotificationFriendRequest(n, "accept")}
                          className="rounded bg-emerald-500/30 px-2 py-1 text-[11px] hover:bg-emerald-500/40"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleNotificationFriendRequest(n, "decline")}
                          className="rounded bg-red-500/30 px-2 py-1 text-[11px] hover:bg-red-500/40"
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {n.type === "PARTY_INVITE" && n.payload?.inviteId && (
                      <>
                        <button
                          onClick={() => handleNotificationPartyInvite(n, "ACCEPT")}
                          className="rounded bg-emerald-500/30 px-2 py-1 text-[11px] hover:bg-emerald-500/40"
                        >
                          Join
                        </button>
                        <button
                          onClick={() => handleNotificationPartyInvite(n, "REJECT")}
                          className="rounded bg-white/15 px-2 py-1 text-[11px] hover:bg-white/25"
                        >
                          Ignore
                        </button>
                      </>
                    )}
                    {n.type !== "FRIEND_REQUEST" && n.type !== "PARTY_INVITE" && (
                      <button
                        onClick={() => dismissNotification(n.id)}
                        className="rounded bg-white/15 px-2 py-1 text-[11px] hover:bg-white/25"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!notifications.length && <p className="text-xs text-white/65">No notifications yet.</p>}
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
          <div className="rounded-[28px] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(217,70,239,0.16),transparent_24%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(8,15,34,0.96))] p-4 shadow-[0_20px_60px_rgba(8,15,34,0.35)]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70">Arena Select</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">Choose Your Table</h2>
                <p className="mt-1 text-sm text-white/70">Turn the lobby into bold, game-like mode cards with one featured lane and fast-tap queue options.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <div className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                  {onlinePlayers} players online
                </div>
                <div className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-cyan-100">
                  {party ? `${party.members.length}/4 in party` : "Party queue ready"}
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-[24px] border border-cyan-300/25 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-3 backdrop-blur-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200/65">Squad Lobby</p>
                  <h3 className="mt-1 text-sm font-semibold">Party Controls</h3>
                </div>
                {!party ? (
                  <button
                    onClick={createParty}
                    className="rounded-xl bg-[linear-gradient(110deg,#22d3ee,#60a5fa,#34d399)] bg-[length:200%_200%] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition-all duration-300 hover:bg-[position:100%_0%]"
                  >
                    Create Party
                  </button>
                ) : (
                  <button onClick={leaveParty} className="rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] hover:bg-white/25">
                    {party.isLeader && party.members.length > 1 ? "Disband/Leave" : "Leave Party"}
                  </button>
                )}
              </div>

              {party ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-white/70">
                    Leader:{" "}
                    <span className="font-semibold text-emerald-300">
                      {party.members.find((m) => m.isLeader)?.user?.username || "Unknown"}
                    </span>
                  </p>
                  <div className="space-y-1">
                    {party.members.map((m) => (
                      <div key={m.userId} className="flex items-center justify-between rounded-lg bg-white/10 px-2 py-1 text-xs">
                        <span>
                          {m.user?.username || "Player"} {m.isLeader ? "(Leader)" : ""}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={m.isReady ? "text-emerald-300" : "text-amber-300"}>
                            {m.isReady ? "Ready" : "Not Ready"}
                          </span>
                          {m.userId === me?.id && (
                            <button
                              onClick={() => togglePartyReady(!m.isReady)}
                              className="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25"
                            >
                              {m.isReady ? "Unready" : "Ready"}
                            </button>
                          )}
                          {party.isLeader && m.userId !== me?.id && (
                            <button
                              onClick={() => kickPartyMember(m.userId)}
                              className="rounded bg-red-500/30 px-2 py-0.5 hover:bg-red-500/40"
                            >
                              Kick
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {party.isLeader && (
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={partyInviteTarget}
                        onChange={(e) => setPartyInviteTarget(e.target.value)}
                        className="min-w-44 rounded-lg bg-white/10 px-2 py-1 text-xs ring-1 ring-white/20 outline-none"
                      >
                        <option value="">Invite a friend...</option>
                        {friends
                          .filter((f) => !party.members.some((m) => m.userId === f.id))
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.username}
                            </option>
                          ))}
                      </select>
                      <button
                        disabled={!partyInviteTarget}
                        onClick={() => partyInviteTarget && inviteToParty(partyInviteTarget)}
                        className="rounded bg-white/15 px-3 py-1 text-xs hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Send Invite
                      </button>
                      {party.queue.status === "SEARCHING" ? (
                        <button
                          onClick={cancelPartyQueue}
                          className="rounded bg-red-500/30 px-3 py-1 text-xs hover:bg-red-500/40"
                        >
                          Cancel Party Queue
                        </button>
                      ) : null}
                      {party.queue.status === "MATCHED" && party.queue.matchGameId ? (
                        <button
                          onClick={() => enterGame(party.queue.matchGameId!)}
                          className="rounded bg-[linear-gradient(110deg,#22d3ee,#60a5fa,#34d399)] bg-[length:200%_200%] px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-[position:100%_0%]"
                        >
                          Enter Match
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-white/70">Create a party to queue with friends. Party leader controls queue.</p>
              )}

              {partyInvites.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-semibold">Party Invites</p>
                  {partyInvites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between rounded bg-white/10 px-2 py-1 text-xs">
                      <span>{inv.from?.username || "Player"} invited you</span>
                      <div className="flex gap-2">
                        <button onClick={() => respondPartyInvite(inv.id, "ACCEPT")} className="rounded bg-emerald-500/30 px-2 py-0.5">
                          Accept
                        </button>
                        <button onClick={() => respondPartyInvite(inv.id, "REJECT")} className="rounded bg-red-500/30 px-2 py-0.5">
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[26px] border border-emerald-300/35 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.24),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.2),transparent_24%),linear-gradient(135deg,rgba(6,78,59,0.72),rgba(14,116,144,0.42),rgba(15,23,42,0.92))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_20px_45px_rgba(5,46,22,0.3)] md:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">Featured Mode</p>
                    <p className="mt-2 text-3xl font-black leading-none sm:text-4xl">Free Table</p>
                    <p className="mt-2 max-w-xl text-sm text-emerald-50/80">
                      Make this the main destination on the screen, closer to the Spades app’s big play card.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-white/15 bg-slate-950/25 px-4 py-3 text-right backdrop-blur-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">Live Lobby</p>
                    <p className="mt-1 text-3xl font-black text-white">{onlinePlayers}</p>
                    <p className="text-xs text-white/65">players online</p>
                  </div>
                </div>
                <p className="mt-1 text-xs text-white/70">
                  Active/Waiting players: <span className="font-semibold text-emerald-300">{onlinePlayers}</span>
                </p>
                <div className="mt-4 rounded-[22px] border border-white/15 bg-slate-950/25 p-3 text-xs text-white/75 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">Queue Mode</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["RANDOMS", "FRIENDS", "BOTS"] as QueueMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setFreeQueueMode(mode)}
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${freeQueueMode === mode ? "border border-white/30 bg-white/20 text-white shadow-[0_0_24px_rgba(255,255,255,0.08)]" : "border border-white/10 bg-white/10 text-white/80 hover:bg-white/15"}`}
                      >
                        {mode === "RANDOMS" ? "Randoms" : mode === "FRIENDS" ? "Invite Friends" : "Bots"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-white/80">
                    {queueingTableId === "free"
                      ? `Searching... ${queueSeconds}s`
                      : "Bots auto-fill open seats after 15s."}
                  </p>
                  {queueingTableId === "free" ? (
                    <button
                      onClick={() => {
                        if (freeQueueMode === "FRIENDS" && party?.isLeader) {
                          cancelPartyQueue();
                          return;
                        }
                        cancelQueue();
                      }}
                      className="rounded-2xl border border-white/20 bg-slate-950/35 px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white hover:bg-white/15"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      disabled={freeFriendsModeBlocked}
                      onClick={() => {
                        if (freeQueueMode === "FRIENDS") {
                          if (!party) {
                            setMessage("Create a party first, then invite friends.");
                            return;
                          }
                          if (!party.isLeader) {
                            setMessage("Only the party leader can queue the party.");
                            return;
                          }
                          queuePartyForFreeTable();
                          return;
                        }
                        if (freeQueueMode === "BOTS") {
                          startFreeBotsGame();
                          return;
                        }
                        startFreeQueue();
                      }}
                      className="rounded-2xl bg-[linear-gradient(180deg,#9efc4f,#58d61c_55%,#2d9f10)] px-7 py-4 text-lg font-black uppercase tracking-[0.18em] text-slate-950 shadow-[0_10px_30px_rgba(124,252,0,0.35)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:bg-slate-500/50 disabled:text-slate-200 disabled:shadow-none"
                    >
                      Play Now
                    </button>
                  )}
                </div>
                {freeFriendsModeBlocked && (
                  <p className="mt-2 text-xs text-amber-300">Create a party with at least one friend to use Invite Friends mode.</p>
                )}
                {freeQueueMode === "FRIENDS" && party && (
                  <p className="mt-2 text-xs text-cyan-300">
                    Party status: {party.queue.status}
                    {party.queue.matchGameId ? ` | Match ID: ${party.queue.matchGameId}` : ""}
                  </p>
                )}
              </div>

              {paidTables.map((t, index) => {
                const themes = [
                  "border-fuchsia-300/30 bg-[radial-gradient(circle_at_25%_15%,rgba(244,114,182,0.28),transparent_24%),linear-gradient(180deg,rgba(88,28,135,0.88),rgba(30,27,75,0.95))]",
                  "border-rose-300/30 bg-[radial-gradient(circle_at_30%_15%,rgba(251,191,36,0.28),transparent_22%),linear-gradient(180deg,rgba(153,27,27,0.88),rgba(69,10,10,0.95))]",
                  "border-amber-200/30 bg-[radial-gradient(circle_at_30%_15%,rgba(253,224,71,0.26),transparent_22%),linear-gradient(180deg,rgba(120,53,15,0.9),rgba(41,37,36,0.96))]",
                ];
                return (
                  <div
                    key={t.key}
                    className={`rounded-[26px] border p-4 shadow-[0_18px_40px_rgba(2,6,23,0.35)] ${themes[index % themes.length]}`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">Competitive</p>
                    <p className="mt-2 text-3xl font-black text-white">{t.label}</p>
                    <p className="mt-3 text-sm text-white/80">{onlinePlayers} players watching this lane</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-white/55">{t.status.replaceAll("_", " ")}</p>
                    <button
                      onClick={() => t.tournamentId && joinTournament(t.tournamentId)}
                      disabled={!t.canJoin}
                      className="mt-8 w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-3 text-base font-black uppercase tracking-[0.16em] text-white backdrop-blur-sm transition hover:bg-black/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/55"
                    >
                      {t.canJoin ? "Enter" : t.disabledReason}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/15 bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(11,18,32,0.95))] p-4 shadow-[0_18px_40px_rgba(2,6,23,0.28)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/65">Social</p>
            <h2 className="mt-1 text-lg font-black">Find Friends</h2>
            <div className="mt-3 flex gap-2">
              <input
                value={friendQuery}
                onChange={(e) => setFriendQuery(e.target.value)}
                className="w-full rounded-xl bg-white/10 px-3 py-2.5 text-sm ring-1 ring-white/20 outline-none"
                placeholder="Search by username"
              />
              <button onClick={searchFriends} className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/20">
                Search
              </button>
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-auto">
              {friendSearch.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${u.isOnline ? "bg-emerald-400" : "bg-white/40"}`} />
                    <span>{u.username}</span>
                  </div>
                  <button
                    onClick={() => friendAction("/api/v1/users/friends/request", "POST", { friendId: u.id })}
                    className="rounded-lg bg-emerald-500/25 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/35"
                  >
                    Add
                  </button>
                </div>
              ))}
              {!friendSearch.length && <p className="text-xs text-white/65">Search for players to build your network.</p>}
            </div>
          </div>
        </section>

        {queueingTableId === "free" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm">
            <div className="w-[92%] max-w-md rounded-2xl border border-emerald-300/30 bg-slate-900/90 p-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Searching Free Table</p>
              <h3 className="mt-2 text-2xl font-extrabold">Waiting For Opponents</h3>
              <p className="mt-2 text-sm text-white/75">
                {queueSeconds < 15
                  ? `Queue time: ${queueSeconds}s`
                  : "No full lobby yet. Filling open seats with bots..."}
              </p>
              <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[linear-gradient(110deg,#22d3ee,#60a5fa,#34d399)] transition-all"
                  style={{ width: `${Math.min(100, (queueSeconds / 15) * 100)}%` }}
                />
              </div>
              <button
                onClick={() => {
                  if (freeQueueMode === "FRIENDS" && party?.isLeader) {
                    cancelPartyQueue();
                    return;
                  }
                  cancelQueue();
                }}
                className="mt-5 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
              >
                Cancel Search
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


