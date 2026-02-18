"use client";

import { Space_Grotesk } from "next/font/google";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clearSession, getSession, setRoleView } from "../../lib/session";

const space = Space_Grotesk({ subsets: ["latin"] });
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

type AdminUser = {
  id: string;
  email: string;
  username: string;
  role: string;
  signupStatus?: "PENDING" | "APPROVED" | "WAITLISTED";
  isFrozen: boolean;
  frozenReason?: string | null;
  wallet?: {
    balance: string | number;
    isFrozen: boolean;
    frozenReason?: string | null;
  } | null;
  totalDeposits: number;
  totalWithdrawals: number;
};

type GameRow = {
  id: string;
  status: string;
  phase: string;
  potSize: number;
  tournamentId: string;
  players: Array<{
    seat: number;
    isBot: boolean;
    user?: { id: string; username?: string | null; email?: string | null } | null;
  }>;
};

type FlagRow = {
  id: string;
  type: string;
  severity: string;
  reason: string;
  status: string;
  createdAt: string;
  user?: { id: string; username?: string | null; email?: string | null } | null;
};

type Overview = {
  activeGames: number;
  openFlags: number;
  highFlags: number;
  blockedUsers: number;
  heldWithdrawals: number;
  totalUserWalletBalance: number | string;
};

type LedgerRow = {
  id: string;
  type: string;
  amount: number | string;
  balanceAfter: number | string;
  reason?: string | null;
  createdAt: string;
};

type SuspiciousWallet = {
  walletId: string;
  user?: { id: string; username?: string | null; email?: string | null } | null;
  txCount24h: number;
  netAmount24h: number | string;
};

type AdminNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
  user?: {
    id: string;
    username?: string | null;
    email?: string | null;
    signupStatus?: string | null;
  } | null;
};

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

