"use client";

import { Space_Grotesk } from "next/font/google";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clearSession, getSession, setRoleView } from "../../lib/session";

const space = Space_Grotesk({ subsets: ["latin"] });
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";
const AVATARS = ["ACE", "KING", "QUEEN", "JACK", "DICE", "ROCKET", "SHIELD", "STAR"];

type Me = {
  id: string;
  username: string;
  email: string;
  avatarPreset?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  wallet?: { balance: string | number; isFrozen: boolean } | null;
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

type LedgerEntry = {
  id: string;
  type: string;
  amount: string | number;
  balanceAfter: string | number;
  createdAt: string;
};

async function toDataUrl(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return `data:${file.type};base64,${btoa(binary)}`;
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
  const [depositAmount, setDepositAmount] = useState("1000");
  const [withdrawAmount, setWithdrawAmount] = useState("2500");
  const [bio, setBio] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isAdminAccount, setIsAdminAccount] = useState(false);

  const topFriends = useMemo(() => friends.filter((f) => f.isTop), [friends]);

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

  async function loadAll() {
    const [meData, online, friendData, tournamentData, ledgerData] = await Promise.all([
      api("/api/v1/users/me"),
      api("/api/v1/users/online/count"),
      api("/api/v1/users/friends"),
      api("/api/v1/tournaments"),
      api("/api/v1/users/me/ledger?take=15"),
    ]);

    setMe(meData);
    setBio(meData.bio || "");
    setOnlinePlayers(online.onlinePlayers || 0);
    setFriends(friendData.friends || []);
    setIncoming(friendData.incomingRequests || []);
    setTournaments(tournamentData.data || []);
    setLedger(ledgerData.entries || []);
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
    const interval = setInterval(() => {
      loadAll().catch(() => undefined);
    }, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
      const dataUrl = await toDataUrl(file);
      await saveProfile({ avatarUrl: dataUrl, avatarPreset: "", bio });
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
      const body = await api("/api/v1/deposits", {
        method: "POST",
        body: JSON.stringify({ amount: Number(depositAmount) }),
      });
      setMessage(
        body.clientSecret
          ? "Deposit initiated. Complete payment in Stripe checkout flow."
          : "Deposit request submitted."
      );
      await loadAll();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Deposit failed");
    }
  }

  async function withdraw() {
    try {
      const body = await api("/api/v1/withdrawals", {
        method: "POST",
        body: JSON.stringify({ amount: Number(withdrawAmount) }),
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

  function logout() {
    clearSession();
    router.replace("/login");
  }

  function switchToAdmin() {
    setRoleView("ADMIN");
    router.replace("/admin");
  }

  const avatar =
    me?.avatarUrl ||
    (me?.avatarPreset ? null : null);

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
            <div className="mt-3 flex items-center gap-3">
              {avatar ? (
                <Image src={avatar} alt="Avatar" width={64} height={64} unoptimized className="h-16 w-16 rounded-full border border-white/20 object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 text-2xl">
                  {me?.avatarPreset || "USER"}
                </div>
              )}
              <div>
                <p className="font-semibold">{me?.username}</p>
                <p className="text-xs text-white/70">{me?.email}</p>
                <p className="mt-1 text-xs text-emerald-300">{me?.wallet?.isFrozen ? "Wallet Frozen" : "Wallet Active"}</p>
              </div>
            </div>

            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Write your player bio..."
              className="mt-3 h-20 w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/20"
            />
            <button
              onClick={() => saveProfile({ bio })}
              className="mt-2 rounded-lg bg-white/15 px-3 py-2 text-sm hover:bg-white/25"
            >
              Save Bio
            </button>

            <p className="mt-4 text-xs text-white/70">Choose avatar preset</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {AVATARS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => saveProfile({ avatarPreset: icon, avatarUrl: "", bio })}
                  className="rounded-lg bg-white/10 py-2 text-xl hover:bg-white/20"
                >
                  {icon}
                </button>
              ))}
            </div>

            <label className="mt-3 block text-xs text-white/70">Or upload image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onAvatarUpload(file);
              }}
              className="mt-1 w-full text-xs text-white/80"
            />
            {uploading && <p className="mt-1 text-xs text-white/70">Uploading...</p>}
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
              <input
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/20 outline-none"
                placeholder="Deposit amount (cents)"
              />
              <button onClick={deposit} className="w-full rounded-lg bg-emerald-500 py-2 font-semibold text-black hover:bg-emerald-400">
                Deposit Funds
              </button>
              <input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/20 outline-none"
                placeholder="Withdraw amount (cents)"
              />
              <button onClick={withdraw} className="w-full rounded-lg bg-blue-500 py-2 font-semibold text-white hover:bg-blue-400">
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

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/15 bg-black/35 p-4 lg:col-span-2">
            <h2 className="text-lg font-bold">Tournament Tables</h2>
            <p className="text-xs text-white/70">
              Available entry tiers: $10, $20, $50 and more.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {tournaments.map((t) => (
                <div key={t.id} className="rounded-xl border border-white/15 bg-white/5 p-3">
                  <p className="text-sm font-semibold">${(t.entryFee / 100).toFixed(0)} Table</p>
                  <p className="text-xs text-white/70">Status: {t.status}</p>
                  <p className="text-xs text-white/70">Prize: ${(t.totalPrize / 100).toFixed(2)}</p>
                  <button
                    onClick={() => joinTournament(t.id)}
                    disabled={t.status !== "OPEN"}
                    className="mt-2 rounded-lg bg-emerald-500 px-3 py-1 text-sm font-semibold text-black disabled:opacity-50"
                  >
                    {t.status === "OPEN" ? "Join Table" : "Unavailable"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/15 bg-black/35 p-4">
            <h2 className="text-lg font-bold">Find Friends</h2>
            <div className="mt-3 flex gap-2">
              <input
                value={friendQuery}
                onChange={(e) => setFriendQuery(e.target.value)}
                className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/20 outline-none"
                placeholder="Search by username"
              />
              <button onClick={searchFriends} className="rounded-lg bg-white/15 px-3 py-2 text-sm">
                Search
              </button>
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-auto">
              {friendSearch.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-lg bg-white/10 p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${u.isOnline ? "bg-emerald-400" : "bg-white/40"}`} />
                    <span>{u.username}</span>
                  </div>
                  <button
                    onClick={() => friendAction("/api/v1/users/friends/request", "POST", { friendId: u.id })}
                    className="rounded bg-emerald-500/30 px-2 py-1 text-xs"
                  >
                    Add
                  </button>
                </div>
              ))}
              {!friendSearch.length && <p className="text-xs text-white/65">Search for players to build your network.</p>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}


