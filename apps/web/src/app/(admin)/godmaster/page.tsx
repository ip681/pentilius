'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
// Plain JSON import — godmaster deliberately has no next-intl setup (see the
// (admin) layout comment), so item display names are resolved by hand from
// the same message file the player app uses, not a duplicated translation system.
import bgMessages from '../../../../messages/bg.json';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const TOKEN_KEY = 'godmaster.accessToken';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

// Display-only — purely to hide the ADMIN-only "Admin акаунти" section for a
// MODERATOR so the UI doesn't offer a button that will 403. The backend
// re-checks the role on every admin-account endpoint regardless, so this is
// never the actual security boundary.
function decodeAdminRole(token: string): string | null {
  const payload = decodeTokenPayload(token);
  return typeof payload?.role === 'string' ? payload.role : null;
}

/** The signed-in staff account's id — used to mark "(ти)" and hide self-management buttons. */
function decodeAdminId(token: string | null): string | null {
  const payload = token ? decodeTokenPayload(token) : null;
  return typeof payload?.sub === 'string' ? payload.sub : null;
}

function decodeTokenPayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

// Fired by adminFetch on a 401 (expired/revoked session) — the page root
// listens and drops back to the login form with an explanation.
const SESSION_EXPIRED_EVENT = 'godmaster:session-expired';
// Sliding session (owner decision, 2026-10-12): renew the token on load and
// this often while the page is open, so godmaster never logs the owner out on
// its own. The server re-checks the account on every request regardless.
const TOKEN_REFRESH_INTERVAL_MS = 6 * 3600_000;

// Same id -> path convention as apps/web/src/lib/assets.ts, kept as its own
// tiny copy here rather than importing the player app's helper — godmaster
// deliberately shares no components with the player app (see the (admin)
// layout comment), even for something this small.
function assetUrl(iconAssetId: string): string {
  const [namespace, key] = iconAssetId.split('.');
  return `/assets/${namespace}/${key}.png`;
}

function resolveMessageKey(key: string): string {
  const value = key.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), bgMessages);
  return typeof value === 'string' ? value : key;
}