async function apiRequest(
  path: string,
  token: string,
  options: RequestInit = {}
) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return body;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "wallets" | "games" | "settings" | "risk" | "notifications">("overview");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [suspiciousWallets, setSuspiciousWallets] = useState<SuspiciousWallet[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [gameStatus, setGameStatus] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const [registrationsOpen, setRegistrationsOpen] = useState(true);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  useEffect(() => {
    const { token: storedToken, role, activeRole } = getSession();
    if (!storedToken) {
      router.replace("/login");
      return;
    }
    if (role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
    if (activeRole !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }
    setToken(storedToken);
  }, [router]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  async function refreshAll(authToken = token) {
    if (!authToken) return;
    try {
      const [o, u, sw, g, s, f, n] = await Promise.all([
        apiRequest("/api/v1/admin/risk/overview", authToken),
        apiRequest("/api/v1/admin/users", authToken),
        apiRequest("/api/v1/admin/wallets/suspicious", authToken),
        apiRequest(`/api/v1/admin/games?status=${gameStatus}`, authToken),
        apiRequest("/api/v1/admin/settings/registrations", authToken),
        apiRequest("/api/v1/admin/risk/flags?status=OPEN&take=50", authToken),
        apiRequest("/api/v1/admin/notifications?status=OPEN&take=50", authToken),
      ]);

      setOverview(o);
      setUsers(u.data || []);
      setSuspiciousWallets(sw.data || []);
      setGames(g.data || []);
      setRegistrationsOpen(Boolean(s.registrationsOpen));
      setFlags(f.data || []);
      setNotifications(n.data || []);
    } catch (err: unknown) {
      setMessage(getErrorMessage(err, "Unable to load dashboard data"));
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, gameStatus]);

  async function loadLedger(userId: string) {
    try {
      const data = await apiRequest(`/api/v1/admin/wallets/${userId}/ledger`, token);
      setLedger(data.ledger || []);
      setSelectedUserId(userId);
      setActiveTab("wallets");
    } catch (err: unknown) {
      setMessage(getErrorMessage(err, "Failed to load wallet ledger"));
    }
  }

  async function callAction(path: string, payload: Record<string, unknown> = {}) {
    try {
      await apiRequest(path, token, { method: "POST", body: JSON.stringify(payload) });
      await refreshAll();
      if (selectedUserId) await loadLedger(selectedUserId);
      setMessage("Action completed.");
    } catch (err: unknown) {
      setMessage(getErrorMessage(err, "Action failed"));
    }
  }

  async function updateRegistrations(nextValue: boolean) {
    try {
      await apiRequest("/api/v1/admin/settings/registrations", token, {
        method: "PUT",
        body: JSON.stringify({ registrationsOpen: nextValue }),
      });
      setRegistrationsOpen(nextValue);
      setMessage(`Registrations ${nextValue ? "opened" : "closed"}.`);
    } catch (err: unknown) {
      setMessage(getErrorMessage(err, "Unable to update setting"));
    }
  }

  async function manualAdjust() {
    if (!selectedUserId) return setMessage("Select a user first.");
    const parsed = Number(adjustAmount);
    if (!parsed) return setMessage("Enter a non-zero amount in cents.");
    if (!adjustReason.trim()) return setMessage("Reason is required.");

    try {
      await apiRequest(`/api/v1/admin/wallets/${selectedUserId}/adjust`, token, {
        method: "POST",
        body: JSON.stringify({ amount: parsed, reason: adjustReason }),
      });
      setAdjustAmount("");
      setAdjustReason("");
      await refreshAll();
      await loadLedger(selectedUserId);
      setMessage("Manual adjustment recorded.");
    } catch (err: unknown) {
      setMessage(getErrorMessage(err, "Manual adjustment failed"));
    }
  }

  function logout() {
    clearSession();
    setToken("");
    router.replace("/login");
  }

  function switchToPlayerView() {
    setRoleView("USER");
    router.replace("/dashboard");
  }

  if (!token) {
    return (
      <main className={`${space.className} min-h-screen bg-[linear-gradient(135deg,#0b132b,#0e1f35,#113c3a)] text-white flex items-center justify-center px-6`}>
        <div className="w-full max-w-md rounded-3xl border border-white/20 bg-black/35 backdrop-blur-xl p-8 shadow-2xl">
          <h1 className="text-3xl font-bold tracking-tight">Admin Portal</h1>
          <p className="mt-2 text-sm text-white/70">Checking your session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`${space.className} relative min-h-screen overflow-hidden text-white`}>
      <div className="absolute inset-0 -z-20">
        <Image src="/hero-bg.png" alt="Background" fill priority sizes="100vw" className="h-full w-full object-cover opacity-55" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#0b1220]/80 via-[#0f172a]/70 to-[#052e2b]/75" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.16),transparent_40%),radial-gradient(circle_at_78%_35%,rgba(59,130,246,0.16),transparent_40%)]" />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="rounded-3xl border border-white/15 bg-black/30 p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">CardArena Admin Dashboard</h1>
              <p className="text-sm text-white/70">Users, wallets, games, fraud controls, and beta settings</p>
            </div>
            <div className="flex gap-2">
              <button onClick={switchToPlayerView} className="rounded-xl border border-blue-300/40 bg-blue-500/20 px-4 py-2 text-sm hover:bg-blue-500/30">Player View</button>
              <button onClick={() => refreshAll()} className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm hover:bg-white/20">Refresh</button>
              <button onClick={logout} className="rounded-xl border border-red-300/40 bg-red-500/20 px-4 py-2 text-sm hover:bg-red-500/30">Logout</button>
            </div>
          </div>
          {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
        </header>

        <nav className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-7">
          {(["overview", "users", "wallets", "games", "settings", "risk", "notifications"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold capitalize transition ${activeTab === tab ? "bg-emerald-400 text-black" : "bg-white/10 hover:bg-white/20"}`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {activeTab === "overview" && (
          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-7">
            {[
              ["Active Games", overview?.activeGames ?? 0],
              ["Open Flags", overview?.openFlags ?? 0],
              ["High Flags", overview?.highFlags ?? 0],
              ["Pending Signups", users.filter((u) => u.signupStatus === "PENDING").length],
              ["Blocked Users", overview?.blockedUsers ?? 0],
              ["Held Withdrawals", overview?.heldWithdrawals ?? 0],
              ["Wallet Total", Number(overview?.totalUserWalletBalance ?? 0).toFixed(2)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/15 bg-black/35 p-4">
                <p className="text-xs text-white/65">{label}</p>
                <p className="mt-2 text-2xl font-bold">{String(value)}</p>
              </div>
            ))}
          </section>
        )}

        {activeTab === "users" && (
          <section className="mt-4 overflow-hidden rounded-2xl border border-white/15 bg-black/35">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white/10 text-left">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Signup</th>
                    <th className="px-4 py-3">Wallet</th>
                    <th className="px-4 py-3">Deposits</th>
                    <th className="px-4 py-3">Withdrawals</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-white/10">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{u.username}</div>
                        <div className="text-xs text-white/65">{u.email}</div>
                        {u.isFrozen && <span className="mt-1 inline-block rounded-full bg-red-500/25 px-2 py-1 text-[10px] font-bold text-red-200">FROZEN</span>}
                      </td>
                      <td className="px-4 py-3">{u.role}</td>
                      <td className="px-4 py-3">{u.signupStatus || "APPROVED"}</td>
                      <td className="px-4 py-3">${Number(u.wallet?.balance ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-3">${(u.totalDeposits / 100).toFixed(2)}</td>
                      <td className="px-4 py-3">${(u.totalWithdrawals / 100).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-lg bg-white/10 px-3 py-1 hover:bg-white/20" onClick={() => loadLedger(u.id)}>Ledger</button>
                          <button
                            className="rounded-lg bg-blue-500/30 px-3 py-1 hover:bg-blue-500/40"
                            onClick={() => callAction(`/api/v1/admin/users/${u.id}/role`, { role: u.role === "ADMIN" ? "USER" : "ADMIN" })}
                          >
                            {u.role === "ADMIN" ? "Make User" : "Make Admin"}
                          </button>
                          {u.signupStatus === "PENDING" && (
                            <>
                              <button className="rounded-lg bg-emerald-500/30 px-3 py-1 hover:bg-emerald-500/40" onClick={() => callAction(`/api/v1/admin/users/${u.id}/approve-signup`)}>
                                Approve
                              </button>
                              <button className="rounded-lg bg-yellow-500/25 px-3 py-1 hover:bg-yellow-500/35" onClick={() => callAction(`/api/v1/admin/users/${u.id}/waitlist-signup`)}>
                                Waitlist
                              </button>
                            </>
                          )}
                          {u.isFrozen ? (
                            <button className="rounded-lg bg-emerald-500/30 px-3 py-1 hover:bg-emerald-500/40" onClick={() => callAction(`/api/v1/admin/users/${u.id}/unfreeze`)}>Unfreeze</button>
                          ) : (
                            <button className="rounded-lg bg-red-500/30 px-3 py-1 hover:bg-red-500/40" onClick={() => callAction(`/api/v1/admin/users/${u.id}/freeze`, { reason: "Manual compliance review" })}>Freeze</button>
                          )}
                          <button className="rounded-lg bg-yellow-500/25 px-3 py-1 hover:bg-yellow-500/35" onClick={() => callAction(`/api/v1/admin/wallets/${u.id}/${u.wallet?.isFrozen ? "unfreeze" : "freeze"}`, { reason: "Wallet risk review" })}>
                            Wallet {u.wallet?.isFrozen ? "Unfreeze" : "Freeze"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "wallets" && (
          <section className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-black/35 p-4 lg:col-span-2">
              <h2 className="text-lg font-bold">Ledger {selectedUser ? `- ${selectedUser.username}` : ""}</h2>
              {!selectedUser && <p className="mt-2 text-sm text-white/70">Open Users tab and click Ledger to inspect transactions.</p>}
              {selectedUser && (
                <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-white/10">
                  <table className="min-w-full text-xs">
                    <thead className="bg-white/10">
                      <tr>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Amount</th>
                        <th className="px-3 py-2 text-left">Balance After</th>
                        <th className="px-3 py-2 text-left">Reason</th>
                        <th className="px-3 py-2 text-left">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((l) => (
                        <tr key={l.id} className="border-t border-white/10">
                          <td className="px-3 py-2">{l.type}</td>
                          <td className="px-3 py-2">{Number(l.amount).toFixed(2)}</td>
                          <td className="px-3 py-2">{Number(l.balanceAfter).toFixed(2)}</td>
                          <td className="px-3 py-2">{l.reason || "-"}</td>
                          <td className="px-3 py-2">{new Date(l.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/15 bg-black/35 p-4">
              <h3 className="font-bold">Manual Wallet Adjustment</h3>
              <p className="mt-1 text-xs text-white/70">Use cents. Positive = credit, negative = debit.</p>
              <input
                placeholder="Amount (e.g. 500 or -500)"
                className="mt-3 w-full rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/20 outline-none"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
              <textarea
                placeholder="Reason (required)"
                className="mt-2 h-24 w-full rounded-lg bg-white/10 px-3 py-2 text-sm ring-1 ring-white/20 outline-none"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
              />
              <button onClick={manualAdjust} className="mt-2 w-full rounded-lg bg-emerald-500 py-2 font-semibold text-black hover:bg-emerald-400">Apply Adjustment</button>
              <h3 className="mt-6 font-bold">Suspicious Wallet Activity</h3>
              <div className="mt-2 max-h-52 overflow-auto space-y-2">
                {suspiciousWallets.map((s) => (
                  <div key={s.walletId} className="rounded-lg border border-amber-300/30 bg-amber-500/10 p-2 text-xs">
                    <div className="font-semibold">{s.user?.username || s.user?.email}</div>
                    <div>{s.txCount24h} tx / 24h</div>
                    <div>Net: {Number(s.netAmount24h).toFixed(2)}</div>
                  </div>
                ))}
                {!suspiciousWallets.length && <p className="text-xs text-white/70">No high-volume wallet patterns detected.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === "games" && (
          <section className="mt-4 rounded-2xl border border-white/15 bg-black/35 p-4">
            <div className="mb-3 flex items-center gap-2">
              <button onClick={() => setGameStatus("ACTIVE")} className={`rounded-lg px-3 py-1 text-sm ${gameStatus === "ACTIVE" ? "bg-emerald-400 text-black" : "bg-white/10"}`}>Active</button>
              <button onClick={() => setGameStatus("COMPLETED")} className={`rounded-lg px-3 py-1 text-sm ${gameStatus === "COMPLETED" ? "bg-emerald-400 text-black" : "bg-white/10"}`}>Completed</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {games.map((g) => (
                <div key={g.id} className="rounded-xl border border-white/15 bg-black/35 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-white/60">Game</p>
                      <p className="font-semibold">{g.id.slice(0, 8)}...</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/60">Pot</p>
                      <p className="font-semibold">${(g.potSize / 100).toFixed(2)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-white/70">Status: {g.status} / {g.phase}</p>
                  <div className="mt-2 space-y-1 text-xs">
                    {g.players.map((p) => (
                      <p key={p.seat}>Seat {p.seat}: {p.user?.username || "BOT"} {p.isBot ? "(BOT)" : ""}</p>
                    ))}
                  </div>
                  {g.status !== "COMPLETED" && g.status !== "CANCELLED" && (
                    <button onClick={() => callAction(`/api/v1/admin/games/${g.id}/cancel`, { reason: "Emergency admin cancel" })} className="mt-3 rounded-lg bg-red-500/30 px-3 py-1 text-sm hover:bg-red-500/40">Emergency Cancel</button>
                  )}
                </div>
              ))}
              {!games.length && <p className="text-sm text-white/70">No games in this state.</p>}
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="mt-4 rounded-2xl border border-white/15 bg-black/35 p-5">
            <h2 className="text-xl font-bold">Beta Registration Gate</h2>
            <p className="mt-1 text-sm text-white/70">Control whether new users can register.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${registrationsOpen ? "bg-emerald-500/25 text-emerald-200" : "bg-red-500/25 text-red-200"}`}>
                {registrationsOpen ? "Registrations Open" : "Registrations Closed"}
              </span>
              <button onClick={() => updateRegistrations(!registrationsOpen)} className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
                {registrationsOpen ? "Close Registrations" : "Open Registrations"}
              </button>
            </div>
          </section>
        )}

        {activeTab === "risk" && (
          <section className="mt-4 rounded-2xl border border-white/15 bg-black/35 p-4">
            <h2 className="text-lg font-bold">Open Risk Flags</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white/10">
                  <tr>
                    <th className="px-3 py-2 text-left">User</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Severity</th>
                    <th className="px-3 py-2 text-left">Reason</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map((f) => (
                    <tr key={f.id} className="border-t border-white/10">
                      <td className="px-3 py-2">{f.user?.username || f.user?.email || "Unknown"}</td>
                      <td className="px-3 py-2">{f.type}</td>
                      <td className="px-3 py-2">{f.severity}</td>
                      <td className="px-3 py-2">{f.reason}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => callAction(`/api/v1/admin/risk/flags/${f.id}/resolve`)} className="rounded-lg bg-emerald-500/25 px-3 py-1 text-xs hover:bg-emerald-500/40">Resolve</button>
                      </td>
                    </tr>
                  ))}
                  {!flags.length && (
                    <tr>
                      <td className="px-3 py-3 text-sm text-white/70" colSpan={5}>No open flags.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "notifications" && (
          <section className="mt-4 rounded-2xl border border-white/15 bg-black/35 p-4">
            <h2 className="text-lg font-bold">Admin Notifications</h2>
            <p className="mt-1 text-sm text-white/70">Review pending beta access requests and moderation events.</p>
            <div className="mt-3 space-y-3">
              {notifications.map((n) => (
                <div key={n.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="font-semibold">{n.title}</p>
                  <p className="mt-1 text-sm text-white/75">{n.message}</p>
                  <p className="mt-1 text-xs text-white/60">{new Date(n.createdAt).toLocaleString()}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {n.user?.id && n.user.signupStatus === "PENDING" && (
                      <>
                        <button className="rounded-lg bg-emerald-500/30 px-3 py-1 text-xs hover:bg-emerald-500/40" onClick={() => callAction(`/api/v1/admin/users/${n.user!.id}/approve-signup`)}>
                          Approve
                        </button>
                        <button className="rounded-lg bg-yellow-500/25 px-3 py-1 text-xs hover:bg-yellow-500/35" onClick={() => callAction(`/api/v1/admin/users/${n.user!.id}/waitlist-signup`)}>
                          Waitlist
                        </button>
                      </>
                    )}
                    <button className="rounded-lg bg-white/15 px-3 py-1 text-xs hover:bg-white/25" onClick={() => callAction(`/api/v1/admin/notifications/${n.id}/read`)}>
                      Mark Read
                    </button>
                  </div>
                </div>
              ))}
              {!notifications.length && <p className="text-sm text-white/70">No open notifications.</p>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
