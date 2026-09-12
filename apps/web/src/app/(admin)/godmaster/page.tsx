'use client';

import { useEffect, useRef, useState } from 'react';
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
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Заявката се провали (${response.status})`);
  }
  return response.json();
}

export default function GodmasterPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setToken(getToken());
    setReady(true);
  }, []);

  function handleLogin(newToken: string) {
    window.localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }

  function handleLogout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  if (!ready) return null;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold">godmaster</h1>
      {token ? <AdminPanel onLogout={handleLogout} /> : <LoginForm onLogin={handleLogin} />}
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

function AdminPanel({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex flex-col gap-8">
      <button type="button" onClick={onLogout} className="w-fit rounded-md border border-panelBorder bg-panel px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover">
        Изход
      </button>
      <ServerStatusPanel />
      <PlayerLookupPanel />
      <GrantResourceForm />
      <GrantItemForm />
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
};

/** Единен изглед на играч — избираш веднъж чрез търсачката, после виждаш профил, ресурси, екипировка, инвентар и историята на промените (AdminActionLog), плюс контроли за наказание и преименуване, направо тук. */
function PlayerLookupPanel() {
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

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">Търсене на играч</h2>
      <PlayerAutocomplete value={username} onChange={setUsername} onSelect={loadPlayer} />
      {loading && <p className="mt-3 text-xs text-textFaint">Зареждане...</p>}
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      {detail && <PlayerDetailView detail={detail} onReload={loadPlayer} />}
    </section>
  );
}

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
  load: { '1m': number; '5m': number; '15m': number };
  memory: { totalMb: number; usedMb: number; availableMb: number };
  disk: { totalKb: number; usedKb: number; availableKb: number; usePercent: number };
  containers: ContainerStatus[];
}

interface ServerStatusResponse {
  server: ServerStatus | null;
  backupLogTail: string[];
  errors: string[];
}

const POLL_INTERVAL_MS = 30_000;

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
            <StatBox label="Натоварване (1м)" value={server.load['1m'].toFixed(2)} />
            <StatBox label="Памет" value={`${server.memory.usedMb} / ${server.memory.totalMb} MB`} />
            <StatBox label="Диск" value={`${server.disk.usePercent}%`} />
            <StatBox
              label="Последен бекъп"
              value={lastBackupOk === null ? '—' : lastBackupOk ? 'Успешен' : 'Неуспешен'}
              tone={lastBackupOk === null ? undefined : lastBackupOk ? 'good' : 'bad'}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-textFaint">Контейнери</p>
            <div className="flex flex-col gap-1">
              {server.containers.map((c) => (
                <div key={c.name} className="flex items-center justify-between rounded-md border border-wellBorder bg-well px-3 py-1.5">
                  <span>{c.service}</span>
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

function StatBox({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-md border border-wellBorder bg-well px-3 py-2">
      <p className="text-[10px] text-textFaint">{label}</p>
      <p className={tone === 'good' ? 'text-positive' : tone === 'bad' ? 'text-danger' : ''}>{value}</p>
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

  function handleInput(next: string) {
    onChange(next);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.length < 2) {
      setHits([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      adminFetch<PlayerHit[]>(`/admin/players/search?q=${encodeURIComponent(next)}`)
        .then(setHits)
        .catch(() => setHits([]));
    }, 200);
  }

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="потребителско име"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => setOpen(true)}
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
}

/** Loaded once (small dataset), then filtered client-side by both key and resolved Bulgarian name. */
function ItemAutocomplete({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [allItems, setAllItems] = useState<ItemHit[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    adminFetch<ItemHit[]>('/admin/items').then(setAllItems).catch(() => setAllItems([]));
  }, []);

  const needle = query.trim().toLowerCase();
  const matches =
    needle.length < 1
      ? []
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
      {value && <p className="mt-1 text-[11px] text-textFaint">Избрано: {resolveMessageKey(`items.${value}.name`)} ({value})</p>}
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-80 max-h-64 overflow-y-auto rounded-md border border-panelBorder bg-panel text-sm shadow-lg">
          {matches.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => {
                  onChange(item.key);
                  setQuery(resolveMessageKey(item.nameKey));
                  setOpen(false);
                }}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-accentBgHover"
              >
                <span>{resolveMessageKey(item.nameKey)}</span>
                <span className="text-[10px] text-textFaint">{item.key}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GrantResourceForm() {
  const [username, setUsername] = useState('');
  const [resourceType, setResourceType] = useState<'METAL' | 'CRYSTAL' | 'CREDITS'>('CREDITS');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const res = await adminFetch<{ username: string; resourceType: string; newAmount: number }>('/admin/grant/resource', {
        method: 'POST',
        body: { username, resourceType, amount: Number(amount) },
      });
      setMessage(`${res.username} вече има ${res.newAmount} ${RESOURCE_LABEL[res.resourceType as keyof typeof RESOURCE_LABEL]}`);
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">Добави ресурс</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <PlayerAutocomplete value={username} onChange={setUsername} />
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

function GrantItemForm() {
  const [username, setUsername] = useState('');
  const [itemDefinitionKey, setItemDefinitionKey] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (!itemDefinitionKey) {
      setError('Избери предмет от списъка');
      return;
    }
    try {
      const res = await adminFetch<{ username: string; itemDefinitionKey: string; granted: number }>('/admin/grant/item', {
        method: 'POST',
        body: { username, itemDefinitionKey, quantity: Number(quantity) },
      });
      setMessage(`Дадени ${res.granted}x ${resolveMessageKey(`items.${res.itemDefinitionKey}.name`)} на ${res.username}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold">Добави предмет</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <PlayerAutocomplete value={username} onChange={setUsername} />
        <ItemAutocomplete value={itemDefinitionKey} onChange={setItemDefinitionKey} />
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