async function adminFetch<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    if (response.status === 401 && path !== '/admin/login' && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Заявката се провали (${response.status})`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Downloads a backup file through the authenticated API (a plain <a href> can't carry the Bearer token) — fetches as a Blob, then triggers a save via a throwaway object URL. */
async function downloadBackupFile(filename: string): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/admin/backups/${encodeURIComponent(filename)}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Изтеглянето се провали (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function GodmasterPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    setToken(getToken());
    setReady(true);
  }, []);

  // Renew on load and periodically while open (sliding session), and drop
  // back to the login form if the server ever rejects the session.
  useEffect(() => {
    if (!token) return;
    const renew = () =>
      adminFetch<{ accessToken: string }>('/admin/refresh', { method: 'POST' })
        .then((res) => handleLogin(res.accessToken))
        .catch(() => undefined);
    renew();
    const interval = setInterval(renew, TOKEN_REFRESH_INTERVAL_MS);
    const onExpired = () => {
      window.localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setSessionExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      clearInterval(interval);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
    // Re-run only on login/logout, not on every renewed token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token !== null]);

  function handleLogin(newToken: string) {
    window.localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setSessionExpired(false);
  }

  function handleLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  if (!ready) return null;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold">godmaster</h1>
      {!token && sessionExpired && <p className="mb-4 text-xs text-danger">Сесията изтече или акаунтът е променен — влез отново.</p>}
      {token ? (
        <AdminPanel onLogout={handleLogout} onTokenChange={handleLogin} role={decodeAdminRole(token)} myId={decodeAdminId(token)} />
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
    </main>
  );
}

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await adminFetch<{ accessToken: string }>('/admin/login', { method: 'POST', body: { username, password } });
      onLogin(res.accessToken);
    } catch {
      setError('Грешно потребителско име или парола');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xs flex-col gap-3">
      <input
        type="text"
        placeholder="потребителско име"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <input
        type="password"
        placeholder="парола"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <button type="submit" disabled={loading} className="rounded-md border border-accent bg-accentBg px-3 py-2 text-sm hover:bg-accentBgHover disabled:opacity-50">
        {loading ? '...' : 'Вход'}
      </button>
    </form>
  );
}

const TABS = [
  { key: 'server', label: 'Сървър' },
  { key: 'players', label: 'Играчи' },
  { key: 'reports', label: 'Доклади' },
  { key: 'filter', label: 'Филтър' },
  { key: 'admins', label: 'Админи' },
  { key: 'settings', label: 'Настройки' },
] as const;
type AdminTab = (typeof TABS)[number]['key'];

function AdminPanel({
  onLogout,
  onTokenChange,
  role,
  myId,
}: {
  onLogout: () => void;
  onTokenChange: (token: string) => void;
  role: string | null;
  myId: string | null;
}) {
  const [tab, setTab] = useState<AdminTab>('server');

  // One selected player for the whole panel — search once here, every form
  // below (grant resource/item, ban/rename) acts on this same player instead
  // of each form asking for a username separately.
  const [username, setUsername] = useState('');
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadPlayer(name: string) {
    if (!name) return;
    setUsername(name);
    setLoading(true);
    setError(null);
    adminFetch<PlayerDetail>(`/admin/players/${encodeURIComponent(name)}`)
      .then((res) => setDetail(res))
      .catch((err) => {
        setDetail(null);
        setError(err instanceof Error ? err.message : 'Грешка');
      })
      .finally(() => setLoading(false));
  }

  // Every tab is visible to both roles; the Admins tab shows a MODERATOR only their own account.
  const visibleTabs = TABS;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md border px-3 py-1.5 text-xs ${tab === t.key ? 'border-accent bg-accentBg' : 'border-panelBorder bg-panel text-textMuted hover:bg-accentBgHover'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onLogout} className="w-fit rounded-md border border-panelBorder bg-panel px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover">
          Изход
        </button>
      </div>

      {tab === 'server' && (
        <>
          <ServerStatusPanel />
          <BackupsPanel />
        </>
      )}

      {tab === 'players' && (
        <>
          <section className="rounded-lg border border-panelBorder bg-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Играч</h2>
            <PlayerAutocomplete value={username} onChange={setUsername} onSelect={loadPlayer} />
            {loading && <p className="mt-3 text-xs text-textFaint">Зареждане...</p>}
            {error && <p className="mt-3 text-xs text-danger">{error}</p>}
            {detail && <PlayerDetailView detail={detail} onReload={loadPlayer} />}
          </section>

          <GrantResourceForm username={username} onGranted={() => loadPlayer(username)} />
          <GrantItemForm username={username} onGranted={() => loadPlayer(username)} />
          <RecentActivityPanel />
        </>
      )}

      {tab === 'admins' && <AdminAccountsPanel myId={myId} isAdmin={role === 'ADMIN'} onTokenChange={onTokenChange} />}

      {tab === 'filter' && <ContentFilterPanel />}

      {tab === 'settings' && (
        <>
          <SeasonSettingsPanel canEdit={role === 'ADMIN'} />
          <GameSettingsPanel canEdit={role === 'ADMIN'} />
        </>
      )}

      {tab === 'reports' && (
        <ReportsPanel
          onOpenPlayer={(name) => {
            setTab('players');
            loadPlayer(name);
          }}
        />
      )}
    </div>
  );
}

interface PlayerDetail {
  profile: {
    id: string;
    username: string;
    email: string;
    race: string;
    level: number;
    xp: number;
    createdAt: string;
    lastActiveAt: string;
    bannedUntil: string | null;
    banReason: string | null;
  };
  resources: { metal: number; crystal: number; credits: number };
  equipped: { id: string; slot: string; itemDefinitionKey: string; nameKey: string; tier: string | null; quality: string; upgradeLevel: number }[];
  inventory: { id: string; itemDefinitionKey: string; nameKey: string; category: string; tier: string | null; quality: string; upgradeLevel: number; quantity: number }[];
  actionLog: { id: string; adminUsername: string; actionType: string; details: unknown; createdAt: string }[];
}

const ACTION_TYPE_LABEL: Record<string, string> = {
  GRANT_RESOURCE: 'Добавен ресурс',
  GRANT_ITEM: 'Добавен предмет',
  BAN_PLAYER: 'Наказан',
  UNBAN_PLAYER: 'Наказанието премахнато',
  RENAME_PLAYER: 'Преименуван',
  UPDATE_SEASON_SETTINGS: 'Настройки на сезона',
  UPDATE_GAME_SETTINGS: 'Настройки на играта',
  RESET_SEASON: 'Нулиран сезон',
  ADD_BANNED_WORD: 'Добавена забранена дума',
  REMOVE_BANNED_WORD: 'Премахната забранена дума',
  RESOLVE_REPORT: 'Доклад — решен',
  DISMISS_REPORT: 'Доклад — отхвърлен',
  DELETE_CLAN_MESSAGE: 'Изтрито съобщение',
};

function PlayerDetailView({ detail, onReload }: { detail: PlayerDetail; onReload: (username: string) => void }) {
  const { profile, resources, equipped, inventory, actionLog } = detail;
  const isBanned = profile.bannedUntil && new Date(profile.bannedUntil) > new Date();

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-panelBorder pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{profile.username}</p>
          <p className="text-[11px] text-textFaint">
            {profile.email} · ниво {profile.level} · {profile.race}
          </p>
        </div>
        {isBanned && (
          <span className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-[11px] text-danger">
            Наказан до {new Date(profile.bannedUntil as string).toLocaleString('bg-BG')}
            {profile.banReason ? ` — ${profile.banReason}` : ''}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <StatBox label="Метал" value={String(resources.metal)} />
        <StatBox label="Кристал" value={String(resources.crystal)} />
        <StatBox label="Кредити" value={String(resources.credits)} />
      </div>

      <BanRenameControls username={profile.username} isBanned={Boolean(isBanned)} onReload={onReload} />

      <div>
        <p className="mb-1 text-[11px] font-medium text-textFaint">Екипировка ({equipped.length}/7)</p>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {equipped.map((item) => (
            <div key={item.id} className="rounded-md border border-wellBorder bg-well px-2 py-1.5 text-[11px]">
              <p className="text-textFaint">{item.slot}</p>
              <p>
                {resolveMessageKey(item.nameKey)} +{item.upgradeLevel}
              </p>
            </div>
          ))}
          {equipped.length === 0 && <p className="text-[11px] text-textFaint">Няма екипирани предмети</p>}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-medium text-textFaint">Инвентар ({inventory.length})</p>
        <div className="max-h-48 overflow-y-auto rounded-md border border-wellBorder">
          <table className="w-full text-[11px]">
            <tbody>
              {inventory.map((item) => (
                <tr key={item.id} className="border-b border-wellBorder last:border-0">
                  <td className="px-2 py-1">{resolveMessageKey(item.nameKey)}</td>
                  <td className="px-2 py-1 text-textFaint">{item.tier ?? '—'}</td>
                  <td className="px-2 py-1 text-textFaint">{item.quality}</td>
                  <td className="px-2 py-1 text-textFaint">x{item.quantity}</td>
                </tr>
              ))}
              {inventory.length === 0 && (
                <tr>
                  <td className="px-2 py-2 text-textFaint">Празен инвентар</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-medium text-textFaint">История на промените (AdminActionLog)</p>
        <div className="max-h-48 overflow-y-auto rounded-md border border-wellBorder">
          <table className="w-full text-[11px]">
            <tbody>
              {actionLog.map((entry) => (
                <tr key={entry.id} className="border-b border-wellBorder last:border-0">
                  <td className="px-2 py-1 text-textFaint">{new Date(entry.createdAt).toLocaleString('bg-BG')}</td>
                  <td className="px-2 py-1">{ACTION_TYPE_LABEL[entry.actionType] ?? entry.actionType}</td>
                  <td className="px-2 py-1 text-textFaint">от {entry.adminUsername}</td>
                  <td className="px-2 py-1 text-textFaint">{JSON.stringify(entry.details)}</td>
                </tr>
              ))}
              {actionLog.length === 0 && (
                <tr>
                  <td className="px-2 py-2 text-textFaint">Няма записани действия</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BanRenameControls({ username, isBanned, onReload }: { username: string; isBanned: boolean; onReload: (username: string) => void }) {
  const [durationHours, setDurationHours] = useState('24');
  const [reason, setReason] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBan() {
    setMessage(null);
    setError(null);
    try {
      await adminFetch('/admin/players/ban', { method: 'POST', body: { username, durationHours: Number(durationHours), reason: reason || undefined } });
      setMessage('Играчът е наказан');
      onReload(username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  async function handleUnban() {
    setMessage(null);
    setError(null);
    try {
      await adminFetch('/admin/players/unban', { method: 'POST', body: { username } });
      setMessage('Наказанието е премахнато');
      onReload(username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  async function handleRename() {
    setMessage(null);
    setError(null);
    if (!newUsername) {
      setError('Въведи новото име');
      return;
    }
    try {
      await adminFetch('/admin/players/rename', { method: 'POST', body: { username, newUsername } });
      setMessage(`Преименуван на ${newUsername}`);
      const renamedTo = newUsername;
      setNewUsername('');
      onReload(renamedTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-wellBorder bg-well p-3 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        {isBanned ? (
          <button type="button" onClick={handleUnban} className="rounded-md border border-positive px-3 py-1.5 text-[11px] text-positive hover:bg-accentBgHover">
            Премахни наказанието
          </button>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-[10px] text-textFaint">
              часове
              <input
                type="number"
                min={1}
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                className="w-20 rounded-md border border-wellBorder bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-textFaint">
              причина (по избор)
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-40 rounded-md border border-wellBorder bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent"
              />
            </label>
            <button type="button" onClick={handleBan} className="rounded-md border border-danger px-3 py-1.5 text-[11px] text-danger hover:bg-accentBgHover">
              Наложи наказание
            </button>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t border-panelBorder pt-2">
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          ново потребителско име
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="w-40 rounded-md border border-wellBorder bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
        </label>
        <button type="button" onClick={handleRename} className="rounded-md border border-accent px-3 py-1.5 text-[11px] hover:bg-accentBgHover">
          Преименувай
        </button>
      </div>
      {message && <p className="text-positive">{message}</p>}
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

interface ContainerStatus {
  service: string;
  name: string;
  state: string;
  status: string;
  health: string;
}

interface ServerStatus {
  timestamp: string;
  load: { '1m': number; '5m': number; '15m': number; cpuCores: number };
  memory: { totalMb: number; usedMb: number; availableMb: number };
  disk: { totalKb: number; usedKb: number; availableKb: number; usePercent: number };
  containers: ContainerStatus[];
}

interface LoadHistoryPoint {
  timestamp: string;
  load1m: number;
  cpuCores: number;
  memUsedMb: number;
  memTotalMb: number;
  diskUsePercent: number;
}

interface ServerStatusResponse {
  server: ServerStatus | null;
  history: LoadHistoryPoint[];
  backupLogTail: string[];
  errors: string[];
}

const POLL_INTERVAL_MS = 30_000;

const SPARKLINE_WIDTH = 600;
const SPARKLINE_HEIGHT = 96;
// Shared Y-axis ceiling for every series on the combined chart. Load (unlike
// memory/disk) can exceed 100% of total CPU capacity, so this stays above
// 100 — memory just never reaches the very top of the box. Simpler than a
// real dual-axis chart for what's just a small admin sparkline.
const SPARKLINE_CEILING_PERCENT = 150;
// Horizontal gridlines every 10%, with 0%/50%/100% drawn very slightly
// heavier so the three most meaningful marks (empty, half, full capacity)
// stand out without looking like a different kind of line.
const SPARKLINE_GRID_PERCENTS = [0, ...Array.from({ length: Math.floor(SPARKLINE_CEILING_PERCENT / 10) - 1 }, (_, i) => (i + 1) * 10)];
const SPARKLINE_MAJOR_GRID_PERCENTS = new Set([0, 50, 100]);

interface SparklineSeries {
  label: string;
  colorClassName: string;
  getPercent: (point: LoadHistoryPoint) => number;
}

/**
 * Fixed-size SVG (never grows with data) overlaying one line per series on a
 * shared percentage scale, with a small color-coded legend — see
 * admin.service.ts's SERVER_STATUS_HISTORY_FILE comment for the ~24h/
 * 720-point retention this is drawing from.
 */
function CombinedSparkline({ points, series }: { points: LoadHistoryPoint[]; series: SparklineSeries[] }) {
  if (points.length < 2) {
    return <p className="text-[11px] text-textFaint">Графиката все още няма достатъчно данни</p>;
  }

  function coordsFor(getPercent: (point: LoadHistoryPoint) => number): string {
    return points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * SPARKLINE_WIDTH;
        const clamped = Math.min(SPARKLINE_CEILING_PERCENT, Math.max(0, getPercent(p)));
        const y = SPARKLINE_HEIGHT - (clamped / SPARKLINE_CEILING_PERCENT) * SPARKLINE_HEIGHT;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const first = points[0];
  const last = points[points.length - 1];
  const hoursSpan = (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 1000 / 60 / 60;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-textFaint">
        <span>последните {hoursSpan.toFixed(1)}ч</span>
        <div className="flex items-center gap-3">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full bg-current ${s.colorClassName}`} />
              {s.label}: {Math.round(s.getPercent(last))}%
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`} preserveAspectRatio="none" className="h-24 w-full overflow-visible">
        {SPARKLINE_GRID_PERCENTS.map((pct) => {
          const y = SPARKLINE_HEIGHT - (pct / SPARKLINE_CEILING_PERCENT) * SPARKLINE_HEIGHT;
          const major = SPARKLINE_MAJOR_GRID_PERCENTS.has(pct);
          return (
            <line
              key={pct}
              x1={0}
              y1={y}
              x2={SPARKLINE_WIDTH}
              y2={y}
              stroke="currentColor"
              strokeWidth={0.5}
              className={major ? 'text-textMuted' : 'text-wellBorder'}
            />
          );
        })}
        {series.map((s) => (
          <polyline key={s.label} points={coordsFor(s.getPercent)} fill="none" stroke="currentColor" strokeWidth={2} className={s.colorClassName} />
        ))}
      </svg>
    </div>
  );
}

/** Reads the host-side cron snapshot (system stats + docker compose ps) and the backup log tail — both read-only mounted into the API container, never generated by it. */
function ServerStatusPanel() {
  const [data, setData] = useState<ServerStatusResponse | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    function load() {
      adminFetch<ServerStatusResponse>('/admin/server-status')
        .then((res) => {
          if (!cancelled) setData(res);
        })
        .catch(() => {});
    }
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const server = data?.server ?? null;
  const lastBackupLine = data?.backupLogTail.length ? data.backupLogTail[data.backupLogTail.length - 1] : null;
  const lastBackupOk = lastBackupLine?.includes('SUCCESS') ?? null;

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">Статус на сървъра</h2>
      {!server ? (
        <p className="text-xs text-textFaint">{data?.errors.includes('SERVER_STATUS_UNAVAILABLE') ? 'Няма данни (файлът все още не е записан)' : 'Зареждане...'}</p>
      ) : (
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-textFaint">Обновено: {new Date(server.timestamp).toLocaleString('bg-BG')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox
              label="Натоварване (1м)"
              value={`${server.load['1m'].toFixed(2)} / ${server.load.cpuCores} ядра (${Math.round((server.load['1m'] / server.load.cpuCores) * 100)}%)`}
              percent={(server.load['1m'] / server.load.cpuCores) * 100}
            />
            <StatBox
              label="Памет"
              value={`${(server.memory.usedMb / 1024).toFixed(1)} / ${(server.memory.totalMb / 1024).toFixed(1)} GB (${Math.round((server.memory.usedMb / server.memory.totalMb) * 100)}%)`}
              percent={(server.memory.usedMb / server.memory.totalMb) * 100}
            />
            <StatBox
              label="Диск"
              value={`${(server.disk.usedKb / 1024 / 1024).toFixed(1)} / ${(server.disk.totalKb / 1024 / 1024).toFixed(1)} GB (${server.disk.usePercent}%)`}
              percent={server.disk.usePercent}
            />
            <StatBox
              label="Последен бекъп"
              value={lastBackupOk === null ? '—' : lastBackupOk ? 'Успешен' : 'Неуспешен'}
              tone={lastBackupOk === null ? undefined : lastBackupOk ? 'good' : 'bad'}
            />
          </div>
          <div className="rounded-md border border-wellBorder bg-well px-3 py-2">
            <CombinedSparkline
              points={data?.history ?? []}
              series={[
                { label: 'Натоварване', colorClassName: 'text-gold', getPercent: (p) => (p.load1m / p.cpuCores) * 100 },
                { label: 'Памет', colorClassName: 'text-energy', getPercent: (p) => (p.memUsedMb / p.memTotalMb) * 100 },
              ]}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-textFaint">Контейнери</p>
            <div className="flex flex-col gap-1">
              {server.containers.map((c) => (
                <div key={c.name} className="flex items-center justify-between rounded-md border border-wellBorder bg-well px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${c.state === 'running' ? 'bg-positive' : 'bg-danger'}`} />
                    {c.service}
                  </span>
                  <span className={c.state === 'running' ? 'text-positive' : 'text-danger'}>{c.status}</span>
                </div>
              ))}
            </div>
          </div>
          {data && data.backupLogTail.length > 0 && (
            <div>
              <button type="button" onClick={() => setLogOpen((v) => !v)} className="text-[11px] text-textFaint underline">
                {logOpen ? 'скрий бекъп лога' : 'покажи бекъп лога'}
              </button>
              {logOpen && (
                <pre className="mt-1 max-h-40 overflow-y-auto rounded-md border border-wellBorder bg-well p-2 text-[10px] leading-relaxed">
                  {data.backupLogTail.join('\n')}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatBox({ label, value, tone, percent }: { label: string; value: string; tone?: 'good' | 'bad'; percent?: number }) {
  return (
    <div className="rounded-md border border-wellBorder bg-well px-3 py-2">
      <p className="text-[10px] text-textFaint">{label}</p>
      <p className={tone === 'good' ? 'text-positive' : tone === 'bad' ? 'text-danger' : ''}>{value}</p>
      {percent !== undefined && <UsageBar percent={percent} />}
    </div>
  );
}

/** Green below 75%, gold 75-90%, red above — thresholds are a rough eyeball guide, not alerting. */
function UsageBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = percent >= 90 ? 'bg-danger' : percent >= 75 ? 'bg-gold' : 'bg-positive';
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-panel">
      <div className={`h-full rounded-full ${color} transition-[width]`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

interface PlayerHit {
  id: string;
  username: string;
  level: number;
}

/** Debounced search-as-you-type against /admin/players/search — shared by both grant forms. */
function PlayerAutocomplete({ value, onChange, onSelect }: { value: string; onChange: (username: string) => void; onSelect?: (username: string) => void }) {
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fetchHits(q: string) {
    adminFetch<PlayerHit[]>(`/admin/players/search?q=${encodeURIComponent(q)}`)
      .then(setHits)
      .catch(() => setHits([]));
  }

  function handleInput(next: string) {
    onChange(next);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchHits(next), 200);
  }

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="потребителско име"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => {
          setOpen(true);
          // Nothing loaded yet for the current text — show a starter list
          // (recent players, or the current query's matches) instead of an
          // empty dropdown the instant the field is clicked.
          if (hits.length === 0) fetchHits(value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-56 rounded-md border border-panelBorder bg-panel text-sm shadow-lg">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(hit.username);
                  onSelect?.(hit.username);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accentBgHover"
              >
                <span>{hit.username}</span>
                <span className="text-xs text-textFaint">ниво {hit.level}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ItemHit {
  key: string;
  nameKey: string;
  category: string;
  tier: string | null;
  iconAssetId: string;
}

/** Small inline icon with a silent fallback (blank) if the file doesn't exist yet — not every item has final art (instructions/ASSETS.md). */
function ItemIcon({ iconAssetId, className }: { iconAssetId: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`${className ?? ''} bg-well`} />;
  // eslint-disable-next-line @next/next/no-img-element -- godmaster has no next/image optimizer setup, same as AssetIcon elsewhere in the app.
  return <img src={assetUrl(iconAssetId)} alt="" className={className} onError={() => setFailed(true)} />;
}

/** Loaded once (small dataset), then filtered client-side by both key and resolved Bulgarian name. */
function ItemAutocomplete({ value, onChange, onSelect }: { value: string; onChange: (key: string) => void; onSelect?: (item: ItemHit) => void }) {
  const [allItems, setAllItems] = useState<ItemHit[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    adminFetch<ItemHit[]>('/admin/items').then(setAllItems).catch(() => setAllItems([]));
  }, []);

  const needle = query.trim().toLowerCase();
  const matches =
    needle.length < 1
      ? allItems.slice(0, 15)
      : allItems
          .filter((item) => item.key.toLowerCase().includes(needle) || resolveMessageKey(item.nameKey).toLowerCase().includes(needle))
          .slice(0, 15);

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="търси предмет по име или ключ..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-72 rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {value && (() => {
        const selected = allItems.find((item) => item.key === value);
        return (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-textFaint">
            {selected && <ItemIcon iconAssetId={selected.iconAssetId} className="h-5 w-5 object-contain" />}
            Избрано: {resolveMessageKey(`items.${value}.name`)} ({value})
          </p>
        );
      })()}
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-80 max-h-64 overflow-y-auto rounded-md border border-panelBorder bg-panel text-sm shadow-lg">
          {matches.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => {
                  onChange(item.key);
                  onSelect?.(item);
                  setQuery(resolveMessageKey(item.nameKey));
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accentBgHover"
              >
                <ItemIcon iconAssetId={item.iconAssetId} className="h-8 w-8 shrink-0 object-contain" />
                <span className="flex flex-col">
                  <span>{resolveMessageKey(item.nameKey)}</span>
                  <span className="text-[10px] text-textFaint">{item.key}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GrantResourceForm({ username, onGranted }: { username: string; onGranted: () => void }) {
  const [resourceType, setResourceType] = useState<'METAL' | 'CRYSTAL' | 'CREDITS'>('CREDITS');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (!username) {
      setError('Избери играч отгоре');
      return;
    }
    try {
      const res = await adminFetch<{ username: string; resourceType: string; newAmount: number }>('/admin/grant/resource', {
        method: 'POST',
        body: { username, resourceType, amount: Number(amount) },
      });
      setMessage(`${res.username} вече има ${res.newAmount} ${RESOURCE_LABEL[res.resourceType as keyof typeof RESOURCE_LABEL]}`);
      setAmount('');
      onGranted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">Добави ресурс{username ? ` — ${username}` : ''}</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <select
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value as 'METAL' | 'CRYSTAL' | 'CREDITS')}
          className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="METAL">Метал</option>
          <option value="CRYSTAL">Кристал</option>
          <option value="CREDITS">Кредити</option>
        </select>
        <input
          type="number"
          placeholder="количество"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-md border border-accent bg-accentBg px-3 py-2 text-sm hover:bg-accentBgHover">
          Добави
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-positive">{message}</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}

const RESOURCE_LABEL = { METAL: 'метал', CRYSTAL: 'кристал', CREDITS: 'кредита' };

const QUALITY_LABEL = { NORMAL: 'Normal', RARE: 'Rare', EPIC: 'Epic' };

function GrantItemForm({ username, onGranted }: { username: string; onGranted: () => void }) {
  const [itemDefinitionKey, setItemDefinitionKey] = useState('');
  const [selectedItem, setSelectedItem] = useState<ItemHit | null>(null);
  const [quality, setQuality] = useState<'NORMAL' | 'RARE' | 'EPIC'>('NORMAL');
  const [quantity, setQuantity] = useState('1');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEquipment = selectedItem?.category === 'EQUIPMENT';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (!username) {
      setError('Избери играч отгоре');
      return;
    }
    if (!itemDefinitionKey) {
      setError('Избери предмет от списъка');
      return;
    }
    try {
      const res = await adminFetch<{ username: string; itemDefinitionKey: string; granted: number }>('/admin/grant/item', {
        method: 'POST',
        body: { username, itemDefinitionKey, quantity: Number(quantity), ...(isEquipment ? { quality } : {}) },
      });
      setMessage(`Дадени ${res.granted}x ${resolveMessageKey(`items.${res.itemDefinitionKey}.name`)} на ${res.username}`);
      onGranted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">Добави предмет{username ? ` — ${username}` : ''}</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <ItemAutocomplete
          value={itemDefinitionKey}
          onChange={setItemDefinitionKey}
          onSelect={(item) => {
            setSelectedItem(item);
            if (item.category !== 'EQUIPMENT') setQuality('NORMAL');
          }}
        />
        {isEquipment && (
          <label className="flex flex-col gap-1 text-[10px] text-textFaint">
            качество
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as 'NORMAL' | 'RARE' | 'EPIC')}
              className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {Object.entries(QUALITY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-20 rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-md border border-accent bg-accentBg px-3 py-2 text-sm hover:bg-accentBgHover">
          Добави
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-positive">{message}</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}

interface BackupFile {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Lists the local VPS backup files (same ones the server-status panel already reads a log for) with a download-through-the-API button per row. Collapsed by default — rarely needed, so it shouldn't take up permanent space in the main view. */
function BackupsPanel() {
  const [open, setOpen] = useState(false);
  const [backups, setBackups] = useState<BackupFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!open || backups !== null) return;
    adminFetch<BackupFile[]>('/admin/backups')
      .then(setBackups)
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }, [open, backups]);

  async function handleDownload(filename: string) {
    setDownloading(filename);
    setError(null);
    try {
      await downloadBackupFile(filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <h2 className="text-sm font-semibold">Бекъпи</h2>
        <span className="text-xs text-textFaint">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3">
          {error && <p className="mb-2 text-xs text-danger">{error}</p>}
          {!backups ? (
            <p className="text-xs text-textFaint">Зареждане...</p>
          ) : backups.length === 0 ? (
            <p className="text-xs text-textFaint">Няма намерени бекъпи</p>
          ) : (
            <div className="flex flex-col gap-1">
              {backups.map((backup) => (
                <div key={backup.filename} className="flex items-center justify-between gap-2 rounded-md border border-wellBorder bg-well px-3 py-1.5 text-xs">
                  <span className="truncate">{backup.filename}</span>
                  <span className="shrink-0 text-textFaint">{formatBytes(backup.sizeBytes)}</span>
                  <span className="shrink-0 text-textFaint">{new Date(backup.createdAt).toLocaleString('bg-BG')}</span>
                  <button
                    type="button"
                    onClick={() => handleDownload(backup.filename)}
                    disabled={downloading === backup.filename}
                    className="shrink-0 rounded-md border border-panelBorder px-2 py-1 text-[11px] hover:bg-accentBgHover disabled:opacity-50"
                  >
                    {downloading === backup.filename ? '...' : 'Изтегли'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface RecentAction {
  id: string;
  adminUsername: string;
  actionType: string;
  targetUsername: string | null;
  details: unknown;
  createdAt: string;
}

/** Cross-player activity feed — the per-player log in the "Играч" section above filters this same AdminActionLog table by one target; this shows the latest 50 across everyone. */
function RecentActivityPanel() {
  const [actions, setActions] = useState<RecentAction[] | null>(null);

  useEffect(() => {
    adminFetch<RecentAction[]>('/admin/action-log').then(setActions).catch(() => setActions([]));
  }, []);

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">Скорошна активност</h2>
      {!actions ? (
        <p className="text-xs text-textFaint">Зареждане...</p>
      ) : actions.length === 0 ? (
        <p className="text-xs text-textFaint">Няма записани действия</p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-md border border-wellBorder">
          <table className="w-full text-[11px]">
            <tbody>
              {actions.map((action) => (
                <tr key={action.id} className="border-b border-wellBorder last:border-0">
                  <td className="px-2 py-1 text-textFaint">{new Date(action.createdAt).toLocaleString('bg-BG')}</td>
                  <td className="px-2 py-1">{ACTION_TYPE_LABEL[action.actionType] ?? action.actionType}</td>
                  <td className="px-2 py-1 text-textFaint">от {action.adminUsername}</td>
                  <td className="px-2 py-1 text-textFaint">{action.targetUsername ?? '—'}</td>
                  <td className="px-2 py-1 text-textFaint">{JSON.stringify(action.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface AdminAccount {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const ACCOUNT_ERROR_LABEL: Record<string, string> = {
  LAST_ACTIVE_ADMIN: 'Трябва да остане поне един активен ADMIN.',
  CANNOT_MANAGE_YOURSELF: 'Собствения си акаунт не можеш да деактивираш или да му сменяш ролята.',
  ADMIN_ROLE_REQUIRED: 'Само ADMIN може да управлява акаунти.',
  WRONG_CURRENT_PASSWORD: 'Текущата парола е грешна.',
};

function accountError(err: unknown): string {
  const code = err instanceof Error ? err.message : '';
  return ACCOUNT_ERROR_LABEL[code] ?? (code || 'Грешка');
}

/**
 * Staff accounts as a table. Clicking a row opens its editor: your own row ->
 * change your password; anyone else's (ADMIN only) -> role, new password,
 * deactivate. A MODERATOR's list contains only their own account (server-side),
 * and only an ADMIN sees the create form.
 */
function AdminAccountsPanel({ myId, isAdmin, onTokenChange }: { myId: string | null; isAdmin: boolean; onTokenChange: (token: string) => void }) {
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<'ADMIN' | 'MODERATOR'>('MODERATOR');
  const [createdPassword, setCreatedPassword] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadAdmins() {
    adminFetch<AdminAccount[]>('/admin/admins')
      .then(setAdmins)
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }

  useEffect(loadAdmins, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedPassword(null);
    try {
      const res = await adminFetch<{ username: string; role: string; password: string }>('/admin/admins', {
        method: 'POST',
        body: { username: newUsername, role: newRole },
      });
      setCreatedPassword({ username: res.username, password: res.password });
      setNewUsername('');
      loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">Акаунти</h2>

      {admins && (
        <div className="mb-4 overflow-x-auto rounded-md border border-wellBorder">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-wellBorder bg-well text-[10px] uppercase text-textFaint">
                <th className="px-3 py-2">Потребител</th>
                <th className="px-3 py-2">Роля</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2">Последен вход</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => {
                const isMe = admin.id === myId;
                const canOpen = isMe || isAdmin;
                const open = editingId === admin.id;
                return (
                  <Fragment key={admin.id}>
                    <tr
                      onClick={() => canOpen && setEditingId(open ? null : admin.id)}
                      className={`border-b border-wellBorder last:border-b-0 ${canOpen ? 'cursor-pointer hover:bg-accentBgHover' : ''} ${open ? 'bg-accentBg' : ''}`}
                    >
                      <td className="px-3 py-2">
                        {admin.username}
                        {isMe && <span className="ml-1 text-textFaint">(ти)</span>}
                      </td>
                      <td className="px-3 py-2 text-textMuted">{admin.role}</td>
                      <td className={`px-3 py-2 ${admin.isActive ? 'text-positive' : 'text-danger'}`}>{admin.isActive ? 'активен' : 'деактивиран'}</td>
                      <td className="px-3 py-2 text-textFaint">
                        {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString('bg-BG') : 'никога не е влизал'}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-wellBorder last:border-b-0 bg-panel">
                        <td colSpan={4}>
                          {isMe ? <OwnPasswordPanel onTokenChange={onTokenChange} /> : <AdminAccountEditor account={admin} onChanged={loadAdmins} />}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          потребителско име
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          роля
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'ADMIN' | 'MODERATOR')}
            className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="MODERATOR">MODERATOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>
        <button type="submit" className="rounded-md border border-accent bg-accentBg px-3 py-2 text-sm hover:bg-accentBgHover">
          Създай
        </button>
      </form>
      )}
      {createdPassword && (
        <p className="mt-2 text-xs text-positive">
          Създаден {createdPassword.username} — парола (записва се само сега): <span className="font-mono">{createdPassword.password}</span>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}

interface SeasonSettings {
  seasonId: number;
  status: 'NOT_SCHEDULED' | 'SCHEDULED' | 'OPEN' | 'ENDED';
  coreOpensAt: string | null;
  coreDurationDays: number;
  coreEndsAt: string | null;
  locked: boolean;
  resetAt: string | null;
}

const SEASON_STATUS_LABEL: Record<SeasonSettings['status'], string> = {
  NOT_SCHEDULED: 'Ядрото няма зададена дата',
  SCHEDULED: 'Ядрото предстои да се отвори',
  OPEN: 'Ядрото е отворено — атаките текат',
  ENDED: 'Ядрото е затворено — класирането е замразено',
};

const SEASON_ERROR_LABEL: Record<string, string> = {
  SEASON_SETTINGS_LOCKED: 'Ядрото вече е отворено — настройките не могат да се променят.',
  OPENING_TIME_MUST_BE_IN_FUTURE: 'Часът на отваряне трябва да е в бъдещето.',
  ADMIN_ROLE_REQUIRED: 'Само ADMIN може да променя настройките.',
};

/** `<input type="datetime-local">` value (browser-local time) for a UTC ISO string. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Season settings (owner decision, 2026-10-12): when the Core opens and how
 * many days attacks last. Both lock the moment the Core opens — the backend
 * enforces this, the form just mirrors it. Times are entered in this browser's
 * local time and stored as UTC.
 */
function SeasonSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<SeasonSettings | null>(null);
  const [opensAt, setOpensAt] = useState('');
  const [durationDays, setDurationDays] = useState(14);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function apply(res: SeasonSettings) {
    setSettings(res);
    setOpensAt(res.coreOpensAt ? toLocalInputValue(res.coreOpensAt) : '');
    setDurationDays(res.coreDurationDays);
  }

  useEffect(() => {
    adminFetch<SeasonSettings>('/admin/season')
      .then(apply)
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!opensAt) {
      setError('Избери дата и час на отваряне.');
      return;
    }
    try {
      const res = await adminFetch<SeasonSettings>('/admin/season', {
        method: 'POST',
        body: { coreOpensAt: new Date(opensAt).toISOString(), coreDurationDays: durationDays },
      });
      apply(res);
      setSaved(true);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(SEASON_ERROR_LABEL[code] ?? (code || 'Грешка'));
    }
  }

  const formatted = (iso: string | null) => (iso ? new Date(iso).toLocaleString('bg-BG') : '—');
  const editable = canEdit && !!settings && !settings.locked;

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">Сезон и Ядро</h2>

      {settings && (
        <div className="mb-4 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          <span className="text-textFaint">Сезон</span>
          <span>#{settings.seasonId}</span>
          <span className="text-textFaint">Статус</span>
          <span className={settings.status === 'OPEN' ? 'text-positive' : ''}>{SEASON_STATUS_LABEL[settings.status]}</span>
          <span className="text-textFaint">Отваря се</span>
          <span>{formatted(settings.coreOpensAt)}</span>
          <span className="text-textFaint">Продължителност</span>
          <span>{settings.coreDurationDays} дни</span>
          <span className="text-textFaint">Край (определя се победителят)</span>
          <span>{formatted(settings.coreEndsAt)}</span>
          {settings.resetAt && (
            <>
              <span className="text-textFaint">Нулиране и нов сезон</span>
              <span className="text-danger">{formatted(settings.resetAt)}</span>
            </>
          )}
        </div>
      )}

      {settings?.status === 'ENDED' && canEdit && <ResetSeasonNow currentSeasonId={settings.seasonId} onDone={(res) => apply(res)} />}

      {settings?.locked ? (
        <p className="text-xs text-textMuted">Ядрото вече е отворено, затова датата и продължителността са заключени.</p>
      ) : (
        <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[10px] text-textFaint">
            отваряне на Ядрото (местно време)
            <input
              type="datetime-local"
              value={opensAt}
              disabled={!editable}
              onChange={(e) => setOpensAt(e.target.value)}
              className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-textFaint">
            дни за атаки
            <input
              type="number"
              min={1}
              max={365}
              value={durationDays}
              disabled={!editable}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-24 rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
            />
          </label>
          <button
            type="submit"
            disabled={!editable}
            className="rounded-md border border-accent bg-accentBg px-3 py-2 text-sm hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
          >
            Запази
          </button>
        </form>
      )}
      {!canEdit && <p className="mt-2 text-xs text-textFaint">Само ADMIN може да променя тези настройки.</p>}
      <p className="mt-2 text-[10px] text-textFaint">След отварянето на Ядрото нито датата, нито продължителността могат да се променят.</p>
      {saved && <p className="mt-2 text-xs text-positive">Запазено.</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}

interface ReportEntry {
  id: string;
  targetType: 'PLAYER' | 'CLAN' | 'CLAN_MESSAGE' | 'DIRECT_MESSAGE';
  targetId: string;
  reason: 'HARASSMENT' | 'OFFENSIVE_CONTENT' | 'SPAM' | 'CHEATING' | 'OTHER';
  comment: string | null;
  contentSnapshot: string;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
  resolvedAt: string | null;
  resolvedByAdmin: string | null;
  resolutionNote: string | null;
  messageStillExists: boolean | null;
  reporter: { id: string; username: string; clanTag: string | null; totalReports: number; dismissedReports: number };
}

interface ReportGroup {
  key: string;
  targetKind: 'PLAYER' | 'CLAN';
  targetPlayerId: string | null;
  targetUsername: string | null;
  targetClanTag: string | null;
  targetClanName: string | null;
  uniqueReporters: number;
  topReporterClan: { tag: string; reporters: number } | null;
  reports: ReportEntry[];
}

const REPORT_TYPE_LABEL: Record<ReportEntry['targetType'], string> = {
  PLAYER: 'Профил на играч',
  CLAN: 'Клан',
  CLAN_MESSAGE: 'Съобщение в кланов чат',
  DIRECT_MESSAGE: 'Лично съобщение',
};

const REPORT_REASON_LABEL: Record<ReportEntry['reason'], string> = {
  HARASSMENT: 'Обиди или тормоз',
  OFFENSIVE_CONTENT: 'Неприлично име или съдържание',
  SPAM: 'Спам',
  CHEATING: 'Измама или бот',
  OTHER: 'Друго',
};

const REPORT_STATUS_LABEL: Record<ReportEntry['status'], string> = {
  OPEN: 'Отворен',
  RESOLVED: 'Решен',
  DISMISSED: 'Отхвърлен',
};

/**
 * Moderation queue (owner decision, 2026-10-12). Reports are grouped by who/what
 * was reported; each shows its reporter's track record so report abuse is easy
 * to spot. Nothing here punishes anyone automatically — ban/rename stay on the
 * Players tab ("Отвори играча" jumps there).
 */
function ReportsPanel({ onOpenPlayer }: { onOpenPlayer: (username: string) => void }) {
  const [view, setView] = useState<'open' | 'closed'>('open');
  const [groups, setGroups] = useState<ReportGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function load(which = view) {
    setError(null);
    adminFetch<{ groups: ReportGroup[] }>(`/admin/reports?view=${which}`)
      .then((res) => setGroups(res.groups))
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }

  useEffect(() => {
    load(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function resolve(reportIds: string[], status: 'RESOLVED' | 'DISMISSED', noteKey: string) {
    setError(null);
    try {
      await adminFetch('/admin/reports/resolve', { method: 'POST', body: { reportIds, status, note: notes[noteKey] || undefined } });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  async function deleteMessage(messageId: string) {
    setError(null);
    try {
      await adminFetch(`/admin/clan-messages/${messageId}`, { method: 'DELETE' });
      setConfirmDelete(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  const btn = 'rounded-md border px-2.5 py-1 text-[11px] hover:bg-accentBgHover';

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Доклади от играчи</h2>
        <div className="flex gap-2">
          {(['open', 'closed'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`${btn} ${view === v ? 'border-accent bg-accentBg' : 'border-panelBorder text-textMuted'}`}
            >
              {v === 'open' ? 'Отворени' : 'Затворени (последни 100)'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}
      {groups && groups.length === 0 && <p className="text-xs text-textFaint">{view === 'open' ? 'Няма отворени доклади.' : 'Няма затворени доклади.'}</p>}

      <div className="flex flex-col gap-4">
        {groups?.map((group) => {
          const openIds = group.reports.filter((r) => r.status === 'OPEN').map((r) => r.id);
          return (
            <div key={group.key} className="rounded-md border border-wellBorder bg-well p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  {group.targetKind === 'PLAYER' ? (
                    <>
                      <span className="text-textFaint">Играч: </span>
                      <span className="font-semibold">{group.targetUsername ?? '(изтрит)'}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-textFaint">Клан: </span>
                      <span className="font-semibold">
                        {group.targetClanTag ? `[${group.targetClanTag}] ${group.targetClanName}` : '(разпуснат)'}
                      </span>
                    </>
                  )}
                  <span className="ml-2 text-xs text-textMuted">
                    {group.reports.length} доклада от {group.uniqueReporters} играчи
                  </span>
                </div>
                {group.targetKind === 'PLAYER' && group.targetUsername && (
                  <button type="button" onClick={() => onOpenPlayer(group.targetUsername!)} className={`${btn} border-accent`}>
                    Отвори играча
                  </button>
                )}
              </div>

              {group.topReporterClan && (
                <p className="mb-2 text-xs text-gold">
                  ⚠ {group.topReporterClan.reporters} от докладващите са от клана [{group.topReporterClan.tag}] — възможно организирано докладване.
                </p>
              )}

              <div className="flex flex-col gap-2">
                {group.reports.map((report) => {
                  const suspicious = report.reporter.totalReports >= 3 && report.reporter.dismissedReports / report.reporter.totalReports >= 0.5;
                  return (
                    <div key={report.id} className="rounded border border-wellBorder bg-panel p-2.5 text-xs">
                      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold">{REPORT_REASON_LABEL[report.reason]}</span>
                        <span className="text-textFaint">{REPORT_TYPE_LABEL[report.targetType]}</span>
                        <span className="text-textFaint">{new Date(report.createdAt).toLocaleString('bg-BG')}</span>
                        {report.status !== 'OPEN' && (
                          <span className={report.status === 'RESOLVED' ? 'text-positive' : 'text-textMuted'}>
                            {REPORT_STATUS_LABEL[report.status]}
                            {report.resolvedByAdmin ? ` от ${report.resolvedByAdmin}` : ''}
                          </span>
                        )}
                      </div>
                      <p className="mb-1 text-textMuted">
                        Докладвал: {report.reporter.username}
                        {report.reporter.clanTag ? ` [${report.reporter.clanTag}]` : ''} ·{' '}
                        <span className={suspicious ? 'text-danger' : ''}>
                          {report.reporter.totalReports} доклада, {report.reporter.dismissedReports} отхвърлени
                        </span>
                      </p>
                      <pre className="mb-1 whitespace-pre-wrap break-words rounded border border-wellBorder bg-well p-2 font-sans text-text">
                        {report.contentSnapshot}
                      </pre>
                      {report.comment && <p className="mb-1 text-textMuted">Коментар: „{report.comment}“</p>}
                      {report.resolutionNote && <p className="mb-1 text-textFaint">Бележка: {report.resolutionNote}</p>}

                      {report.status === 'OPEN' && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={notes[report.id] ?? ''}
                            onChange={(e) => setNotes({ ...notes, [report.id]: e.target.value })}
                            placeholder="бележка (по желание)"
                            maxLength={500}
                            className="min-w-[160px] flex-1 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent"
                          />
                          <button type="button" onClick={() => resolve([report.id], 'RESOLVED', report.id)} className={`${btn} border-accent`}>
                            Решен
                          </button>
                          <button type="button" onClick={() => resolve([report.id], 'DISMISSED', report.id)} className={`${btn} border-panelBorder text-textMuted`}>
                            Отхвърлен
                          </button>
                          {report.targetType === 'CLAN_MESSAGE' &&
                            report.messageStillExists &&
                            (confirmDelete === report.targetId ? (
                              <>
                                <button type="button" onClick={() => deleteMessage(report.targetId)} className={`${btn} border-panelBorderDanger text-danger`}>
                                  Потвърди изтриване
                                </button>
                                <button type="button" onClick={() => setConfirmDelete(null)} className={`${btn} border-panelBorder text-textMuted`}>
                                  Отказ
                                </button>
                              </>
                            ) : (
                              <button type="button" onClick={() => setConfirmDelete(report.targetId)} className={`${btn} border-panelBorderDanger text-danger`}>
                                Изтрий съобщението
                              </button>
                            ))}
                          {report.targetType === 'CLAN_MESSAGE' && report.messageStillExists === false && (
                            <span className="text-textFaint">съобщението вече е изтрито</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {openIds.length > 1 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-wellBorder pt-3">
                  <span className="text-xs text-textFaint">Всички {openIds.length} отворени:</span>
                  <input
                    type="text"
                    value={notes[group.key] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [group.key]: e.target.value })}
                    placeholder="бележка (по желание)"
                    maxLength={500}
                    className="min-w-[160px] flex-1 rounded-md border border-wellBorder bg-panel px-2 py-1 text-xs outline-none focus:border-accent"
                  />
                  <button type="button" onClick={() => resolve(openIds, 'RESOLVED', group.key)} className={`${btn} border-accent`}>
                    Реши всички
                  </button>
                  <button type="button" onClick={() => resolve(openIds, 'DISMISSED', group.key)} className={`${btn} border-panelBorder text-textMuted`}>
                    Отхвърли всички
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Inline editor for one staff account (owner decision, 2026-10-12): change
 * role, issue a new random password (shown once), deactivate/re-activate.
 * Every action signs that account out everywhere (server-side tokenVersion).
 */
function AdminAccountEditor({ account, onChanged }: { account: AdminAccount; onChanged: () => void }) {
  const [role, setRole] = useState(account.role);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'password' | 'deactivate' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, done: string) {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(done);
      setConfirming(null);
      onChanged();
    } catch (err) {
      setError(accountError(err));
    }
  }

  const btn = 'rounded-md border px-3 py-1.5 text-xs hover:bg-accentBgHover';

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          роля
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-md border border-wellBorder bg-panel px-3 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="MODERATOR">MODERATOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>
        <button
          type="button"
          disabled={role === account.role}
          onClick={() => run(() => adminFetch(`/admin/admins/${account.id}/role`, { method: 'POST', body: { role } }), 'Ролята е сменена.')}
          className={`${btn} border-accent disabled:cursor-not-allowed disabled:opacity-30`}
        >
          Запази ролята
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {confirming === 'password' ? (
          <>
            <span className="text-textMuted">Нова парола за {account.username}? Старата спира да работи веднага.</span>
            <button
              type="button"
              onClick={() =>
                run(async () => {
                  const res = await adminFetch<{ password: string }>(`/admin/admins/${account.id}/reset-password`, { method: 'POST' });
                  setNewPassword(res.password);
                }, 'Паролата е сменена.')
              }
              className={`${btn} border-accent`}
            >
              Да, генерирай
            </button>
            <button type="button" onClick={() => setConfirming(null)} className={`${btn} border-panelBorder text-textMuted`}>
              Отказ
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming('password')} className={`${btn} border-accent`}>
            Нова парола
          </button>
        )}

        {account.isActive ? (
          confirming === 'deactivate' ? (
            <>
              <span className="text-textMuted">Деактивиране на {account.username}? Губи достъп веднага.</span>
              <button
                type="button"
                onClick={() => run(() => adminFetch(`/admin/admins/${account.id}/active`, { method: 'POST', body: { active: false } }), 'Акаунтът е деактивиран.')}
                className={`${btn} border-panelBorderDanger text-danger`}
              >
                Да, деактивирай
              </button>
              <button type="button" onClick={() => setConfirming(null)} className={`${btn} border-panelBorder text-textMuted`}>
                Отказ
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming('deactivate')} className={`${btn} border-panelBorderDanger text-danger`}>
              Деактивирай
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => run(() => adminFetch(`/admin/admins/${account.id}/active`, { method: 'POST', body: { active: true } }), 'Акаунтът е активиран отново.')}
            className={`${btn} border-accent`}
          >
            Активирай отново
          </button>
        )}
      </div>

      {newPassword && (
        <p className="text-xs text-positive">
          Нова парола за {account.username} (показва се само сега): <span className="font-mono">{newPassword}</span>
        </p>
      )}
      {message && <p className="text-xs text-positive">{message}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Any signed-in staff account (ADMIN or MODERATOR) can change its own password — opened from their own row in the Admins tab. */
function OwnPasswordPanel({ onTokenChange }: { onTokenChange: (token: string) => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword.length < 10) {
      setError('Новата парола трябва да е поне 10 символа.');
      return;
    }
    if (newPassword !== repeat) {
      setError('Новите пароли не съвпадат.');
      return;
    }
    try {
      // Other sessions of this account are signed out; this one gets a fresh token.
      const res = await adminFetch<{ accessToken: string }>('/admin/me/password', { method: 'POST', body: { currentPassword, newPassword } });
      onTokenChange(res.accessToken);
      setCurrentPassword('');
      setNewPassword('');
      setRepeat('');
      setMessage('Паролата е сменена. Входовете от други устройства са прекратени.');
    } catch (err) {
      setError(accountError(err));
    }
  }

  const input = 'rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent';
  return (
    <div className="px-3 py-3">
      <h3 className="mb-2 text-xs font-semibold">Смяна на паролата ми</h3>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          текуща парола
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          нова парола (мин. 10 символа)
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          повтори новата
          <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={input} />
        </label>
        <button type="submit" className="rounded-md border border-accent bg-accentBg px-3 py-2 text-sm hover:bg-accentBgHover">
          Смени
        </button>
      </form>
      {message && <p className="mt-2 text-xs text-positive">{message}</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Global (non-seasonal) game settings (owner decision, 2026-10-12). ADMIN edits, MODERATOR views. */
function GameSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const [graceDays, setGraceDays] = useState<number | null>(null);
  const [resetDelayDays, setResetDelayDays] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ accountDeletionGraceDays: number; seasonResetDelayDays: number }>('/admin/game-settings')
      .then((res) => {
        setGraceDays(res.accountDeletionGraceDays);
        setResetDelayDays(res.seasonResetDelayDays);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (graceDays === null || resetDelayDays === null) return;
    setError(null);
    setSaved(false);
    try {
      const res = await adminFetch<{ accountDeletionGraceDays: number; seasonResetDelayDays: number }>('/admin/game-settings', {
        method: 'POST',
        body: { accountDeletionGraceDays: graceDays, seasonResetDelayDays: resetDelayDays },
      });
      setGraceDays(res.accountDeletionGraceDays);
      setResetDelayDays(res.seasonResetDelayDays);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">Настройки на играта</h2>
      <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          дни за отказ от изтриване на акаунт
          <input
            type="number"
            min={0}
            max={30}
            value={graceDays ?? ''}
            disabled={!canEdit || graceDays === null}
            onChange={(e) => setGraceDays(Number(e.target.value))}
            className="w-24 rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          дни след края на сезона до нулирането
          <input
            type="number"
            min={0}
            max={30}
            value={resetDelayDays ?? ''}
            disabled={!canEdit || resetDelayDays === null}
            onChange={(e) => setResetDelayDays(Number(e.target.value))}
            className="w-24 rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          />
        </label>
        <button
          type="submit"
          disabled={!canEdit}
          className="rounded-md border border-accent bg-accentBg px-3 py-2 text-sm hover:bg-accentBgHover disabled:cursor-not-allowed disabled:opacity-30"
        >
          Запази
        </button>
      </form>
      <p className="mt-2 text-[10px] text-textFaint">
        Дните за изтриване важат за заявките, подадени отсега нататък. Нулирането на сезона става автоматично толкова дни след затварянето на Ядрото.
      </p>
      {!canEdit && <p className="mt-2 text-xs text-textFaint">Само ADMIN може да променя тези настройки.</p>}
      {saved && <p className="mt-2 text-xs text-positive">Запазено.</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}

interface BannedWordRow {
  id: string;
  word: string;
  normalized: string;
  match: 'WHOLE_WORD' | 'SUBSTRING';
  createdBy: string | null;
  createdAt: string;
}

const MATCH_LABEL: Record<BannedWordRow['match'], string> = {
  SUBSTRING: 'навсякъде',
  WHOLE_WORD: 'само цяла дума',
};

/**
 * Content filter word list (owner decision, 2026-10-12). Names/descriptions
 * containing a listed word are rejected; clan chat and DMs get it masked with
 * asterisks. Changes apply immediately. Both roles can manage it.
 */
function ContentFilterPanel() {
  const [words, setWords] = useState<BannedWordRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [newWord, setNewWord] = useState('');
  const [newMatch, setNewMatch] = useState<BannedWordRow['match']>('SUBSTRING');
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<{ matches: string[]; masked: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    adminFetch<BannedWordRow[]>('/admin/content-filter/words')
      .then(setWords)
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await adminFetch('/admin/content-filter/words', { method: 'POST', body: { word: newWord, match: newMatch } });
      setNewWord('');
      load();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(code === 'WORD_ALREADY_LISTED' ? 'Тази дума вече е в списъка.' : code === 'WORD_TOO_SHORT' ? 'Думата е твърде къса.' : code || 'Грешка');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await adminFetch(`/admin/content-filter/words/${id}`, { method: 'DELETE' });
      setConfirmRemove(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setTestResult(await adminFetch<{ matches: string[]; masked: string }>('/admin/content-filter/test', { method: 'POST', body: { text: testText } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  const visible = words?.filter((w) => !search || w.word.toLowerCase().includes(search.toLowerCase()) || w.normalized.includes(search.toLowerCase()));
  const input = 'rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent';
  const btn = 'rounded-md border px-3 py-2 text-sm hover:bg-accentBgHover';

  return (
    <>
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="mb-1 text-sm font-semibold">Проба</h2>
        <p className="mb-3 text-xs text-textFaint">Въведи текст, за да видиш дали минава и как би изглеждал в чата.</p>
        <form onSubmit={handleTest} className="flex flex-wrap items-end gap-2">
          <input type="text" value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="текст за проба" className={`${input} min-w-[240px] flex-1`} />
          <button type="submit" disabled={!testText.trim()} className={`${btn} border-accent bg-accentBg disabled:opacity-30`}>
            Провери
          </button>
        </form>
        {testResult && (
          <div className="mt-3 text-xs">
            {testResult.matches.length === 0 ? (
              <p className="text-positive">Минава — няма забранени думи.</p>
            ) : (
              <>
                <p className="text-danger">Хваща: {testResult.matches.join(', ')} — име/описание с този текст ще бъде отказано.</p>
                <p className="mt-1 text-textMuted">В чата ще изглежда така: „{testResult.masked}“</p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="mb-1 text-sm font-semibold">Забранени думи {words && <span className="text-textFaint">({words.length})</span>}</h2>
        <p className="mb-3 text-xs text-textFaint">
          „Навсякъде“ хваща думата дори залепена за други букви. „Само цяла дума“ е за къси думи, които иначе се срещат в нормални думи (напр. „ass“ в
          „class“). Промените важат веднага.
        </p>

        <form onSubmit={handleAdd} className="mb-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[10px] text-textFaint">
            нова дума
            <input type="text" value={newWord} onChange={(e) => setNewWord(e.target.value)} maxLength={40} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-textFaint">
            хваща се
            <select value={newMatch} onChange={(e) => setNewMatch(e.target.value as BannedWordRow['match'])} className={input}>
              <option value="SUBSTRING">навсякъде</option>
              <option value="WHOLE_WORD">само цяла дума</option>
            </select>
          </label>
          <button type="submit" disabled={newWord.trim().length < 2} className={`${btn} border-accent bg-accentBg disabled:opacity-30`}>
            Добави
          </button>
        </form>

        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="търси в списъка" className={`${input} mb-2 w-full sm:w-64`} />

        {visible && (
          <div className="overflow-x-auto rounded-md border border-wellBorder">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-wellBorder bg-well text-[10px] uppercase text-textFaint">
                  <th className="px-3 py-2">Дума</th>
                  <th className="px-3 py-2">Хваща се</th>
                  <th className="px-3 py-2">Добавена от</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((w) => (
                  <tr key={w.id} className="border-b border-wellBorder last:border-b-0">
                    <td className="px-3 py-1.5">
                      {w.word} <span className="text-textFaint">({w.normalized})</span>
                    </td>
                    <td className="px-3 py-1.5 text-textMuted">{MATCH_LABEL[w.match]}</td>
                    <td className="px-3 py-1.5 text-textFaint">{w.createdBy === 'seed' ? 'начален списък' : (w.createdBy ?? '—')}</td>
                    <td className="px-3 py-1.5 text-right">
                      {confirmRemove === w.id ? (
                        <>
                          <button type="button" onClick={() => handleRemove(w.id)} className="mr-2 text-danger underline">
                            Потвърди
                          </button>
                          <button type="button" onClick={() => setConfirmRemove(null)} className="text-textFaint underline">
                            Отказ
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmRemove(w.id)} className="text-textFaint underline hover:text-danger">
                          Премахни
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </section>
    </>
  );
}

/**
 * "Reset now" (owner decision, 2026-10-13) — ADMIN only, once the Core has
 * closed. Otherwise the reset happens on its own at resetAt. Confirmed with
 * the new season's number and the admin's password.
 */
function ResetSeasonNow({ currentSeasonId, onDone }: { currentSeasonId: number; onDone: (settings: SeasonSettings) => void }) {
  const [open, setOpen] = useState(false);
  const [seasonNumber, setSeasonNumber] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newSeason = currentSeasonId + 1;

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminFetch('/admin/season/reset', { method: 'POST', body: { newSeasonNumber: Number(seasonNumber), password } });
      onDone(await adminFetch<SeasonSettings>('/admin/season'));
      setOpen(false);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const map: Record<string, string> = {
        WRONG_PASSWORD: 'Грешна парола.',
        WRONG_SEASON_NUMBER: `Въведи ${newSeason} — номера на новия сезон.`,
        SEASON_NOT_ENDED: 'Сезонът още не е приключил.',
        SEASON_ALREADY_RESET: 'Сезонът вече е нулиран.',
        RESET_IN_PROGRESS: 'Нулирането вече тече.',
      };
      setError(map[code] ?? (code || 'Грешка'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 rounded-md border border-panelBorderDanger bg-well px-3 py-2 text-xs text-danger hover:bg-accentBgHover"
      >
        Нулирай сега и започни сезон {newSeason}
      </button>
    );
  }

  return (
    <form onSubmit={handleReset} className="mb-4 flex flex-col gap-2 rounded-md border border-panelBorderDanger bg-well p-3 text-xs">
      <p className="text-danger">
        Всички кланове се разпускат, а прогресът на всички играчи (нива, ресурси, сгради, предмети), историята на битките и клановите чатове се изтриват.
        Резултатите от сезона остават в профилите. Действието е необратимо — увери се, че има резервно копие.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          напиши {newSeason}
          <input type="number" value={seasonNumber} onChange={(e) => setSeasonNumber(e.target.value)} className="w-24 rounded-md border border-wellBorder bg-panel px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          твоята парола
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-md border border-wellBorder bg-panel px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>
        <button type="submit" disabled={busy || !seasonNumber || !password} className="rounded-md border border-panelBorderDanger px-3 py-2 text-sm text-danger hover:bg-accentBgHover disabled:opacity-30">
          {busy ? 'Нулиране…' : 'Нулирай'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-panelBorder px-3 py-2 text-sm text-textMuted hover:bg-accentBgHover">
          Отказ
        </button>
      </div>
      {error && <p className="text-danger">{error}</p>}
    </form>
  );
}

