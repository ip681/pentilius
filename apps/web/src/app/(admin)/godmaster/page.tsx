'use client';

import type {
  AdminAuditFileDto,
  AdminSaleDocumentRowDto,
  AdminSellerSettingsDto,
  SaleDocumentDto,
  SellerInfoDto,
  AdminAnnouncementDto,
  AdminAnnouncementsDto,
  AnnouncementKind,
  AnnouncementStatus,
  SaveAnnouncementDto,
  AdminBuildingBalanceDto,
  AdminClanBalanceDto,
  AdminBossBalanceDto,
  AdminEquipmentBalanceDto,
  AdminExpeditionBalanceDto,
  AdminOtherBalanceDto,
  AdminPlayerLoginsDto,
  AdminRewardBalanceDto,
  AdminShopDto,
  AdminShopItemDto,
  AdminPaymentProductDto,
  AdminPentiliBalanceDto,
  AdminXpBalanceDto,
  AdminXpLevelDto,
  BalanceCurveDto,
  BossBalanceConfigDto,
  BuildingBalanceConfigDto,
  ClanBalanceConfigDto,
  EquipmentBalanceConfigDto,
  EquipmentSlotStatsDto,
  EquipmentSplitDto,
  ExpeditionBalanceConfigDto,
  RewardBalanceConfigDto,
  PentiliBalanceConfigDto,
  PentiliZoneBalanceDto,
  XpBalanceConfigDto,
  AdminPaymentsSettingsDto,
  AdminPurchasesResponseDto,
  AdminSupportTicketDetailDto,
  AdminSupportTicketsDto,
} from '@pentilius/shared';
import { SUPPORTED_LOCALES } from '@pentilius/shared';
import { Fragment, useEffect, useRef, useState } from 'react';
// Plain JSON import — godmaster deliberately has no next-intl setup (see the
// (admin) layout comment), so item display names are resolved by hand from
// the same message file the player app uses, not a duplicated translation system.
import bgMessages from '@pentilius/shared/messages/bg.json';

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

// Same number format as the game (lib/format-number.ts), kept as godmaster's own copy:
// a space between thousands from 4 digits up ("8 230").
const GM_NUMBER = new Intl.NumberFormat('bg-BG', { useGrouping: 'always' as unknown as boolean, maximumFractionDigits: 2 });
function gmNumber(value: number): string {
  return GM_NUMBER.format(value);
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
    <main className="mx-auto min-h-screen max-w-4xl overflow-x-hidden px-3 py-6 sm:px-4 sm:py-10">
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
  { key: 'support', label: 'Обратна връзка' },
  { key: 'filter', label: 'Филтър' },
  { key: 'admins', label: 'Админи' },
  { key: 'settings', label: 'Настройки' },
  { key: 'payments', label: 'Плащания' },
  { key: 'balance', label: 'Баланс' },
  { key: 'announcements', label: 'Съобщения' },
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

  // Every tab is visible to both roles (the Admins tab shows a MODERATOR only
  // their own account) — except Payments, Balance and Announcements, which are ADMIN only (the API re-checks).
  const visibleTabs = TABS.filter((t) => (t.key !== 'payments' && t.key !== 'balance' && t.key !== 'announcements') || role === 'ADMIN');

  // Conversations waiting for staff — the badge on the "Обратна връзка" tab.
  const [supportOpen, setSupportOpen] = useState(0);
  useEffect(() => {
    const load = () =>
      adminFetch<AdminSupportTicketsDto>('/admin/support?status=OPEN')
        .then((res) => setSupportOpen(res.openCount))
        .catch(() => undefined);
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [tab]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-2">
        {/* Phones: one dropdown instead of a row of buttons that widens the page (owner, 2026-10-19). */}
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as AdminTab)}
          className="min-w-0 flex-1 rounded-md border border-accent bg-accentBg px-3 py-2 text-sm md:hidden"
        >
          {visibleTabs.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
              {t.key === 'support' && supportOpen > 0 ? ` (${supportOpen})` : ''}
            </option>
          ))}
        </select>
        <div className="hidden flex-wrap gap-2 md:flex">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md border px-3 py-1.5 text-xs ${tab === t.key ? 'border-accent bg-accentBg' : 'border-panelBorder bg-panel text-textMuted hover:bg-accentBgHover'}`}
            >
              {t.label}
              {t.key === 'support' && supportOpen > 0 && <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[10px] text-white">{supportOpen}</span>}
            </button>
          ))}
        </div>
        <button type="button" onClick={onLogout} className="w-fit shrink-0 rounded-md border border-panelBorder bg-panel px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover">
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

      {tab === 'payments' && role === 'ADMIN' && <PaymentsPanel />}

      {tab === 'balance' && role === 'ADMIN' && <BalancePanel />}

      {tab === 'announcements' && role === 'ADMIN' && <AnnouncementsPanel />}

      {tab === 'settings' && (
        <>
          <SeasonSettingsPanel canEdit={role === 'ADMIN'} />
          <GameSettingsPanel canEdit={role === 'ADMIN'} />
          {role === 'ADMIN' && <TechnicalSettingsPanel />}
        </>
      )}

      {tab === 'support' && (
        <SupportPanel
          onOpenPlayer={(name) => {
            setTab('players');
            loadPlayer(name);
          }}
        />
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
    vipUntil: string | null;
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
  SUPPORT_REPLY: 'Отговор на съобщение',
  SUPPORT_CLOSE: 'Затворено съобщение',
  SUPPORT_REOPEN: 'Отворено отново съобщение',
  GRANT_VIP: 'Даден VIP',
  SET_PLAYER_PASSWORD: 'Сменена парола',
  REVOKE_VIP: 'Премахнат VIP',
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

      <VipControls username={profile.username} vipUntil={profile.vipUntil} onReload={onReload} />

      <PasswordControls username={profile.username} onReload={onReload} />

      <PlayerLoginsControls key={profile.id} playerId={profile.id} onOpenPlayer={onReload} />

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
          <div className="max-w-full overflow-x-auto">
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
      </div>

      <div>
        <p className="mb-1 text-[11px] font-medium text-textFaint">История на промените (AdminActionLog)</p>
        <div className="max-h-48 overflow-y-auto rounded-md border border-wellBorder">
          <div className="max-w-full overflow-x-auto">
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

/**
 * Set a player's password by hand (owner decision, 2026-10-13) — for support
 * cases until email-based password reset exists. ADMIN only (the server checks).
 */
function PasswordControls({ username, onReload }: { username: string; onReload: (username: string) => void }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setMessage(null);
    setError(null);
    if (password.length < 8) {
      setError('Паролата трябва да е поне 8 символа');
      return;
    }
    try {
      await adminFetch('/admin/players/password', { method: 'POST', body: { username, newPassword: password } });
      setMessage(`Паролата на ${username} е сменена`);
      setPassword('');
      onReload(username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-wellBorder bg-well p-3 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          нова парола (поне 8 символа)
          <input
            type="text"
            value={password}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setPassword(e.target.value)}
            className="w-48 rounded-md border border-wellBorder bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
        </label>
        <button type="button" onClick={submit} className="rounded-md border border-accent px-3 py-1.5 text-[11px] hover:bg-accentBgHover">
          Смени паролата
        </button>
      </div>
      {message && <p className="text-positive">{message}</p>}
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

/**
 * VIP (owner decision, 2026-10-13) — granted by hand until there is a payment
 * flow. Adding days extends an active VIP from its current end. ADMIN only.
 */
function VipControls({ username, vipUntil, onReload }: { username: string; vipUntil: string | null; onReload: (username: string) => void }) {
  const [days, setDays] = useState('30');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = !!vipUntil && new Date(vipUntil) > new Date();

  async function submit(value: number) {
    setMessage(null);
    setError(null);
    try {
      await adminFetch('/admin/players/vip', { method: 'POST', body: { username, days: value } });
      setMessage(value > 0 ? `VIP удължен с ${value} дни` : 'VIP е премахнат');
      onReload(username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-wellBorder bg-well p-3 text-xs">
      <p className={active ? 'text-vip' : 'text-textFaint'}>
        {active ? `VIP до ${new Date(vipUntil as string).toLocaleString('bg-BG')}` : 'Няма VIP'}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {[7, 30].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => submit(preset)}
            className="rounded-md border border-vip px-3 py-1.5 text-[11px] text-vip hover:bg-accentBgHover"
          >
            +{preset} дни
          </button>
        ))}
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          дни
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-20 rounded-md border border-wellBorder bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
        </label>
        <button
          type="button"
          onClick={() => Number(days) > 0 && submit(Number(days))}
          className="rounded-md border border-vip px-3 py-1.5 text-[11px] text-vip hover:bg-accentBgHover"
        >
          Дай VIP
        </button>
        {active && (
          <button type="button" onClick={() => submit(0)} className="rounded-md border border-danger px-3 py-1.5 text-[11px] text-danger hover:bg-accentBgHover">
            Махни VIP
          </button>
        )}
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
  // swap* since 2026-10-13 (2GB /swapfile); absent in older snapshots.
  memory: { totalMb: number; usedMb: number; availableMb: number; swapTotalMb?: number; swapUsedMb?: number };
  disk: { totalKb: number; usedKb: number; availableKb: number; usePercent: number };
  containers: ContainerStatus[];
}

interface LoadHistoryPoint {
  timestamp: string;
  load1m: number;
  cpuCores: number;
  memUsedMb: number;
  memTotalMb: number;
  swapUsedMb?: number;
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
            {/* Swap (owner decision, 2026-10-13): any steady use means RAM is getting short. */}
            {server.memory.swapTotalMb ? (
              <StatBox
                label="Swap (резервна памет)"
                value={`${((server.memory.swapUsedMb ?? 0) / 1024).toFixed(1)} / ${(server.memory.swapTotalMb / 1024).toFixed(1)} GB (${Math.round(((server.memory.swapUsedMb ?? 0) / server.memory.swapTotalMb) * 100)}%)`}
                percent={((server.memory.swapUsedMb ?? 0) / server.memory.swapTotalMb) * 100}
                thresholds={[10, 40]}
              />
            ) : null}
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
                ...(server.memory.swapTotalMb
                  ? [{ label: 'Swap', colorClassName: 'text-danger', getPercent: (p: LoadHistoryPoint) => ((p.swapUsedMb ?? 0) / server.memory.swapTotalMb!) * 100 }]
                  : []),
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

function StatBox({
  label,
  value,
  tone,
  percent,
  thresholds,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
  percent?: number;
  thresholds?: [number, number];
}) {
  return (
    <div className="rounded-md border border-wellBorder bg-well px-3 py-2">
      <p className="text-[10px] text-textFaint">{label}</p>
      <p className={tone === 'good' ? 'text-positive' : tone === 'bad' ? 'text-danger' : ''}>{value}</p>
      {percent !== undefined && <UsageBar percent={percent} thresholds={thresholds} />}
    </div>
  );
}

/**
 * Green below the first threshold, gold up to the second, red above — 75/90 by
 * default (swap uses stricter ones). A rough eyeball guide, not alerting.
 */
function UsageBar({ percent, thresholds = [75, 90] }: { percent: number; thresholds?: [number, number] }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = percent >= thresholds[1] ? 'bg-danger' : percent >= thresholds[0] ? 'bg-gold' : 'bg-positive';
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
        <ul className="absolute z-10 mt-1 w-80 max-w-full max-h-64 overflow-y-auto rounded-md border border-panelBorder bg-panel text-sm shadow-lg">
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
          <div className="max-w-full overflow-x-auto">
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
          <div className="max-w-full overflow-x-auto">
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

const LOCALE_LABELS: Record<string, string> = { en: 'Английски', bg: 'Български' };
const localeLabel = (code: string) => LOCALE_LABELS[code] ?? code.toUpperCase();

const ANNOUNCEMENT_ERRORS: Record<string, string> = {
  ENGLISH_TEXT_REQUIRED: 'Английският текст е задължителен.',
  TEXT_TOO_LONG: 'Текстът е твърде дълъг.',
  BAD_TIME_RANGE: 'Краят трябва да е след началото.',
  UNKNOWN_LOCALE: 'Непознат език.',
};
const announcementError = (err: unknown) => {
  const message = err instanceof Error ? err.message : '';
  return Object.entries(ANNOUNCEMENT_ERRORS).find(([code]) => message.includes(code))?.[1] ?? (message || 'Грешка');
};

const STATUS_LABELS: Record<AnnouncementStatus, [string, string]> = {
  SCHEDULED: ['Планирано', 'border-panelBorder text-textMuted'],
  ACTIVE: ['Активно', 'border-positive text-positive'],
  ENDED: ['Изтекло', 'border-panelBorder text-textFaint'],
};

type AnnouncementForm = {
  id: string | null;
  kind: AnnouncementKind;
  texts: Record<string, string>;
  everyone: boolean;
  locales: string[];
  startsAt: string;
  endsAt: string;
};

function newAnnouncementForm(): AnnouncementForm {
  const now = new Date();
  return {
    id: null,
    kind: 'INFO',
    texts: {},
    everyone: true,
    locales: [],
    startsAt: toLocalInputValue(now.toISOString()),
    endsAt: toLocalInputValue(new Date(now.getTime() + 24 * 3600_000).toISOString()),
  };
}

/**
 * godmaster → Съобщения (owner decision, 2026-10-21): banners at the top of every
 * player page. English is required; a player whose language has no text gets English.
 */
function AnnouncementsPanel() {
  const [data, setData] = useState<AdminAnnouncementsDto | null>(null);
  const [form, setForm] = useState<AnnouncementForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    adminFetch<AdminAnnouncementsDto>('/admin/announcements')
      .then(setData)
      .catch((err) => setError(announcementError(err)));
  }
  useEffect(load, []);

  function edit(a: AdminAnnouncementDto) {
    setMessage(null);
    setError(null);
    setForm({
      id: a.id,
      kind: a.kind,
      texts: { ...a.texts },
      everyone: a.locales.length === 0,
      locales: a.locales,
      startsAt: toLocalInputValue(a.startsAt),
      endsAt: toLocalInputValue(a.endsAt),
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const body: SaveAnnouncementDto = {
      kind: form.kind,
      texts: form.texts,
      locales: form.everyone ? [] : form.locales,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    };
    try {
      await adminFetch(form.id ? `/admin/announcements/${form.id}` : '/admin/announcements', { method: form.id ? 'PUT' : 'POST', body });
      setForm(null);
      setMessage('Записано.');
      load();
    } catch (err) {
      setError(announcementError(err));
    } finally {
      setBusy(false);
    }
  }

  async function act(a: AdminAnnouncementDto, action: 'end' | 'delete') {
    const question =
      action === 'end' ? 'Да спра ли съобщението сега? Играчите спират да го виждат.' : 'Да изтрия ли съобщението завинаги? Няма връщане назад.';
    if (!window.confirm(question)) return;
    setError(null);
    setMessage(null);
    try {
      await adminFetch(action === 'end' ? `/admin/announcements/${a.id}/end` : `/admin/announcements/${a.id}`, { method: action === 'end' ? 'POST' : 'DELETE' });
      load();
    } catch (err) {
      setError(announcementError(err));
    }
  }

  const max = data?.maxTextLength ?? 500;
  const input = 'rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent';

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-lg border border-panelBorder bg-panel p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Съобщения до играчите</h2>
          {!form && (
            <button type="button" onClick={() => setForm(newAnnouncementForm())} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover">
              Ново съобщение
            </button>
          )}
        </div>
        <p className="text-[11px] text-textFaint">
          Показват се най-горе на всяка страница между началото и края. Играчът може да ги затвори с ×. Английският текст е задължителен — който няма текст
          на своя език, получава английския. Само текст, без линкове.
        </p>
        {message && <p className="mt-2 text-[11px] text-positive">{message}</p>}
        {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      </div>

      {form && (
        <div className="flex flex-col gap-4 rounded-lg border border-accent bg-panel p-4">
          <h3 className="text-sm font-semibold">{form.id ? 'Редакция' : 'Ново съобщение'}</h3>

          <div className="flex flex-wrap gap-4 text-xs">
            {(['INFO', 'IMPORTANT'] as const).map((kind) => (
              <label key={kind} className="flex items-center gap-2">
                <input type="radio" checked={form.kind === kind} onChange={() => setForm({ ...form, kind })} className="accent-accent" />
                {kind === 'INFO' ? 'Информация' : 'Важно (златисто)'}
              </label>
            ))}
          </div>

          {SUPPORTED_LOCALES.map((code) => {
            const text = form.texts[code] ?? '';
            return (
              <label key={code} className="flex flex-col gap-1 text-xs">
                <span className="flex items-center justify-between gap-2">
                  <span>
                    {localeLabel(code)}
                    {code === 'en' ? <span className="text-danger"> *</span> : <span className="text-textFaint"> (по желание)</span>}
                    {text.trim() ? <span className="ml-2 text-positive">✓ попълнен</span> : code !== 'en' && <span className="ml-2 text-textFaint">→ ще получат английския</span>}
                  </span>
                  <span className={`tabular-nums ${text.length > max ? 'text-danger' : 'text-textFaint'}`}>
                    {text.length}/{max}
                  </span>
                </span>
                <textarea
                  rows={3}
                  value={text}
                  onChange={(e) => setForm({ ...form, texts: { ...form.texts, [code]: e.target.value } })}
                  className={`${input} resize-y`}
                />
              </label>
            );
          })}

          <div className="flex flex-col gap-2 text-xs">
            <span>Кой го вижда</span>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" checked={form.everyone} onChange={() => setForm({ ...form, everyone: true })} className="accent-accent" />
                Всички играчи
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!form.everyone} onChange={() => setForm({ ...form, everyone: false })} className="accent-accent" />
                Само играчите на езиците:
              </label>
              {!form.everyone &&
                SUPPORTED_LOCALES.map((code) => (
                  <label key={code} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={form.locales.includes(code)}
                      onChange={(e) =>
                        setForm({ ...form, locales: e.target.checked ? [...form.locales, code] : form.locales.filter((l) => l !== code) })
                      }
                      className="accent-accent"
                    />
                    {localeLabel(code)}
                  </label>
                ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex flex-col gap-1">
              начало (местно време)
              <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={input} />
            </label>
            <label className="flex flex-col gap-1">
              край (местно време)
              <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={input} />
            </label>
          </div>

          <div className="flex flex-col gap-2 text-xs">
            <span className="text-textFaint">Преглед</span>
            {SUPPORTED_LOCALES.filter((code) => form.everyone || form.locales.includes(code)).map((code) => {
              const text = form.texts[code]?.trim() ? form.texts[code] : (form.texts.en ?? '');
              const important = form.kind === 'IMPORTANT';
              return (
                <div key={code} className={`rounded-lg border px-4 py-3 ${important ? 'border-gold bg-gold/10' : 'border-panelBorder bg-ink'}`}>
                  <div className={`mb-1 text-[9px] font-semibold uppercase tracking-wide ${important ? 'text-gold' : 'text-textFaint'}`}>
                    {localeLabel(code)} · {important ? 'Важно' : 'Съобщение от екипа'}
                  </div>
                  <p className="whitespace-pre-line break-words">{text || '—'}</p>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !form.texts.en?.trim() || (!form.everyone && form.locales.length === 0)}
              onClick={save}
              className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs hover:bg-accentBgHover disabled:opacity-50"
            >
              Запази
            </button>
            <button type="button" onClick={() => setForm(null)} className="rounded-md border border-panelBorder px-4 py-2 text-xs text-textMuted hover:bg-accentBgHover">
              Отказ
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {data?.items.length === 0 && <p className="text-xs text-textFaint">Няма съобщения.</p>}
        {data?.items.map((a) => {
          const [statusLabel, statusClass] = STATUS_LABELS[a.status];
          return (
            <div key={a.id} className="flex flex-col gap-2 rounded-lg border border-panelBorder bg-panel p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] ${statusClass}`}>{statusLabel}</span>
                <span className={a.kind === 'IMPORTANT' ? 'text-gold' : 'text-textMuted'}>{a.kind === 'IMPORTANT' ? 'Важно' : 'Информация'}</span>
                <span className="text-textFaint">
                  {new Date(a.startsAt).toLocaleString('bg-BG')} – {new Date(a.endsAt).toLocaleString('bg-BG')}
                </span>
              </div>
              <p className="whitespace-pre-line break-words">{a.texts.en}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-textFaint">
                <span>Езици: {SUPPORTED_LOCALES.map((code) => `${code.toUpperCase()} ${a.texts[code] ? '✓' : '—'}`).join('  ')}</span>
                <span>За: {a.locales.length === 0 ? 'всички' : a.locales.map(localeLabel).join(', ')}</span>
                <span>Затворили: {a.dismissedCount}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => edit(a)} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 hover:bg-accentBgHover">
                  Редактирай
                </button>
                {a.status !== 'ENDED' && (
                  <button type="button" onClick={() => act(a, 'end')} className="rounded-md border border-panelBorder px-3 py-1.5 text-textMuted hover:bg-accentBgHover">
                    Спри сега
                  </button>
                )}
                <button type="button" onClick={() => act(a, 'delete')} className="rounded-md border border-panelBorderDanger px-3 py-1.5 text-danger hover:bg-accentBgHover">
                  Изтрий
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

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
const SUPPORT_CATEGORY_LABEL: Record<string, string> = { IDEA: 'Идея', BUG: 'Проблем', QUESTION: 'Въпрос', OTHER: 'Друго' };
const SUPPORT_STATUS_LABEL: Record<string, string> = { OPEN: 'Нови', ANSWERED: 'Отговорени', CLOSED: 'Затворени' };

/**
 * "Contact the team" inbox (owner decision, 2026-10-13) — shared by every
 * moderator and admin. Each staff reply shows its author here; the player
 * sees it only as "the Pentilius team".
 */
function SupportPanel({ onOpenPlayer }: { onOpenPlayer: (username: string) => void }) {
  const [status, setStatus] = useState<'OPEN' | 'ANSWERED' | 'CLOSED' | ''>('OPEN');
  const [category, setCategory] = useState('');
  const [list, setList] = useState<AdminSupportTicketsDto | null>(null);
  const [selected, setSelected] = useState<AdminSupportTicketDetailDto | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (category) params.set('category', category);
    adminFetch<AdminSupportTicketsDto>(`/admin/support?${params.toString()}`)
      .then(setList)
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category]);

  async function open(id: string) {
    setError(null);
    setReply('');
    try {
      setSelected(await adminFetch<AdminSupportTicketDetailDto>(`/admin/support/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  async function act(path: string, body?: unknown) {
    if (!selected) return;
    setError(null);
    try {
      setSelected(await adminFetch<AdminSupportTicketDetailDto>(`/admin/support/${selected.id}/${path}`, { method: 'POST', body }));
      setReply('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  const btn = 'rounded-md border px-2.5 py-1 text-[11px] hover:bg-accentBgHover';

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Обратна връзка от играчи</h2>
        <div className="flex flex-wrap gap-2">
          {(['OPEN', 'ANSWERED', 'CLOSED', ''] as const).map((value) => (
            <button
              key={value || 'all'}
              type="button"
              onClick={() => setStatus(value)}
              className={`${btn} ${status === value ? 'border-accent bg-accentBg' : 'border-panelBorder text-textMuted'}`}
            >
              {value ? SUPPORT_STATUS_LABEL[value] : 'Всички'}
            </button>
          ))}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-panelBorder bg-panel px-2 py-1 text-[11px] text-textMuted"
          >
            <option value="">Всички видове</option>
            {Object.entries(SUPPORT_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex max-h-[600px] flex-col gap-1.5 overflow-y-auto">
          {list && list.tickets.length === 0 && <p className="text-xs text-textFaint">Няма съобщения.</p>}
          {list?.tickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => open(ticket.id)}
              className={`rounded-md border px-3 py-2 text-left text-xs ${selected?.id === ticket.id ? 'border-accent bg-accentBg' : 'border-wellBorder bg-well hover:bg-accentBgHover'}`}
            >
              <div className="mb-0.5 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{ticket.username}</span>
                <span className="text-[10px] text-textFaint">{new Date(ticket.updatedAt).toLocaleString('bg-BG')}</span>
              </div>
              <div className="mb-0.5 flex gap-2 text-[10px] text-textFaint">
                <span>{SUPPORT_CATEGORY_LABEL[ticket.category]}</span>
                <span>· {SUPPORT_STATUS_LABEL[ticket.status]}</span>
                <span>· {ticket.messageCount} съобщ.</span>
              </div>
              <p className="truncate text-textMuted">
                {ticket.lastFromStaff ? 'Екип: ' : ''}
                {ticket.lastMessage}
              </p>
            </button>
          ))}
        </div>

        <div>
          {!selected && <p className="text-xs text-textFaint">Избери съобщение отляво.</p>}
          {selected && (
            <div className="rounded-md border border-wellBorder bg-well p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <button type="button" onClick={() => onOpenPlayer(selected.username)} className="font-semibold underline hover:text-accent">
                    {selected.username}
                  </button>
                  <span className="text-textFaint">
                    {' '}
                    · {SUPPORT_CATEGORY_LABEL[selected.category]} · {SUPPORT_STATUS_LABEL[selected.status]}
                  </span>
                </div>
                {selected.status === 'CLOSED' ? (
                  <button type="button" onClick={() => act('reopen')} className={`${btn} border-panelBorder`}>
                    Отвори отново
                  </button>
                ) : (
                  <button type="button" onClick={() => act('close')} className={`${btn} border-panelBorder`}>
                    Затвори
                  </button>
                )}
              </div>
              <div className="mb-3 flex max-h-[420px] flex-col gap-2 overflow-y-auto">
                {selected.messages.map((message) => (
                  <div key={message.id} className={`rounded-md px-2.5 py-1.5 text-xs ${message.fromStaff ? 'border border-accent/40 bg-accentBg' : 'bg-panel'}`}>
                    <div className="mb-0.5 flex justify-between gap-2 text-[10px] text-textFaint">
                      <span className="font-semibold">{message.fromStaff ? `Екип (${message.staffUsername ?? '—'})` : selected.username}</span>
                      <span>{new Date(message.createdAt).toLocaleString('bg-BG')}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{message.text}</p>
                  </div>
                ))}
              </div>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value.slice(0, 2000))}
                rows={3}
                placeholder="Отговор (играчът го вижда като „Екипът на Pentilius“)"
                className="mb-2 w-full resize-y rounded-md border border-wellBorder bg-panel px-3 py-2 text-xs outline-none focus:border-accent"
              />
              <button
                type="button"
                disabled={!reply.trim()}
                onClick={() => act('reply', { text: reply })}
                className="rounded-md border border-accent bg-accentBg px-4 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-30"
              >
                Изпрати отговор
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

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
            <div className="max-w-full overflow-x-auto">
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

// ---------------------------------------------------------------------------
// Payments (owner decision, 2026-10-17): products, purchases with refunds and
// the countries where payments are offered. ADMIN only (the API re-checks).
// The price is never typed here — it's read from Stripe when the price ID is
// saved, so the game can't show a different price than Stripe charges.

/** Product name for godmaster: the custom Bulgarian name, else the Bulgarian template. */
function adminProductName(p: { kind: string; nameBg: string | null; credits: number | null; vipDays: number | null }): string {
  if (p.nameBg) return p.nameBg;
  const names = (bgMessages as unknown as { payments: { productNames: Record<string, string> } }).payments.productNames;
  return p.kind === 'VIP' ? names.VIP.replace('{days}', String(p.vipDays ?? 0)) : names.CREDITS.replace('{count}', String(p.credits ?? 0));
}

function euro(cents: number, currency = 'eur'): string {
  return new Intl.NumberFormat('bg-BG', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

type ProductForm = AdminPaymentProductDto & { priceEuro: string; showLink: boolean };

const EMPTY_PRODUCT: ProductForm = {
  key: '',
  nameBg: '',
  nameEn: '',
  priceEuro: '',
  showLink: false,
  kind: 'CREDITS',
  credits: 500,
  vipDays: null,
  stripePriceId: '',
  priceCents: 0,
  currency: 'eur',
  sortOrder: 0,
  active: true,
  purchaseCount: 0,
};

function PaymentsPanel() {
  return (
    <>
      <PaymentSettingsPanel />
      <SellerSettingsPanel />
      <PaymentProductsPanel />
      <PurchasesPanel />
      <SaleDocumentsPanel />
      <AuditFilesPanel />
    </>
  );
}

const SELLER_FIELDS: { key: keyof SellerInfoDto; label: string; hint?: string }[] = [
  { key: 'name', label: 'наименование на фирмата' },
  { key: 'eik', label: 'ЕИК' },
  { key: 'address', label: 'седалище и адрес на управление' },
  { key: 'contact', label: 'имейл или телефон' },
  { key: 'eshopNumber', label: 'уникален номер на магазина в НАП', hint: 'от регистрацията по Приложение 33, до 10 знака' },
  { key: 'domain', label: 'домейн на магазина' },
  { key: 'posNumber', label: 'номер на виртуалния ПОС', hint: 'както е деклариран в НАП, напр. 01-STR-EUR' },
  { key: 'merchantId', label: 'Merchant ID (ID на акаунта в Stripe)', hint: 'acct_…' },
  { key: 'providerName', label: 'доставчик на платежни услуги (Stripe)', hint: 'не е твоят — данните на Stripe, за одиторския файл' },
  { key: 'providerVatId', label: 'ДДС номер на доставчика (Stripe)', hint: 'не е твоят — ирландският ДДС номер на Stripe' },
];

const SELLER_FIELD_LABEL: Record<string, string> = Object.fromEntries(SELLER_FIELDS.map((f) => [f.key, f.label]));

function centsText(cents: number, currency = 'EUR'): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} ${currency.toUpperCase()}`;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Downloads an audit file through the authenticated API (a plain link can't carry
 * the Bearer token): a kept one by id, or a test one built on the spot.
 */
async function downloadAuditFile(target: { id: string } | { testYear: number; testMonth: number }): Promise<void> {
  const token = getToken();
  const isTest = 'testYear' in target;
  const response = await fetch(
    isTest ? `${API_BASE_URL}/admin/payments/audit-files/test` : `${API_BASE_URL}/admin/payments/audit-files/${encodeURIComponent(target.id)}/download`,
    {
      method: isTest ? 'POST' : 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(isTest ? { 'Content-Type': 'application/json' } : {}) },
      body: isTest ? JSON.stringify({ year: target.testYear, month: target.testMonth }) : undefined,
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Изтеглянето се провали (${response.status})`);
  }
  const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'audit.xml';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The seller and NRA e-shop data (owner decision, 2026-10-23; Наредба Н-18):
 * printed on every sale document and put in the audit file. Each document keeps
 * its own copy, so a change here only affects new documents. Live sales are
 * refused until every field is filled; test sales work regardless.
 */
function SellerSettingsPanel() {
  const [data, setData] = useState<AdminSellerSettingsDto | null>(null);
  const [form, setForm] = useState<SellerInfoDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<AdminSellerSettingsDto>('/admin/payments/seller')
      .then((res) => {
        setData(res);
        setForm(res.seller);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!window.confirm('Да запиша ли данните? Важат за новите документи; издадените не се променят.')) return;
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<AdminSellerSettingsDto>('/admin/payments/seller', { method: 'PUT', body: form });
      setData(res);
      setForm(res.seller);
      setMessage('Записано.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  const input = 'rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent';
  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <details open={!!data && data.missing.length > 0}>
        <summary className="cursor-pointer text-sm font-semibold">
          Данни на продавача и НАП{' '}
          {data && (data.missing.length > 0 ? <span className="text-xs font-normal text-danger">— непопълнени: {data.missing.length}</span> : <span className="text-xs font-normal text-positive">— попълнени</span>)}
        </summary>
        <p className="mt-2 text-[11px] text-textFaint">
          Отпечатват се на всеки документ за продажба и влизат в месечния одиторски файл. Всеки издаден документ пази своето копие — промяна тук засяга само новите.
          Истински плащания не се приемат, докато не е попълнено всичко; тестовите работят и без това.
        </p>
        {data && data.missing.length > 0 && (
          <p className="mt-2 text-[11px] text-danger">Липсват: {data.missing.map((key) => SELLER_FIELD_LABEL[key] ?? key).join(', ')}</p>
        )}
        {message && <p className="mt-2 text-[11px] text-positive">{message}</p>}
        {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
        {form && (
          <form onSubmit={save} className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {SELLER_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1 text-[10px] text-textFaint">
                  {f.label}
                  <input value={String(form[f.key] ?? '')} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className={input} />
                  {f.hint && <span className="text-[10px] text-textFaint/70">{f.hint}</span>}
                </label>
              ))}
            </div>
            <button type="submit" className="w-fit rounded-md border border-accent bg-accentBg px-4 py-2 text-xs hover:bg-accentBgHover">
              Запази
            </button>
          </form>
        )}
      </details>
    </section>
  );
}

/** A month's sale and refund documents; live by default, test ones on request. */
function SaleDocumentsPanel() {
  const [month, setMonth] = useState(currentMonth());
  const [mode, setMode] = useState<'live' | 'test' | 'all'>('live');
  const [rows, setRows] = useState<AdminSaleDocumentRowDto[] | null>(null);
  const [open, setOpen] = useState<SaleDocumentDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    adminFetch<AdminSaleDocumentRowDto[]>(`/admin/payments/documents?month=${month}&mode=${mode}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }, [month, mode]);

  async function show(id: string) {
    try {
      setOpen(await adminFetch<SaleDocumentDto>(`/admin/payments/documents/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-2 text-sm font-semibold">Документи за продажба и връщане</h2>
      <div className="mb-3 flex flex-wrap items-end gap-3 text-[10px] text-textFaint">
        <label className="flex flex-col gap-1">
          месец
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>
        <label className="flex flex-col gap-1">
          вид
          <select value={mode} onChange={(e) => setMode(e.target.value as 'live' | 'test' | 'all')} className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm">
            <option value="live">истински</option>
            <option value="test">тестови</option>
            <option value="all">всички</option>
          </select>
        </label>
      </div>
      {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}
      {rows && rows.length === 0 && <p className="text-xs text-textFaint">Няма документи за този месец.</p>}
      {rows && rows.length > 0 && (
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>№</th>
                <th>вид</th>
                <th>дата</th>
                <th>играч</th>
                <th>сума</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono">{row.number}</td>
                  <td>
                    {row.kind === 'SALE' ? 'продажба' : 'връщане'}
                    {row.test && <span className="ml-1 text-gold">тест</span>}
                  </td>
                  <td>{new Date(row.issuedAt).toLocaleString('bg-BG')}</td>
                  <td>{row.username}</td>
                  <td className="tabular-nums">{centsText(row.totalCents, row.currency)}</td>
                  <td className="whitespace-nowrap">
                    <button type="button" onClick={() => show(row.id)} className="text-accent underline">
                      виж
                    </button>
                    {/* The same document as the player's, in a new tab; its print dialog saves it as PDF. */}
                    <a href={`/godmaster/documents/${row.id}?print=1`} target="_blank" rel="noopener" className="ml-3 text-accent underline">
                      изтегли
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <div className="mt-3 rounded-md border border-wellBorder bg-well p-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <strong>
              {open.kind === 'SALE' ? 'Документ за продажба' : 'Документ за връщане'} № {open.number}
              {open.test && <span className="ml-2 text-gold">ТЕСТ</span>}
            </strong>
            <button type="button" onClick={() => setOpen(null)} className="text-textFaint hover:text-text">
              ✕
            </button>
          </div>
          <p>Дата: {new Date(open.issuedAt).toLocaleString('bg-BG')}</p>
          {open.saleNumber && <p>Към продажба № {open.saleNumber}</p>}
          <p>Продавач: {open.seller.name}, ЕИК {open.seller.eik}, {open.seller.address}, {open.seller.contact}</p>
          <p>Магазин: {open.seller.domain}, номер в НАП {open.eshopNumber}, ПОС {open.posNumber}</p>
          <p className="break-all">Поръчка: {open.orderNumber}</p>
          <p className="break-all">Трансакция: {open.transactionRef}</p>
          <ul className="my-1 list-inside list-disc">
            {open.lines.map((line, index) => (
              <li key={index}>
                {line.name} — група {line.taxGroup}, {line.quantity} × {centsText(line.unitPriceCents, open.currency)} = {centsText(line.amountCents, open.currency)}
              </li>
            ))}
          </ul>
          <p className="font-semibold">Общо: {centsText(open.totalCents, open.currency)}</p>
          <p>Плащане: {open.paymentMethod}</p>
          {open.qrPayload && <p className="break-all text-textFaint">QR: {open.qrPayload}</p>}
        </div>
      )}
    </section>
  );
}

/**
 * The monthly NRA audit file (Наредба Н-18, приложение № 38): built from the
 * live documents, checked against the NRA's own XSD, kept here and downloaded
 * in UTF-8. Due by the 15th of the next month; it may be filed again
 * within that window if something needs fixing.
 */
function AuditFilesPanel() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [files, setFiles] = useState<AdminAuditFileDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    adminFetch<AdminAuditFileDto[]>('/admin/payments/audit-files')
      .then(setFiles)
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  async function downloadTest() {
    const [year, m] = month.split('-').map(Number);
    if (!year || !m) return;
    setError(null);
    setMessage(null);
    try {
      await downloadAuditFile({ testYear: year, testMonth: m });
      setMessage('Тестовият файл е свален (от тестовите документи, мина проверката по схемата на НАП). Не се подава и не се пази.');
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Грешка';
      setError(text.startsWith('NO_SALES_IN_MONTH') ? 'Няма тестови продажби за този месец.' : text.startsWith('SELLER_INCOMPLETE') ? 'Данните на продавача не са попълнени докрай.' : text);
    }
  }

  async function generate() {
    const [year, m] = month.split('-').map(Number);
    if (!year || !m) return;
    if (!window.confirm(`Да генерирам ли одиторския файл за ${month}? Влизат само истинските документи.`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const file = await adminFetch<AdminAuditFileDto>('/admin/payments/audit-files', { method: 'POST', body: { year, month: m } });
      setMessage(`Готово: ${file.orderCount} поръчки, ${file.refundCount} връщания, ${centsText(file.totalCents)}. Файлът мина проверката по схемата на НАП.`);
      load();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Грешка';
      setError(
        text.startsWith('NO_SALES_IN_MONTH')
          ? 'Няма истински продажби за този месец — схемата на НАП изисква поне една поръчка.'
          : text.startsWith('SELLER_INCOMPLETE')
            ? 'Данните на продавача не са попълнени докрай.'
            : text,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-1 text-sm font-semibold">Одиторски файл за НАП</h2>
      <p className="mb-3 text-[11px] text-textFaint">
        Месечният файл по Приложение № 38 към Наредба Н-18: подава се през портала на НАП с КЕП до 15-о число на следващия месец. Генерира се от истинските
        документи, проверява се по официалната XSD схема и се сваля в кодировка UTF-8. В срока може да се подаде отново.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-3 text-[10px] text-textFaint">
        <label className="flex flex-col gap-1">
          месец
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>
        <button type="button" disabled={busy} onClick={generate} className="rounded-md border border-accent bg-accentBg px-4 py-2 text-xs hover:bg-accentBgHover disabled:opacity-50">
          {busy ? 'Генериране…' : 'Генерирай'}
        </button>
        <button type="button" onClick={downloadTest} className="rounded-md border border-gold px-4 py-2 text-xs text-gold hover:bg-accentBgHover">
          Тестов XML
        </button>
      </div>
      {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
      {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}
      {files && files.length > 0 && (
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>месец</th>
                <th>генериран</th>
                <th>от</th>
                <th>поръчки</th>
                <th>връщания</th>
                <th>сума</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id}>
                  <td>
                    {file.year}-{String(file.month).padStart(2, '0')}
                  </td>
                  <td>{new Date(file.createdAt).toLocaleString('bg-BG')}</td>
                  <td>{file.adminUsername}</td>
                  <td>{file.orderCount}</td>
                  <td>{file.refundCount}</td>
                  <td className="tabular-nums">{centsText(file.totalCents)}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => downloadAuditFile({ id: file.id }).catch((err) => setError(err instanceof Error ? err.message : 'Грешка'))}
                      className="text-accent underline"
                    >
                      свали
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PaymentSettingsPanel() {
  const [settings, setSettings] = useState<AdminPaymentsSettingsDto | null>(null);
  const [countries, setCountries] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<AdminPaymentsSettingsDto>('/admin/payments/settings')
      .then((res) => {
        setSettings(res);
        setCountries(res.allowedCountries.join(', '));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const res = await adminFetch<AdminPaymentsSettingsDto>('/admin/payments/settings', {
        method: 'PUT',
        body: { allowedCountries: countries.split(',').map((c) => c.trim()).filter(Boolean) },
      });
      setSettings(res);
      setCountries(res.allowedCountries.join(', '));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <h2 className="mb-1 text-sm font-semibold">Плащания: настройки</h2>
      {settings && (
        <p className={`mb-3 text-xs ${settings.paymentsEnabled ? 'text-positive' : 'text-textMuted'}`}>
          {settings.paymentsEnabled
            ? 'Stripe е свързан на този сървър — плащанията са включени.'
            : 'Stripe не е свързан на този сървър (няма ключ) — плащанията са изключени и офертите не се показват.'}
        </p>
      )}
      <form onSubmit={handleSave} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[10px] text-textFaint">
          държави, в които се предлагат (кодове с запетая, напр. BG)
          <input
            value={countries}
            onChange={(e) => setCountries(e.target.value)}
            className="w-64 rounded-md border border-wellBorder bg-well px-3 py-2 text-sm uppercase outline-none focus:border-accent"
          />
        </label>
        <button type="submit" className="rounded-md border border-accent bg-accentBg px-3 py-2 text-xs hover:bg-accentBgHover">
          Запази
        </button>
        {saved && <span className="text-xs text-positive">Запазено.</span>}
      </form>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}

function PaymentProductsPanel() {
  const [products, setProducts] = useState<AdminPaymentProductDto[] | null>(null);
  const [editing, setEditing] = useState<ProductForm | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    adminFetch<AdminPaymentProductDto[]>('/admin/payments/products')
      .then(setProducts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    // "4,99" or "4.99" -> 499 cents.
    const priceCents = editing.priceEuro.trim() ? Math.round(Number(editing.priceEuro.replace(',', '.')) * 100) : undefined;
    if (priceCents !== undefined && !(priceCents >= 50)) {
      setError('Цената трябва да е поне 0,50 €.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminFetch<AdminPaymentProductDto>('/admin/payments/products', {
        method: 'POST',
        body: {
          key: editing.key.trim(),
          nameBg: editing.nameBg ?? '',
          nameEn: editing.nameEn ?? '',
          priceCents,
          kind: editing.kind,
          credits: editing.kind === 'CREDITS' ? Number(editing.credits) : undefined,
          vipDays: editing.kind === 'VIP' ? Number(editing.vipDays) : undefined,
          stripePriceId: editing.stripePriceId?.trim() || undefined,
          sortOrder: Number(editing.sortOrder),
          active: editing.active,
        },
      });
      setEditing(null);
      load();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      const messages: Record<string, string> = {
        STRIPE_PRICE_NOT_FOUND: 'Няма такава цена в Stripe (провери номера и дали е от същата среда — тест/истинска).',
        STRIPE_PRICE_NOT_ONE_TIME: 'Цената в Stripe не е еднократна (One-off).',
        STRIPE_PRICE_INACTIVE: 'Цената в Stripe е архивирана.',
        STRIPE_PRICE_ALREADY_USED: 'Тази цена вече е свързана с друг продукт.',
        KIND_CANNOT_CHANGE: 'Видът на продукт не може да се сменя.',
        CREDITS_REQUIRED: 'Въведи колко кредита дава.',
        PAYMENTS_DISABLED: 'Stripe не е свързан на този сървър.',
        VIP_DAYS_REQUIRED: 'Въведи колко дни VIP дава.',
      };
      setError(messages[code] ?? code ?? 'Грешка');
    } finally {
      setSaving(false);
    }
  }

  const input = 'rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent';
  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Продукти</h2>
        <button
          type="button"
          onClick={() => {
            setEditing({ ...EMPTY_PRODUCT });
            setIsNew(true);
          }}
          className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover"
        >
          + Нов продукт
        </button>
      </div>

      {products && products.length === 0 && <p className="text-xs text-textFaint">Няма продукти.</p>}
      {products && products.length > 0 && (
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>Име</th>
                <th>Дава</th>
                <th>Цена (Stripe)</th>
                <th>Състояние</th>
                <th>Покупки</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.key} className="border-t border-wellBorder">
                  <td>
                    {adminProductName(p)} <span className="text-textFaint">({p.key})</span>
                  </td>
                  <td>{p.kind === 'CREDITS' ? `${p.credits} кредита` : `VIP ${p.vipDays} дни`}</td>
                  <td>{p.stripePriceId ? euro(p.priceCents, p.currency) : <span className="text-textFaint">няма цена</span>}</td>
                  <td>
                    {!p.active ? (
                      <span className="text-textFaint">скрит</span>
                    ) : p.stripePriceId ? (
                      <span className="text-positive">предлага се</span>
                    ) : (
                      <span className="text-textFaint">чака цена</span>
                    )}
                  </td>
                  <td>{p.purchaseCount}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing({ ...p, nameBg: p.nameBg ?? '', nameEn: p.nameEn ?? '', stripePriceId: '', priceEuro: p.stripePriceId ? String(p.priceCents / 100) : '', showLink: false });
                        setIsNew(false);
                      }}
                      className="rounded-md border border-panelBorder px-2 py-1 text-[11px] hover:bg-accentBgHover"
                    >
                      Редактирай
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <form onSubmit={handleSave} className="mt-4 flex flex-col gap-2 rounded-md border border-wellBorder bg-well p-3">
          <h3 className="text-xs font-semibold">{isNew ? 'Нов продукт' : `Редакция: ${editing.key}`}</h3>
          <div className="flex flex-wrap gap-2">
            {isNew && (
              <label className="flex flex-col gap-1 text-[10px] text-textFaint">
                ключ (латиница, напр. credits_1200)
                <input value={editing.key} onChange={(e) => setEditing({ ...editing, key: e.target.value })} className={input} />
              </label>
            )}
            <label className="flex flex-col gap-1 text-[10px] text-textFaint">
              вид
              <select
                value={editing.kind}
                disabled={!isNew}
                onChange={(e) => {
                  const kind = e.target.value as 'CREDITS' | 'VIP';
                  setEditing({ ...editing, kind, credits: kind === 'CREDITS' ? 500 : null, vipDays: kind === 'VIP' ? 30 : null });
                }}
                className={`${input} disabled:opacity-50`}
              >
                <option value="CREDITS">Кредити</option>
                <option value="VIP">VIP</option>
              </select>
            </label>
            {editing.kind === 'CREDITS' ? (
              <label className="flex flex-col gap-1 text-[10px] text-textFaint">
                брой кредити
                <input type="number" min={1} value={editing.credits ?? ''} onChange={(e) => setEditing({ ...editing, credits: Number(e.target.value) })} className={`${input} w-28`} />
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-[10px] text-textFaint">
                дни VIP
                <input type="number" min={1} value={editing.vipDays ?? ''} onChange={(e) => setEditing({ ...editing, vipDays: Number(e.target.value) })} className={`${input} w-28`} />
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-[10px] text-textFaint">
              цена в евро (напр. 4,99)
              <input value={editing.priceEuro} onChange={(e) => setEditing({ ...editing, priceEuro: e.target.value })} className={`${input} w-28`} />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-textFaint">
              подредба
              <input type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} className={`${input} w-24`} />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-xs">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              активен
            </label>
          </div>
          <p className="text-[10px] text-textFaint">
            Име: <strong className="text-text">{adminProductName({ kind: editing.kind, nameBg: editing.nameBg || null, credits: editing.credits, vipDays: editing.vipDays })}</strong>{' '}
            (сглобява се само от вида и количеството, на всички езици). При запис продуктът и цената се създават или обновяват в Stripe;
            нова цена = нова цена в Stripe, старата се архивира. Продукт с покупки не се изтрива, само се скрива.
          </p>
          <details className="text-[10px] text-textFaint">
            <summary className="cursor-pointer">Още (по желание): собствено име, свързване на съществуваща цена от Stripe</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="flex flex-col gap-1">
                собствено име (български) — само за специални оферти
                <input value={editing.nameBg ?? ''} onChange={(e) => setEditing({ ...editing, nameBg: e.target.value })} className={input} />
              </label>
              <label className="flex flex-col gap-1">
                собствено име (английски)
                <input value={editing.nameEn ?? ''} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} className={input} />
              </label>
              <label className="flex flex-col gap-1">
                свържи съществуваща цена (price_…)
                <input value={editing.stripePriceId ?? ''} onChange={(e) => setEditing({ ...editing, stripePriceId: e.target.value })} className={`${input} w-full font-mono sm:w-80`} />
              </label>
            </div>
          </details>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              {saving ? 'Записване…' : 'Запази'}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover">
              Откажи
            </button>
          </div>
        </form>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}

const PURCHASE_STATUS_LABEL: Record<string, string> = { COMPLETED: 'платена', REFUNDED: 'върната', CANCELED: 'отказана', PENDING: 'чака' };

function PurchasesPanel() {
  const [data, setData] = useState<AdminPurchasesResponseDto | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (flagged) params.set('flagged', 'true');
    adminFetch<AdminPurchasesResponseDto>(`/admin/payments/purchases?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [status, flagged]);

  async function handleRefund(id: string, label: string) {
    if (!window.confirm(`Да върна ли парите за ${label}? Наградата ще бъде отнета от играча.`)) return;
    setBusyId(id);
    setError(null);
    try {
      await adminFetch(`/admin/payments/purchases/${id}/refund`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusyId(null);
    }
  }

  const input = 'rounded-md border border-wellBorder bg-well px-3 py-2 text-sm outline-none focus:border-accent';
  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Покупки</h2>
        {data && (
          <span className="text-xs text-textMuted">
            Днес: <strong className="text-text">{euro(data.todayCents)}</strong> · Този месец: <strong className="text-text">{euro(data.monthCents)}</strong>
          </span>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="mb-3 flex flex-wrap items-end gap-2"
      >
        <input placeholder="играч" value={search} onChange={(e) => setSearch(e.target.value)} className={`${input} w-48`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
          <option value="">всички (без чакащите)</option>
          <option value="COMPLETED">платени</option>
          <option value="REFUNDED">върнати</option>
          <option value="CANCELED">отказани</option>
          <option value="PENDING">чакащи</option>
        </select>
        <label className="flex items-center gap-2 pb-2 text-xs">
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} />
          само за преглед (карта извън разрешените държави)
        </label>
        <button type="submit" className="rounded-md border border-accent bg-accentBg px-3 py-2 text-xs hover:bg-accentBgHover">
          Търси
        </button>
      </form>

      {data && data.purchases.length === 0 && <p className="text-xs text-textFaint">Няма покупки.</p>}
      {data && data.purchases.length > 0 && (
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>Дата</th>
                <th>Играч</th>
                <th>Продукт</th>
                <th>Сума</th>
                <th>Състояние</th>
                <th>IP / карта</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.purchases.map((p) => (
                <tr key={p.id} className={`border-t border-wellBorder ${p.flagged ? 'bg-danger/10' : ''}`}>
                  <td>{new Date(p.createdAt).toLocaleString('bg-BG')}</td>
                  <td>{p.username}</td>
                  <td>
                    {adminProductName({ kind: p.kind, nameBg: p.productNameBg, credits: p.credits, vipDays: p.vipDays })}
                    <span className="text-textFaint"> ({p.credits ? `${p.credits} кр.` : `VIP ${p.vipDays} дни`})</span>
                  </td>
                  <td>{euro(p.amountCents, p.currency)}</td>
                  <td>{PURCHASE_STATUS_LABEL[p.status] ?? p.status}</td>
                  <td>
                    {p.ipCountry ?? '—'} / {p.cardCountry ?? '—'}
                    {p.flagged && <span className="ml-1 text-danger">⚠</span>}
                  </td>
                  <td className="text-right">
                    {p.status === 'COMPLETED' && (
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => handleRefund(p.id, `${p.username} — ${euro(p.amountCents, p.currency)}`)}
                        className="rounded-md border border-panelBorderDanger px-2 py-1 text-[11px] text-danger hover:bg-accentBgHover disabled:opacity-50"
                      >
                        Върни парите
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
  );
}

// ---------------------------------------------------------------------------
// Balance → Pentili (owner decision, 2026-10-18): curves for strength and
// rewards (value = base × level^growth), per-zone start/step/strength/drops,
// and a few per-Pentili settings. "Preview" computes without saving; "Save"
// regenerates every Pentili's stats and loot. ADMIN only (the API re-checks).

type PentiliOverride = { key: string; levelOverride: number | null; strength: number; specialItemKey: string | null; specialItemChance: number | null };

const STAT_LABELS: [keyof PentiliBalanceConfigDto['stats'], string][] = [
  ['hp', 'Здраве'],
  ['attack', 'Атака'],
  ['defense', 'Защита'],
  ['xp', 'Опит'],
];
const REWARD_LABELS: ['metal' | 'crystal', string][] = [
  ['metal', 'Метал'],
  ['crystal', 'Кристал'],
];

// Lines between the columns, so each heading clearly sits over its column (owner, 2026-10-19).
const GRID_TABLE =
  'w-full border-collapse text-left text-xs [&_td]:border [&_td]:border-wellBorder [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-wellBorder [&_th]:px-2 [&_th]:py-1 [&_th]:align-bottom';

function curveAt(c: BalanceCurveDto, level: number): number {
  return Math.max(1, Math.round(c.base * Math.pow(level, c.growth)));
}

function BalancePanel() {
  const [area, setArea] = useState<'pentili' | 'xp' | 'buildings' | 'research' | 'clan' | 'equipment' | 'expeditions' | 'bosses' | 'rewards' | 'shop' | 'other'>('pentili');
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['pentili', 'Пентили'],
            ['xp', 'Опит за ниво'],
            ['buildings', 'Сгради'],
            ['research', 'Проучвания'],
            ['clan', 'Кланови сгради'],
            ['equipment', 'Сетове'],
            ['expeditions', 'Експедиции'],
            ['bosses', 'Босове'],
            ['rewards', 'Награди'],
            ['shop', 'Магазин'],
            ['other', 'Други стойности'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setArea(key)}
            className={`rounded-md border px-3 py-1.5 text-xs ${area === key ? 'border-accent bg-accentBg' : 'border-panelBorder bg-panel text-textMuted hover:bg-accentBgHover'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {area === 'pentili' && <PentiliBalancePanel />}
      {area === 'xp' && <XpBalancePanel />}
      {/* One panel instance for both, so unsaved changes survive switching between them. */}
      {(area === 'buildings' || area === 'research') && <BuildingBalancePanel view={area} />}
      {area === 'clan' && <ClanBalancePanel />}
      {area === 'equipment' && <EquipmentBalancePanel />}
      {area === 'expeditions' && <ExpeditionBalancePanel />}
      {area === 'bosses' && <BossBalancePanel />}
      {area === 'rewards' && <RewardBalancePanel />}
      {area === 'shop' && <ShopBalancePanel />}
      {area === 'other' && <OtherBalancePanel />}
    </>
  );
}

// The Shop's groups: equipment by set, then the rest by kind.
function shopGroup(item: AdminShopItemDto): string {
  if (item.category === 'EQUIPMENT') return SET_LABELS.find(([tier]) => tier === (item.tier ?? '').toLowerCase())?.[1] ?? 'Екипировка';
  if (item.key.endsWith('_upgrade') || item.key.endsWith('_fragment')) return 'Камъни и фрагменти';
  if (item.key.endsWith('_box')) return 'Кутии';
  return 'Други консумативи';
}

/**
 * godmaster → Balance → Shop (owner decision, 2026-10-20): what the Shop sells and for how much.
 * A buy price below what selling can return is flagged in red, so "buy cheap, sell dear" can't happen again.
 */
function ShopBalancePanel() {
  const [data, setData] = useState<AdminShopDto | null>(null);
  const [items, setItems] = useState<AdminShopItemDto[] | null>(null);
  const [onlyInShop, setOnlyInShop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    adminFetch<AdminShopDto>('/admin/balance/shop')
      .then((res) => {
        setData(res);
        setItems(res.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  if (!data || !items) {
    return (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="text-sm font-semibold">Магазин</h2>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : <p className="mt-2 text-xs text-textFaint">Зареждане…</p>}
      </section>
    );
  }

  const original = new Map(data.items.map((i) => [i.key, i]));
  const changed = items.filter((i) => {
    const o = original.get(i.key);
    return !o || o.inShop !== i.inShop || o.priceMetal !== i.priceMetal || o.priceCrystal !== i.priceCrystal || o.priceCredits !== i.priceCredits;
  });
  const update = (key: string, patch: Partial<AdminShopItemDto>) => setItems((list) => list?.map((i) => (i.key === key ? { ...i, ...patch } : i)) ?? null);
  // Selling must never return more than buying costs: compared with the most selling can ever give.
  const underpriced = (i: AdminShopItemDto) => i.inShop && !!i.sell && i.priceCredits === 0 && (i.priceMetal < i.sell.maxMetal || i.priceCrystal < i.sell.maxCrystal);

  async function save() {
    if (!items) return;
    const warn = changed.filter(underpriced).length;
    const text =
      `Да запиша ли промените в Магазина (${changed.length})? Важат веднага за всички играчи.` +
      (warn ? `\n\nВНИМАНИЕ: ${warn} предмета се купуват по-евтино, отколкото може да се продадат.` : '');
    if (!window.confirm(text)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<AdminShopDto>('/admin/balance/shop', {
        method: 'PUT',
        body: { items: changed.map(({ key, inShop, priceMetal, priceCrystal, priceCredits }) => ({ key, inShop, priceMetal, priceCrystal, priceCredits })) },
      });
      setData(res);
      setItems(res.items);
      setMessage('Записано.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  const visible = items.filter((i) => !onlyInShop || i.inShop);
  const groups = [...new Set(visible.map(shopGroup))];
  const priceInput = 'w-20 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent disabled:opacity-30';

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Магазин</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-textMuted">
            <input type="checkbox" checked={onlyInShop} onChange={(e) => setOnlyInShop(e.target.checked)} className="accent-accent" />
            само в магазина
          </label>
          <button type="button" disabled={busy || changed.length === 0} onClick={save} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
            Запази {changed.length > 0 ? `(${changed.length})` : ''}
          </button>
          <button type="button" disabled={busy || changed.length === 0} onClick={() => setItems(data.items)} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover disabled:opacity-50">
            Отказ
          </button>
        </div>
      </div>
      <p className="mb-3 text-[11px] text-textFaint">
        Отметнатите предмети се продават в Магазина на тези цени (0 = не се плаща с този ресурс). „Продажба дава“ е колко връща продажбата на
        нормален предмет без проучвания, а в скоби — най-многото (епичен предмет, максимално „Рециклиране“). В червено е цена, по-ниска от това
        най-много.
      </p>
      {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
      {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}
      <div className="max-w-full overflow-x-auto">
        <table className={GRID_TABLE}>
          <thead className="text-[10px] uppercase text-textFaint">
            <tr>
              <th>предмет</th>
              <th>в магазина</th>
              <th>метал</th>
              <th>кристал</th>
              <th>кредити</th>
              <th>продажба дава</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group}>
                <tr>
                  <td colSpan={6} className="pt-3 text-[11px] font-semibold text-textMuted">
                    {group}
                  </td>
                </tr>
                {visible
                  .filter((i) => shopGroup(i) === group)
                  .map((i) => (
                    <tr key={i.key} className={underpriced(i) ? 'text-danger' : ''}>
                      <td>
                        <div className="flex items-center gap-2">
                          <ItemIcon iconAssetId={i.iconAssetId} className="h-7 w-7 shrink-0 object-contain" />
                          <span>{resolveMessageKey(i.nameKey)}</span>
                        </div>
                      </td>
                      <td className="text-center">
                        <input type="checkbox" checked={i.inShop} onChange={(e) => update(i.key, { inShop: e.target.checked })} className="h-4 w-4 accent-accent" />
                      </td>
                      {(['priceMetal', 'priceCrystal', 'priceCredits'] as const).map((field) => (
                        <td key={field}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            disabled={!i.inShop}
                            value={i[field]}
                            onChange={(e) => update(i.key, { [field]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                            className={priceInput}
                          />
                        </td>
                      ))}
                      <td className="tabular-nums text-textMuted">
                        {i.sell ? `${gmNumber(i.sell.metal)} / ${gmNumber(i.sell.crystal)} (до ${gmNumber(i.sell.maxMetal)} / ${gmNumber(i.sell.maxCrystal)})` : '—'}
                      </td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PentiliBalancePanel() {
  const [data, setData] = useState<AdminPentiliBalanceDto | null>(null);
  const [config, setConfig] = useState<PentiliBalanceConfigDto | null>(null);
  const [overrides, setOverrides] = useState<Record<string, PentiliOverride>>({});
  const [zoneFilter, setZoneFilter] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function adopt(res: AdminPentiliBalanceDto, resetDraft: boolean) {
    setData(res);
    if (resetDraft) {
      setConfig(res.config);
      setOverrides(
        Object.fromEntries(
          res.pentili.map((p) => [p.key, { key: p.key, levelOverride: p.levelOverride, strength: p.strength, specialItemKey: p.specialItemKey, specialItemChance: p.specialItemChance }]),
        ),
      );
      setZoneFilter((z) => z || res.zones[0]?.key || '');
      setDirty(false);
    }
  }

  function load() {
    setError(null);
    adminFetch<AdminPentiliBalanceDto>('/admin/balance/pentili')
      .then((res) => adopt(res, true))
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  const body = () => ({ config, pentili: Object.values(overrides) });

  async function preview() {
    if (!config) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      adopt(await adminFetch<AdminPentiliBalanceDto>('/admin/balance/pentili/preview', { method: 'POST', body: body() }), false);
      setMessage('Прегледът е обновен — нищо не е записано.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!config || !window.confirm('Да запиша ли баланса и да обновя силата и наградите на всички Пентили?')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      adopt(await adminFetch<AdminPentiliBalanceDto>('/admin/balance/pentili', { method: 'PUT', body: body() }), true);
      setMessage('Записано и приложено.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  if (!data || !config) {
    return (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="text-sm font-semibold">Баланс на Пентилите</h2>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : <p className="mt-2 text-xs text-textFaint">Зареждане…</p>}
      </section>
    );
  }

  const num = 'w-20 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent';
  const change = (fn: (c: PentiliBalanceConfigDto) => PentiliBalanceConfigDto) => {
    setConfig(fn(structuredClone(config)));
    setDirty(true);
  };
  const setOverride = (key: string, patch: Partial<PentiliOverride>) => {
    setOverrides((o) => ({ ...o, [key]: { ...o[key], ...patch } }));
    setDirty(true);
  };
  const pct = (x: number) => Math.round(x * 1000) / 10;
  const rows = data.pentili.filter((p) => !zoneFilter || p.zoneKey === zoneFilter);

  return (
    <>
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Баланс на Пентилите</h2>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={preview} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Преглед
            </button>
            <button type="button" disabled={busy || !dirty} onClick={save} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Запази и приложи
            </button>
            <button type="button" disabled={busy || !dirty} onClick={load} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover disabled:opacity-50">
              Отказ
            </button>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-textFaint">
          Стойност = база × ниво<sup>растеж</sup> × сила на зоната × сила на Пентила. „Преглед“ показва новите стойности в таблицата долу, без да записва.
          Наградите растат със същата сила.
        </p>
        {dirty && <p className="mb-2 text-[11px] text-vipGold">Има незаписани промени.</p>}
        {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
        {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-semibold">Сила</h3>
            <div className="max-w-full overflow-x-auto">
              <table className={GRID_TABLE}>
                <thead className="text-[10px] uppercase text-textFaint">
                  <tr>
                    <th />
                    <th>база</th>
                    <th>растеж</th>
                    <th>ниво 1 / 20 / 50 / 100</th>
                  </tr>
                </thead>
                <tbody>
                  {STAT_LABELS.map(([key, label]) => (
                    <tr key={key} className="border-t border-wellBorder">
                      <td>{label}</td>
                      <td>
                        <input type="number" step="any" value={config.stats[key].base} onChange={(e) => change((c) => ({ ...c, stats: { ...c.stats, [key]: { ...c.stats[key], base: Number(e.target.value) } } }))} className={num} />
                      </td>
                      <td>
                        <input type="number" step="any" value={config.stats[key].growth} onChange={(e) => change((c) => ({ ...c, stats: { ...c.stats, [key]: { ...c.stats[key], growth: Number(e.target.value) } } }))} className={num} />
                      </td>
                      <td className="tabular-nums text-textMuted">{[1, 20, 50, 100].map((l) => gmNumber(curveAt(config.stats[key], l))).join(' / ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold">Награди</h3>
            <div className="max-w-full overflow-x-auto">
              <table className={GRID_TABLE}>
                <thead className="text-[10px] uppercase text-textFaint">
                  <tr>
                    <th />
                    <th>база</th>
                    <th>растеж</th>
                    <th>ниво 1 / 20 / 50 / 100</th>
                  </tr>
                </thead>
                <tbody>
                  {REWARD_LABELS.map(([key, label]) => (
                    <tr key={key} className="border-t border-wellBorder">
                      <td>{label}</td>
                      <td>
                        <input type="number" step="any" value={config.rewards[key].base} onChange={(e) => change((c) => ({ ...c, rewards: { ...c.rewards, [key]: { ...c.rewards[key], base: Number(e.target.value) } } }))} className={num} />
                      </td>
                      <td>
                        <input type="number" step="any" value={config.rewards[key].growth} onChange={(e) => change((c) => ({ ...c, rewards: { ...c.rewards, [key]: { ...c.rewards[key], growth: Number(e.target.value) } } }))} className={num} />
                      </td>
                      <td className="tabular-nums text-textMuted">{[1, 20, 50, 100].map((l) => gmNumber(curveAt(config.rewards[key], l))).join(' / ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-textFaint">
              <label className="flex items-center gap-1">
                колебание на наградата ± %
                <input type="number" step="any" value={pct(config.rewards.spread)} onChange={(e) => change((c) => ({ ...c, rewards: { ...c.rewards, spread: Number(e.target.value) / 100 } }))} className={num} />
              </label>
            </div>
            <p className="mt-1 text-[11px] text-textFaint">
              Всяка награда е случайна около стойността от кривата: при 25% тя е между 75% и 125% от нея (напр. 20 метала → 15–25).
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Зони</h3>
        <p className="mb-2 text-[11px] text-textFaint">
          Стъпка — през колко нива е следващият Пентил в зоната. Сила × — множител за цялата зона: 1 = по кривата, 1,2 = с 20% по-силни и с 20%
          повече награди. Шансовете са за битка; „част“ е на всеки от 7-те слота.
        </p>
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>Зона</th>
                <th>начало</th>
                <th>стъпка</th>
                <th>сила ×</th>
                <th>сет</th>
                <th>част %</th>
                <th>фрагмент %</th>
                <th>камък %</th>
                <th>енергия %</th>
              </tr>
            </thead>
            <tbody>
              {data.zones.map((zone) => {
                const z = config.zones[zone.key];
                if (!z) return null;
                const setZone = (patch: Partial<PentiliZoneBalanceDto>) => change((c) => ({ ...c, zones: { ...c.zones, [zone.key]: { ...c.zones[zone.key], ...patch } } }));
                return (
                  <tr key={zone.key} className="border-t border-wellBorder">
                    <td>{resolveMessageKey(zone.nameKey)} <span className="text-textFaint">(от ниво {zone.unlockLevel})</span></td>
                    <td><input type="number" value={z.startLevel} onChange={(e) => setZone({ startLevel: Number(e.target.value) })} className={num} /></td>
                    <td><input type="number" value={z.step} onChange={(e) => setZone({ step: Number(e.target.value) })} className={num} /></td>
                    <td><input type="number" step="any" value={z.strength} onChange={(e) => setZone({ strength: Number(e.target.value) })} className={num} /></td>
                    <td>
                      <select value={z.itemTier} onChange={(e) => setZone({ itemTier: e.target.value as PentiliZoneBalanceDto['itemTier'] })} className={num}>
                        <option value="pioneer">Pioneer</option>
                        <option value="ascendant">Ascendant</option>
                        <option value="coreforged">Coreforged</option>
                      </select>
                    </td>
                    <td><input type="number" step="any" value={pct(z.itemChance)} onChange={(e) => setZone({ itemChance: Number(e.target.value) / 100 })} className={num} /></td>
                    <td><input type="number" step="any" value={pct(z.fragmentChance)} onChange={(e) => setZone({ fragmentChance: Number(e.target.value) / 100 })} className={num} /></td>
                    <td><input type="number" step="any" value={pct(z.upgradeStoneChance)} onChange={(e) => setZone({ upgradeStoneChance: Number(e.target.value) / 100 })} className={num} /></td>
                    <td><input type="number" step="any" value={pct(z.energyPackChance)} onChange={(e) => setZone({ energyPackChance: Number(e.target.value) / 100 })} className={num} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold">Пентили</h3>
          {data.zones.map((zone) => (
            <button
              key={zone.key}
              type="button"
              onClick={() => setZoneFilter(zone.key)}
              className={`rounded-md border px-2 py-1 text-[11px] ${zoneFilter === zone.key ? 'border-accent bg-accentBg' : 'border-panelBorder text-textMuted hover:bg-accentBgHover'}`}
            >
              {resolveMessageKey(zone.nameKey)}
            </button>
          ))}
        </div>
        <p className="mb-2 text-[11px] text-textFaint">
          Ниво — празно = по стъпката на зоната (сивото число), или впиши фиксирано. Сила × — само за този Пентил, умножава се със силата на зоната;
          наградите го следват. В цвят са стойностите, които „Преглед“ променя, със сегашните в скоби.
        </p>
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>Пентил</th>
                <th>ниво</th>
                <th>сила ×</th>
                <th>здраве</th>
                <th>атака</th>
                <th>защита</th>
                <th>опит</th>
                <th>метал</th>
                <th>кристал</th>
                <th>специална плячка</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const o = overrides[p.key];
                const cell = (next: number, current: number) => (
                  <span className={next !== current ? 'text-vipGold' : ''}>
                    {gmNumber(next)}
                    {next !== current && <span className="text-textFaint"> ({gmNumber(current)})</span>}
                  </span>
                );
                return (
                  <tr key={p.key} className="border-t border-wellBorder">
                    <td>{resolveMessageKey(p.nameKey)} <span className="text-textFaint">#{p.orderInZone + 1}</span></td>
                    <td>
                      <input
                        type="number"
                        placeholder={String(p.next.level)}
                        value={o?.levelOverride ?? ''}
                        onChange={(e) => setOverride(p.key, { levelOverride: e.target.value ? Number(e.target.value) : null })}
                        className={num}
                      />
                      {p.next.level !== p.current.level && <span className="ml-1 text-vipGold">→ {p.next.level}</span>}
                    </td>
                    <td><input type="number" step="any" value={o?.strength ?? 1} onChange={(e) => setOverride(p.key, { strength: Number(e.target.value) })} className={num} /></td>
                    <td className="tabular-nums">{cell(p.next.maxHp, p.current.maxHp)}</td>
                    <td className="tabular-nums">{cell(p.next.attack, p.current.attack)}</td>
                    <td className="tabular-nums">{cell(p.next.defense, p.current.defense)}</td>
                    <td className="tabular-nums">{cell(p.next.xpReward, p.current.xpReward)}</td>
                    <td className="tabular-nums text-textMuted">{p.next.metal[0]}–{p.next.metal[1]}</td>
                    <td className="tabular-nums text-textMuted">{p.next.crystal[0]}–{p.next.crystal[1]}</td>
                    <td>
                      <select value={o?.specialItemKey ?? ''} onChange={(e) => setOverride(p.key, { specialItemKey: e.target.value || null })} className="w-40 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs">
                        <option value="">—</option>
                        {data.items.map((item) => (
                          <option key={item.key} value={item.key}>
                            {resolveMessageKey(item.nameKey)}
                          </option>
                        ))}
                      </select>
                      {o?.specialItemKey && (
                        <input
                          type="number"
                          step="any"
                          placeholder="%"
                          value={o.specialItemChance !== null && o.specialItemChance !== undefined ? pct(o.specialItemChance) : ''}
                          onChange={(e) => setOverride(p.key, { specialItemChance: e.target.value ? Number(e.target.value) / 100 : null })}
                          className={`${num} ml-1 w-14`}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// Balance → XP (owner decision, 2026-10-19): XP to the next level = base ×
// level^growth, unless a level has its own fixed value. The table shows how
// many Pentili fights each level takes against the best-paying Pentili a
// player of that level can fight, and the energy time for them.
function XpBalancePanel() {
  const [data, setData] = useState<AdminXpBalanceDto | null>(null);
  const [config, setConfig] = useState<XpBalanceConfigDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    adminFetch<AdminXpBalanceDto>('/admin/balance/xp')
      .then((res) => {
        setData(res);
        setConfig(res.config);
        setDirty(false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  async function send(method: 'POST' | 'PUT') {
    if (!config) return;
    if (method === 'PUT' && !window.confirm('Да запиша ли кривата на опита за всички нива?')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<AdminXpBalanceDto>(method === 'PUT' ? '/admin/balance/xp' : '/admin/balance/xp/preview', { method, body: { config } });
      setData(res);
      if (method === 'PUT') {
        setConfig(res.config);
        setDirty(false);
        setMessage('Записано и приложено.');
      } else {
        setMessage('Прегледът е обновен — нищо не е записано.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  if (!data || !config) {
    return (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="text-sm font-semibold">Опит за ниво</h2>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : <p className="mt-2 text-xs text-textFaint">Зареждане…</p>}
      </section>
    );
  }

  const num = 'w-24 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent';
  const milestones = [5, 10, 20, 30, 40, 60, 80, 99].map((l) => data.levels.find((r) => r.level === l)).filter(Boolean) as AdminXpLevelDto[];
  const fmt = (n: number | null) => (n === null ? '—' : gmNumber(n));

  return (
    <>
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Опит за ниво</h2>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send('POST')} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Преглед
            </button>
            <button type="button" disabled={busy || !dirty} onClick={() => send('PUT')} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Запази и приложи
            </button>
            <button type="button" disabled={busy || !dirty} onClick={load} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover disabled:opacity-50">
              Отказ
            </button>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-textFaint">
          Опит до следващото ниво = база × ниво<sup>растеж</sup> — една крива за всички нива; таблицата долу е само за преглед. „Битки“ са срещу най-доходния
          Пентил, достъпен на това ниво; енергията за тях се зарежда {data.energyMinutes} мин. на точка. Дневните мисии, експедициите и босовете дават опит
          отгоре — затова реалното темпо е по-бързо.
        </p>
        {dirty && <p className="mb-2 text-[11px] text-vipGold">Има незаписани промени.</p>}
        {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
        {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}

        <div className="mb-4 flex flex-wrap items-end gap-3 text-[11px] text-textFaint">
          <label className="flex flex-col gap-1">
            база
            <input type="number" step="any" value={config.base} onChange={(e) => (setConfig({ ...config, base: Number(e.target.value) }), setDirty(true))} className={num} />
          </label>
          <label className="flex flex-col gap-1">
            растеж
            <input type="number" step="any" value={config.growth} onChange={(e) => (setConfig({ ...config, growth: Number(e.target.value) }), setDirty(true))} className={num} />
          </label>
        </div>

        <h3 className="mb-1 text-xs font-semibold">Темпо накратко</h3>
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>до ниво</th>
                {milestones.map((m) => (
                  <th key={m.level}>{m.level + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>битки общо</td>
                {milestones.map((m) => (
                  <td key={m.level} className="tabular-nums">
                    {fmt(m.totalBattles)}
                  </td>
                ))}
              </tr>
              <tr>
                <td>енергия общо (дни)</td>
                {milestones.map((m) => (
                  <td key={m.level} className="tabular-nums">
                    {Math.round(((m.totalBattles * data.energyMinutes) / 60 / 24) * 10) / 10}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Всички нива</h3>
        <p className="mb-2 text-[11px] text-textFaint">В цвят са промените, които „Преглед“ показва, със сегашните в скоби.</p>
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>ниво</th>
                <th>опит до следващото</th>
                <th>битки</th>
                <th>битки общо</th>
                <th>енергия (ч)</th>
              </tr>
            </thead>
            <tbody>
              {data.levels.map((r) => (
                <tr key={r.level}>
                  <td>{r.level}</td>
                  <td className="tabular-nums">
                    <span className={r.current !== null && r.next !== r.current ? 'text-vipGold' : ''}>{fmt(r.next)}</span>
                    {r.current !== null && r.next !== r.current && <span className="text-textFaint"> ({fmt(r.current)})</span>}
                  </td>
                  <td className="tabular-nums">{fmt(r.battles)}</td>
                  <td className="tabular-nums">{fmt(r.totalBattles)}</td>
                  <td className="tabular-nums">{r.energyHours ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// Balance → Buildings & research (owner decision, 2026-10-19): the general
// parameters, a factor row per building/research, and a level table for the
// selected one. Cost = value(L) × factor, value(L) = metal production(L) × L ×
// "hours of production"; time = base × L^growth × the time factor.

// Effects shown as percentages are stored as fractions.
const EFFECT_LABELS: Record<string, { label: string; percent?: boolean }> = {
  capacityBonusPerLevel: { label: 'места на ниво' },
  marketSlotBonusPerLevel: { label: 'обяви на ниво' },
  defenseBonusPerLevel: { label: '% защита на ниво', percent: true },
  pvpProtectionMinutesPerLevel: { label: 'мин. защита на ниво' },
  protectedMetalPerLevel: { label: 'пази метал (база)' },
  protectedCrystalPerLevel: { label: 'пази кристал (база)' },
  researchCapPerLevel: { label: 'нива проучване на ниво' },
  exchangeLimitPerLevel: { label: 'лимит на Борсата (база)' },
  energyRegenBonusPerLevel: { label: '% по-бързо зареждане на ниво', percent: true },
  maxEnergyBonusEvery: { label: '+1 макс. енергия на всеки N нива' },
};

function formatSeconds(total: number): string {
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м${s ? ` ${s}с` : ''}`;
  return `${s}с`;
}

function BuildingBalancePanel({ view }: { view: 'buildings' | 'research' }) {
  const [data, setData] = useState<AdminBuildingBalanceDto | null>(null);
  const [config, setConfig] = useState<BuildingBalanceConfigDto | null>(null);
  const [selected, setSelected] = useState<{ kind: 'building' | 'research'; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    adminFetch<AdminBuildingBalanceDto>('/admin/balance/buildings')
      .then((res) => {
        setData(res);
        setConfig(res.config);
        setDirty(false);
        setSelected((s) => s ?? (res.buildings[0] ? { kind: 'building', key: res.buildings[0].key } : null));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  async function send(method: 'POST' | 'PUT') {
    if (!config) return;
    if (method === 'PUT' && !window.confirm('Да запиша ли баланса на сградите и проучванията за всички нива?')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<AdminBuildingBalanceDto>(method === 'PUT' ? '/admin/balance/buildings' : '/admin/balance/buildings/preview', { method, body: { config } });
      setData(res);
      if (method === 'PUT') {
        setConfig(res.config);
        setDirty(false);
        setMessage('Записано и приложено.');
      } else {
        setMessage('Прегледът е обновен — нищо не е записано.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  if (!data || !config) {
    return (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="text-sm font-semibold">Сгради и проучвания</h2>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : <p className="mt-2 text-xs text-textFaint">Зареждане…</p>}
      </section>
    );
  }

  const num = 'w-20 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent';
  const update = (fn: (c: BuildingBalanceConfigDto) => void) => {
    const next = structuredClone(config);
    fn(next);
    setConfig(next);
    setDirty(true);
  };
  const field = (label: string, value: number, onChange: (v: number) => void) => (
    <label className="flex flex-col gap-1 text-[11px] text-textFaint">
      {label}
      <input type="number" step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} className={num} />
    </label>
  );
  const changed = (next: number | null, current: number | null | undefined, format: (n: number) => string = (n) => gmNumber(n)) =>
    next === null ? (
      '—'
    ) : (
      <span className={current !== undefined && current !== null && current !== next ? 'text-vipGold' : ''}>
        {format(next)}
        {current !== undefined && current !== null && current !== next && <span className="text-textFaint"> ({format(current)})</span>}
      </span>
    );
  const selButton = (kind: 'building' | 'research', key: string) => (
    <button
      type="button"
      onClick={() => setSelected({ kind, key })}
      className={`rounded-md border px-2 py-0.5 text-[11px] ${selected?.kind === kind && selected.key === key ? 'border-accent bg-accentBg' : 'border-panelBorder hover:bg-accentBgHover'}`}
    >
      нива
    </button>
  );
  // The level table follows the view: the chosen one, or the first of the list.
  const selectedBuilding =
    view === 'buildings' ? (data.buildings.find((b) => selected?.kind === 'building' && b.key === selected.key) ?? data.buildings[0] ?? null) : null;
  const selectedResearch =
    view === 'research' ? (data.research.find((r) => selected?.kind === 'research' && r.key === selected.key) ?? data.research[0] ?? null) : null;

  return (
    <>
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{view === 'buildings' ? 'Сгради' : 'Проучвания'}</h2>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send('POST')} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Преглед
            </button>
            <button type="button" disabled={busy || !dirty} onClick={() => send('PUT')} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Запази и приложи
            </button>
            <button type="button" disabled={busy || !dirty} onClick={load} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover disabled:opacity-50">
              Отказ
            </button>
          </div>
        </div>
        {view === 'buildings' ? (
          <p className="mb-3 text-[11px] text-textFaint">
            Производство на мина = на час × ниво × растеж<sup>ниво−1</sup>. Цена на ниво = производството на метал на това ниво × ниво × „часове производство“,
            умножено по множителя на сградата. Време = база × ниво<sup>растеж</sup> × множителя за време. „Скривалище“, „Борса“ и активирането на „Кръчмата“
            следват растежа на производството.
          </p>
        ) : (
          <p className="mb-3 text-[11px] text-textFaint">
            Цена на ниво = „стойността“ на нивото × множителите долу; стойността идва от производството на мината и „часовете производство“, които се
            настройват в „Сгради“ — промяна там променя и цените на проучванията. Време = база × ниво<sup>растеж</sup>.
          </p>
        )}
        {dirty && <p className="mb-2 text-[11px] text-vipGold">Има незаписани промени — „Запази“ записва и сградите, и проучванията.</p>}
        {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
        {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}

        {view === 'buildings' ? (
          <div className="flex flex-wrap gap-3">
            {field('метал на час (ниво 1)', config.production.metalPerHour, (v) => update((c) => (c.production.metalPerHour = v)))}
            {field('кристал на час (ниво 1)', config.production.crystalPerHour, (v) => update((c) => (c.production.crystalPerHour = v)))}
            {field('растеж на производството', config.production.growth, (v) => update((c) => (c.production.growth = v)))}
            {field('часове производство (цена)', config.costHours, (v) => update((c) => (c.costHours = v)))}
            {field('време: база (сек)', config.buildTime.base, (v) => update((c) => (c.buildTime.base = v)))}
            {field('време: растеж', config.buildTime.growth, (v) => update((c) => (c.buildTime.growth = v)))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {field('метал ×', config.research.metal, (v) => update((c) => (c.research.metal = v)))}
            {field('кристал ×', config.research.crystal, (v) => update((c) => (c.research.crystal = v)))}
            {field('кредити ×', config.research.credits, (v) => update((c) => (c.research.credits = v)))}
            {field('време: база (сек)', config.research.time.base, (v) => update((c) => (c.research.time.base = v)))}
            {field('време: растеж', config.research.time.growth, (v) => update((c) => (c.research.time.growth = v)))}
          </div>
        )}
      </section>

      {view === 'buildings' && (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Сгради</h3>
        <p className="mb-2 text-[11px] text-textFaint">Метал ×, кристал × и време × умножават общата цена и време. Ефектите са на ниво.</p>
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>сграда</th>
                <th>метал ×</th>
                <th>кристал ×</th>
                <th>време ×</th>
                <th>макс. ниво</th>
                <th>ефекти</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.buildings.map((b) => {
                const bc = config.buildings[b.key];
                return (
                  <tr key={b.key}>
                    <td>{resolveMessageKey(b.nameKey)}</td>
                    <td><input type="number" step="any" value={bc.metal} onChange={(e) => update((c) => (c.buildings[b.key].metal = Number(e.target.value)))} className={num} /></td>
                    <td><input type="number" step="any" value={bc.crystal} onChange={(e) => update((c) => (c.buildings[b.key].crystal = Number(e.target.value)))} className={num} /></td>
                    <td><input type="number" step="any" value={bc.time} onChange={(e) => update((c) => (c.buildings[b.key].time = Number(e.target.value)))} className={num} /></td>
                    <td><input type="number" value={bc.maxLevel} onChange={(e) => update((c) => (c.buildings[b.key].maxLevel = Number(e.target.value)))} className={num} /></td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(bc.effects).map(([fieldKey, value]) => {
                          const meta = EFFECT_LABELS[fieldKey] ?? { label: fieldKey };
                          return (
                            <label key={fieldKey} className="flex items-center gap-1 text-[11px] text-textFaint">
                              {meta.label}
                              <input
                                type="number"
                                step="any"
                                value={meta.percent ? Math.round(value * 10000) / 100 : value}
                                onChange={(e) => update((c) => (c.buildings[b.key].effects[fieldKey] = meta.percent ? Number(e.target.value) / 100 : Number(e.target.value)))}
                                className={num}
                              />
                            </label>
                          );
                        })}
                        {Object.keys(bc.effects).length === 0 && <span className="text-[11px] text-textFaint">производство (горе)</span>}
                      </div>
                    </td>
                    <td>{selButton('building', b.key)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      )}

      {view === 'research' && (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Проучвания</h3>
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>проучване</th>
                <th>бонус на ниво %</th>
                <th>макс. ниво</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.research.map((r) => {
                const rc = config.research.items[r.key];
                return (
                  <tr key={r.key}>
                    <td>{resolveMessageKey(r.nameKey)}</td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={Math.round(rc.bonusPerLevel * 10000) / 100}
                        onChange={(e) => update((c) => (c.research.items[r.key].bonusPerLevel = Number(e.target.value) / 100))}
                        className={num}
                      />
                    </td>
                    <td><input type="number" value={rc.maxLevel} onChange={(e) => update((c) => (c.research.items[r.key].maxLevel = Number(e.target.value)))} className={num} /></td>
                    <td>{selButton('research', r.key)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      )}

      {(selectedBuilding || selectedResearch) && (
        <section className="rounded-lg border border-panelBorder bg-panel p-4">
          <h3 className="mb-1 text-xs font-semibold">
            Нива: {resolveMessageKey((selectedBuilding ?? selectedResearch)!.nameKey)}
          </h3>
          <p className="mb-2 text-[11px] text-textFaint">В цвят са промените, които „Преглед“ показва, със сегашните в скоби.</p>
          <div className="max-w-full overflow-x-auto">
            <table className={GRID_TABLE}>
              <thead className="text-[10px] uppercase text-textFaint">
                <tr>
                  <th>ниво</th>
                  <th>метал</th>
                  <th>кристал</th>
                  {selectedResearch && <th>кредити</th>}
                  <th>време</th>
                  {selectedBuilding?.levels.some((l) => l.producesPerHour !== null) && <th>на час</th>}
                </tr>
              </thead>
              <tbody>
                {selectedBuilding?.levels.map((l) => (
                  <tr key={l.level}>
                    <td>{l.level}</td>
                    <td className="tabular-nums">{changed(l.metalCost, l.current?.metalCost)}</td>
                    <td className="tabular-nums">{changed(l.crystalCost, l.current?.crystalCost)}</td>
                    <td className="tabular-nums">{changed(l.constructionSeconds, l.current?.constructionSeconds, formatSeconds)}</td>
                    {l.producesPerHour !== null && <td className="tabular-nums">{changed(l.producesPerHour, l.current?.producesPerHour)}</td>}
                  </tr>
                ))}
                {selectedResearch?.levels.map((l) => (
                  <tr key={l.level}>
                    <td>{l.level}</td>
                    <td className="tabular-nums">{changed(l.metalCost, l.current?.metalCost)}</td>
                    <td className="tabular-nums">{changed(l.crystalCost, l.current?.crystalCost)}</td>
                    <td className="tabular-nums">{changed(l.creditsCost, l.current?.creditsCost)}</td>
                    <td className="tabular-nums">{changed(l.researchSeconds, l.current?.researchSeconds, formatSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

// Bonus per level by clan building kind: the Member Hall's is places, the rest are percent.
const CLAN_BONUS_LABELS: Record<string, { label: string; percent: boolean }> = {
  MEMBER_CAPACITY: { label: 'места на ниво', percent: false },
  COMBAT_BONUS: { label: 'сила на ниво %', percent: true },
  PRODUCTION_BONUS: { label: 'производство на ниво %', percent: true },
  ENERGY_REGEN: { label: 'възстановяване на енергия на ниво %', percent: true },
  BOSS_CORE_DAMAGE: { label: 'щета срещу босове и Ядрото на ниво %', percent: true },
};

type ClanBuildingRowConfig = ClanBalanceConfigDto['buildings'][string];

function ClanBalancePanel() {
  const [data, setData] = useState<AdminClanBalanceDto | null>(null);
  const [config, setConfig] = useState<ClanBalanceConfigDto | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    adminFetch<AdminClanBalanceDto>('/admin/balance/clan')
      .then((res) => {
        setData(res);
        setConfig(res.config);
        setDirty(false);
        setSelected((s) => s ?? res.buildings[0]?.key ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  async function send(method: 'POST' | 'PUT') {
    if (!config) return;
    if (method === 'PUT' && !window.confirm('Да запиша ли баланса на клановите сгради за всички кланове?')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<AdminClanBalanceDto>(method === 'PUT' ? '/admin/balance/clan' : '/admin/balance/clan/preview', { method, body: { config } });
      setData(res);
      if (method === 'PUT') {
        setConfig(res.config);
        setDirty(false);
        setMessage('Записано и приложено.');
      } else {
        setMessage('Прегледът е обновен — нищо не е записано.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  if (!data || !config) {
    return (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="text-sm font-semibold">Кланови сгради</h2>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : <p className="mt-2 text-xs text-textFaint">Зареждане…</p>}
      </section>
    );
  }

  const num = 'w-20 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent';
  const update = (fn: (c: ClanBalanceConfigDto) => void) => {
    const next = structuredClone(config);
    fn(next);
    setConfig(next);
    setDirty(true);
  };
  const field = (label: string, value: number, onChange: (v: number) => void) => (
    <label className="flex flex-col gap-1 text-[11px] text-textFaint">
      {label}
      <input type="number" step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} className={num} />
    </label>
  );
  const changed = (next: number, current: number | undefined, format: (n: number) => string = (n) => gmNumber(n)) => (
    <span className={current !== undefined && current !== next ? 'text-vipGold' : ''}>
      {format(next)}
      {current !== undefined && current !== next && <span className="text-textFaint"> ({format(current)})</span>}
    </span>
  );
  const pct = (v: number) => Math.round(v * 10000) / 100;
  const t = config.tavern;
  const selectedBuilding = data.buildings.find((b) => b.key === selected) ?? data.buildings[0] ?? null;

  return (
    <>
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Кланови сгради</h2>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send('POST')} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Преглед
            </button>
            <button type="button" disabled={busy || !dirty} onClick={() => send('PUT')} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Запази и приложи
            </button>
            <button type="button" disabled={busy || !dirty} onClick={load} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover disabled:opacity-50">
              Отказ
            </button>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-textFaint">
          Цена на ниво = „стойността“ на нивото от „Сгради“ (производство на мината × ниво × часове производство) × кланов множител, защото плаща целият
          клан. „Стъпка“: всяко ниво струва колкото толкова нива на модела (Залата на членовете има 10 нива, затова 3). Време = база × (ниво × стъпка)
          <sup>растеж</sup>. „Цена ×“ прави една сграда по-скъпа или по-евтина от другите (Кръчмата е 0,8, защото е активна само част от времето). Промяна на производството в „Сгради“ променя и тези цени. Бонусите важат веднага за всички кланове.
        </p>
        {dirty && <p className="mb-2 text-[11px] text-vipGold">Има незаписани промени.</p>}
        {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
        {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}
        <div className="flex flex-wrap gap-3">
          {field('кланов множител (метал)', config.costFactor, (v) => update((c) => (c.costFactor = v)))}
          {field('кристал ×', config.crystal, (v) => update((c) => (c.crystal = v)))}
          {field('кредити ×', config.credits, (v) => update((c) => (c.credits = v)))}
          {field('време: база (сек)', config.buildTime.base, (v) => update((c) => (c.buildTime.base = v)))}
          {field('време: растеж', config.buildTime.growth, (v) => update((c) => (c.buildTime.growth = v)))}
        </div>
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-2 text-xs font-semibold">Сгради</h3>
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>сграда</th>
                <th>бонус на ниво</th>
                <th>макс. ниво</th>
                <th>стъпка</th>
                <th>цена ×</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.buildings.map((b) => {
                const bc = config.buildings[b.key];
                const meta = CLAN_BONUS_LABELS[b.bonusType] ?? { label: b.bonusType, percent: false };
                const set = (fn: (x: ClanBuildingRowConfig) => void) => update((c) => fn(c.buildings[b.key]));
                return (
                  <tr key={b.key}>
                    <td>{resolveMessageKey(b.nameKey)}</td>
                    <td>
                      <label className="flex items-center gap-1 text-[11px] text-textFaint">
                        <input
                          type="number"
                          step="any"
                          value={meta.percent ? pct(bc.bonusPerLevel) : bc.bonusPerLevel}
                          onChange={(e) => set((x) => (x.bonusPerLevel = meta.percent ? Number(e.target.value) / 100 : Number(e.target.value)))}
                          className={num}
                        />
                        {meta.label}
                      </label>
                    </td>
                    <td>
                      <input type="number" value={bc.maxLevel} onChange={(e) => set((x) => (x.maxLevel = Number(e.target.value)))} className={num} />
                    </td>
                    <td>
                      <input type="number" step="any" value={bc.levelStep} onChange={(e) => set((x) => (x.levelStep = Number(e.target.value)))} className={num} />
                    </td>
                    <td>
                      <input type="number" step="any" value={bc.cost} onChange={(e) => set((x) => (x.cost = Number(e.target.value)))} className={num} />
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setSelected(b.key)}
                        className={`rounded-md border px-2 py-0.5 text-[11px] ${selectedBuilding?.key === b.key ? 'border-accent bg-accentBg' : 'border-panelBorder hover:bg-accentBgHover'}`}
                      >
                        нива
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Кръчма — активиране</h3>
        <p className="mb-2 text-[11px] text-textFaint">Бонусът важи само докато е активна. Цената е за ниво 1 и расте с производството.</p>
        <div className="flex flex-wrap gap-3">
          {field('часове', t.activationHours, (v) => update((c) => (c.tavern.activationHours = v)))}
          {field('метал', t.activationMetal, (v) => update((c) => (c.tavern.activationMetal = v)))}
          {field('кристал', t.activationCrystal, (v) => update((c) => (c.tavern.activationCrystal = v)))}
          {field('кредити', t.activationCredits, (v) => update((c) => (c.tavern.activationCredits = v)))}
        </div>
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Генератор — енергия</h3>
        <p className="mb-2 text-[11px] text-textFaint">+1 макс. енергия за всеки член на всяко от тези нива (през запетая).</p>
        <input
          type="text"
          key={config.generatorMaxEnergyLevels.join(',')}
          defaultValue={config.generatorMaxEnergyLevels.join(', ')}
          onBlur={(e) =>
            update(
              (c) =>
                (c.generatorMaxEnergyLevels = e.target.value
                  .split(/[,\s]+/)
                  .filter(Boolean)
                  .map(Number)),
            )
          }
          className="w-32 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent"
        />
      </section>

      {selectedBuilding && (
        <section className="rounded-lg border border-panelBorder bg-panel p-4">
          <h3 className="mb-1 text-xs font-semibold">Нива: {resolveMessageKey(selectedBuilding.nameKey)}</h3>
          <p className="mb-2 text-[11px] text-textFaint">В цвят са промените, които „Преглед“ показва, със сегашните в скоби.</p>
          <div className="max-w-full overflow-x-auto">
            <table className={GRID_TABLE}>
              <thead className="text-[10px] uppercase text-textFaint">
                <tr>
                  <th>ниво</th>
                  <th>метал</th>
                  <th>кристал</th>
                  <th>кредити</th>
                  <th>време</th>
                </tr>
              </thead>
              <tbody>
                {selectedBuilding.levels.map((l) => (
                  <tr key={l.level}>
                    <td>{l.level}</td>
                    <td className="tabular-nums">{changed(l.metalCost, l.current?.metalCost)}</td>
                    <td className="tabular-nums">{changed(l.crystalCost, l.current?.crystalCost)}</td>
                    <td className="tabular-nums">{changed(l.creditsCost, l.current?.creditsCost)}</td>
                    <td className="tabular-nums">{changed(l.constructionSeconds, l.current?.constructionSeconds, formatSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

const SET_LABELS: [string, string][] = [
  ['pioneer', 'Pioneer'],
  ['ascendant', 'Ascendant'],
  ['coreforged', 'Coreforged'],
];
const SLOT_LABELS: [string, string][] = [
  ['HEAD', 'Глава'],
  ['LEFT_ARM', 'Лява ръка'],
  ['RIGHT_ARM', 'Дясна ръка'],
  ['ARMOR', 'Броня'],
  ['CORE', 'Ядро'],
  ['LEFT_LEG', 'Ляв крак'],
  ['RIGHT_LEG', 'Десен крак'],
];
const SET_STAT_LABELS: [keyof EquipmentSlotStatsDto, string][] = [
  ['attack', 'А'],
  ['defense', 'З'],
  ['hp', 'HP'],
];
const ROBOT_LABELS: Record<string, string> = { none: 'без екипировка', base: 'сет +0', max: 'сет макс.' };

function EquipmentBalancePanel() {
  const [data, setData] = useState<AdminEquipmentBalanceDto | null>(null);
  const [config, setConfig] = useState<EquipmentBalanceConfigDto | null>(null);
  const [split, setSplit] = useState<EquipmentSplitDto>({ damage: 1, defense: 1, hp: 1, researchAttack: 0, researchHp: 0, forge: 0 });
  const [scale, setScale] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    adminFetch<AdminEquipmentBalanceDto>('/admin/balance/equipment')
      .then((res) => {
        setData(res);
        setConfig(res.config);
        setSplit(res.split);
        setDirty(false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  async function send(method: 'POST' | 'PUT') {
    if (!config) return;
    if (method === 'PUT' && !window.confirm('Да запиша ли баланса на сетовете? Важи веднага за всички предмети у играчите, включително екипираните.')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<AdminEquipmentBalanceDto>(method === 'PUT' ? '/admin/balance/equipment' : '/admin/balance/equipment/preview', {
        method,
        body: { config, split },
      });
      setData(res);
      if (method === 'PUT') {
        setConfig(res.config);
        setDirty(false);
        setMessage('Записано и приложено.');
      } else {
        setMessage('Прегледът е обновен — нищо не е записано.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  if (!data || !config) {
    return (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="text-sm font-semibold">Сетове</h2>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : <p className="mt-2 text-xs text-textFaint">Зареждане…</p>}
      </section>
    );
  }

  const num = 'w-20 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent';
  const small = 'w-14 rounded-md border border-wellBorder bg-well px-1 py-1 text-xs outline-none focus:border-accent';
  const update = (fn: (c: EquipmentBalanceConfigDto) => void) => {
    const next = structuredClone(config);
    fn(next);
    setConfig(next);
    setDirty(true);
  };
  const field = (label: string, value: number, onChange: (v: number) => void) => (
    <label className="flex flex-col gap-1 text-[11px] text-textFaint">
      {label}
      <input type="number" step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} className={num} />
    </label>
  );
  // A helper, not a formula: multiplies the set's numbers once (whole numbers), then they're plain values again.
  const scaleSet = (tier: string) => {
    const factor = scale[tier];
    if (!factor || factor <= 0) return;
    update((c) => {
      for (const [slot] of SLOT_LABELS) {
        const s = c.sets[tier].slots[slot];
        s.attack = Math.round(s.attack * factor);
        s.defense = Math.round(s.defense * factor);
        s.hp = Math.round(s.hp * factor);
      }
    });
  };
  const setTotal = (tier: string, stat: keyof EquipmentSlotStatsDto) => SLOT_LABELS.reduce((sum, [slot]) => sum + config.sets[tier].slots[slot][stat], 0);
  const currentZone = (key: string) => data.currentZones?.find((z) => z.zoneKey === key) ?? null;
  const winCell = (rate: number, current: number | undefined) => (
    <span className={rate >= 90 ? 'text-positive' : rate <= 10 ? 'text-danger' : 'text-vipGold'}>
      {gmNumber(rate)}%
      {current !== undefined && current !== rate && <span className="text-textFaint"> ({gmNumber(current)}%)</span>}
    </span>
  );

  return (
    <>
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Сетове</h2>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send('POST')} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Преглед
            </button>
            <button type="button" disabled={busy || !dirty} onClick={() => send('PUT')} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Запази и приложи
            </button>
            <button type="button" disabled={busy || !dirty} onClick={load} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover disabled:opacity-50">
              Отказ
            </button>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-textFaint">
          Какво дава всеки слот на всеки сет (А = атака, З = защита). Предметите у играчите четат тези стойности, така че промяната важи веднага за всички
          притежавани предмети, включително екипираните и тези на Пазара. Ако се свали максималното подобрение, вече подобрените предмети си остават, но
          не могат да се качват повече.
        </p>
        {dirty && <p className="mb-2 text-[11px] text-vipGold">Има незаписани промени.</p>}
        {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
        {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th rowSpan={2}>слот</th>
                {SET_LABELS.map(([tier, label]) => (
                  <th key={tier} colSpan={3} className="text-center">
                    {label}
                  </th>
                ))}
              </tr>
              <tr>
                {SET_LABELS.flatMap(([tier]) => SET_STAT_LABELS.map(([stat, label]) => <th key={`${tier}-${stat}`}>{label}</th>))}
              </tr>
            </thead>
            <tbody>
              {SLOT_LABELS.map(([slot, slotLabel]) => (
                <tr key={slot}>
                  <td>{slotLabel}</td>
                  {SET_LABELS.flatMap(([tier]) =>
                    SET_STAT_LABELS.map(([stat]) => (
                      <td key={`${tier}-${stat}`}>
                        <input
                          type="number"
                          value={config.sets[tier].slots[slot][stat]}
                          onChange={(e) => update((c) => (c.sets[tier].slots[slot][stat] = Number(e.target.value)))}
                          className={small}
                        />
                      </td>
                    )),
                  )}
                </tr>
              ))}
              <tr className="font-semibold">
                <td>общо (+0)</td>
                {SET_LABELS.flatMap(([tier]) => SET_STAT_LABELS.map(([stat]) => <td key={`${tier}-${stat}`} className="tabular-nums">{gmNumber(setTotal(tier, stat))}</td>))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {SET_LABELS.map(([tier, label]) => (
            <div key={tier} className="rounded-md border border-wellBorder p-2">
              <p className="mb-2 text-xs font-semibold">{label}</p>
              <div className="flex flex-wrap gap-3">
                {field('макс. подобрение', config.sets[tier].maxUpgradeLevel, (v) => update((c) => (c.sets[tier].maxUpgradeLevel = v)))}
                {field('продажба: метал', config.sets[tier].sellMetal, (v) => update((c) => (c.sets[tier].sellMetal = v)))}
                {field('продажба: кристал', config.sets[tier].sellCrystal, (v) => update((c) => (c.sets[tier].sellCrystal = v)))}
              </div>
              <div className="mt-2 flex items-end gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-textFaint">
                  умножи статовете по
                  <input type="number" step="any" value={scale[tier] ?? ''} onChange={(e) => setScale((s) => ({ ...s, [tier]: Number(e.target.value) }))} className={num} />
                </label>
                <button type="button" onClick={() => scaleSet(tier)} className="rounded-md border border-panelBorder px-2 py-1 text-[11px] hover:bg-accentBgHover">
                  приложи
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Подобряване и продажба</h3>
        <p className="mb-2 text-[11px] text-textFaint">
          Всяко ниво подобрение добавя „бонус“ от базовите статове. Ниво N струва „камъни на ниво“ × N камъка от сета. Рециклиран предмет дава фрагмент,
          а толкова фрагмента правят камък. Продажбата се умножава по качеството.
        </p>
        <div className="flex flex-wrap gap-3">
          {field('бонус на ниво %', Math.round(config.upgrade.bonusPerLevel * 10000) / 100, (v) => update((c) => (c.upgrade.bonusPerLevel = v / 100)))}
          {field('камъни на ниво', config.upgrade.materialsPerLevel, (v) => update((c) => (c.upgrade.materialsPerLevel = v)))}
          {field('фрагменти за камък', config.upgrade.fragmentsPerStone, (v) => update((c) => (c.upgrade.fragmentsPerStone = v)))}
          {field('продажба: Нормален ×', config.qualitySellMultiplier.NORMAL, (v) => update((c) => (c.qualitySellMultiplier.NORMAL = v)))}
          {field('продажба: Рядък ×', config.qualitySellMultiplier.RARE, (v) => update((c) => (c.qualitySellMultiplier.RARE = v)))}
          {field('продажба: Епичен ×', config.qualitySellMultiplier.EPIC, (v) => update((c) => (c.qualitySellMultiplier.EPIC = v)))}
        </div>
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Преглед: еталонен робот срещу Пентилите</h3>
        <p className="mb-2 text-[11px] text-textFaint">
          За първия и последния Пентил на всяка зона: робот на неговото ниво с базовия минимум, точките за атрибути (разпределени като долу) и сета, който
          пада в зоната, плюс бонусите от проучвания и Ковачница, зададени долу (без опции на предметите). Шансът за победа е от {data.simulationRuns} истински симулации
          на боя. Камъните са само от Пентилите на зоната (камъни, фрагменти и рециклиране на паднали предмети); босовете и магазинът дават още.
          Разпределението и бонусите се ползват само за прегледа и не се записват.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          {field('точки: атака (дял)', split.damage, (v) => setSplit((s) => ({ ...s, damage: v })))}
          {field('точки: защита (дял)', split.defense, (v) => setSplit((s) => ({ ...s, defense: v })))}
          {field('точки: HP (дял)', split.hp, (v) => setSplit((s) => ({ ...s, hp: v })))}
          {field('проучване атака %', Math.round(split.researchAttack * 10000) / 100, (v) => setSplit((s) => ({ ...s, researchAttack: v / 100 })))}
          {field('проучване HP %', Math.round(split.researchHp * 10000) / 100, (v) => setSplit((s) => ({ ...s, researchHp: v / 100 })))}
          {field('Ковачница %', Math.round(split.forge * 10000) / 100, (v) => setSplit((s) => ({ ...s, forge: v / 100 })))}
          <button
            type="button"
            onClick={() => setSplit((s) => ({ ...s, ...data.maxBonuses }))}
            className="rounded-md border border-panelBorder px-2 py-1.5 text-[11px] hover:bg-accentBgHover"
          >
            максимални ({gmNumber(data.maxBonuses.researchAttack * 100)}% / {gmNumber(data.maxBonuses.researchHp * 100)}% / {gmNumber(data.maxBonuses.forge * 100)}%)
          </button>
          <button
            type="button"
            onClick={() => setSplit((s) => ({ ...s, researchAttack: 0, researchHp: 0, forge: 0 }))}
            className="rounded-md border border-panelBorder px-2 py-1.5 text-[11px] hover:bg-accentBgHover"
          >
            без бонуси
          </button>
          <button type="button" disabled={busy} onClick={() => send('POST')} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
            Пресметни
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {data.zones.map((z) => {
            const cz = currentZone(z.zoneKey);
            return (
              <div key={z.zoneKey}>
                <p className="mb-1 text-xs font-semibold">
                  {resolveMessageKey(z.zoneNameKey)} — {SET_LABELS.find(([t]) => t === z.tier)?.[1] ?? z.tier} до +{z.maxUpgradeLevel}
                </p>
                <p className="mb-1 text-[11px] text-textFaint">
                  До +{z.maxUpgradeLevel}: {gmNumber(z.stonesToMax)} камъка · {gmNumber(z.stonesPerBattle)} камъка на битка ·{' '}
                  {z.battlesToMax !== null ? `около ${gmNumber(z.battlesToMax)} битки` : 'не падат камъни'}
                  {cz && cz.battlesToMax !== z.battlesToMax && cz.battlesToMax !== null && <span> (сега {gmNumber(cz.battlesToMax)})</span>}
                </p>
                <div className="max-w-full overflow-x-auto">
                  <table className={GRID_TABLE}>
                    <thead className="text-[10px] uppercase text-textFaint">
                      <tr>
                        <th>Пентил</th>
                        <th>точки</th>
                        {['none', 'base', 'max'].map((k) => (
                          <th key={k}>{ROBOT_LABELS[k]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {z.fights.map((f) => {
                        const cf = cz?.fights.find((x) => x.pentiliKey === f.pentiliKey);
                        return (
                          <tr key={f.pentiliKey}>
                            <td>
                              {resolveMessageKey(f.nameKey)} (ниво {f.level})
                              <div className="text-[10px] text-textFaint">
                                А {gmNumber(f.pentili.attack)} · З {gmNumber(f.pentili.defense)} · HP {gmNumber(f.pentili.maxHp)}
                              </div>
                            </td>
                            <td className="tabular-nums">{gmNumber(f.attributePoints)}</td>
                            {f.robots.map((r) => (
                              <td key={r.kind} className="tabular-nums">
                                {winCell(r.winRate, cf?.robots.find((x) => x.kind === r.kind)?.winRate)}
                                <div className="text-[10px] text-textFaint">
                                  А {gmNumber(r.stats.attack)} · З {gmNumber(r.stats.defense)} · HP {gmNumber(r.stats.hp)}
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function ExpeditionBalancePanel() {
  const [data, setData] = useState<AdminExpeditionBalanceDto | null>(null);
  const [config, setConfig] = useState<ExpeditionBalanceConfigDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    adminFetch<AdminExpeditionBalanceDto>('/admin/balance/expeditions')
      .then((res) => {
        setData(res);
        setConfig(res.config);
        setDirty(false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  async function send(method: 'POST' | 'PUT') {
    if (!config) return;
    if (method === 'PUT' && !window.confirm('Да запиша ли баланса на експедициите?')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<AdminExpeditionBalanceDto>(method === 'PUT' ? '/admin/balance/expeditions' : '/admin/balance/expeditions/preview', {
        method,
        body: { config },
      });
      setData(res);
      if (method === 'PUT') {
        setConfig(res.config);
        setDirty(false);
        setMessage('Записано и приложено.');
      } else {
        setMessage('Прегледът е обновен — нищо не е записано.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  if (!data || !config) {
    return (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="text-sm font-semibold">Експедиции</h2>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : <p className="mt-2 text-xs text-textFaint">Зареждане…</p>}
      </section>
    );
  }

  const num = 'w-20 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent';
  const update = (fn: (c: ExpeditionBalanceConfigDto) => void) => {
    const next = structuredClone(config);
    fn(next);
    setConfig(next);
    setDirty(true);
  };
  const cell = (next: number, current: number | undefined) => (
    <span className={current !== undefined && current !== next ? 'text-vipGold' : ''}>
      {gmNumber(next)}
      {current !== undefined && current !== next && <span className="text-textFaint"> ({gmNumber(current)})</span>}
    </span>
  );

  return (
    <>
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Експедиции</h2>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send('POST')} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Преглед
            </button>
            <button type="button" disabled={busy || !dirty} onClick={() => send('PUT')} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Запази и приложи
            </button>
            <button type="button" disabled={busy || !dirty} onClick={load} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover disabled:opacity-50">
              Отказ
            </button>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-textFaint">
          Експедицията дава колкото „битки“ с Пентил на нивото на играча: метал, кристал и опит по кривите от „Пентили“ (без колебанието), плюс
          проучването „Навигация“ за ресурсите. Без кредити. Бонус предметът е случаен предмет от сета на най-високата отключена зона на играча. Енергията
          дава {gmNumber(data.fightsPerHourFromEnergy)} битки на час — за сравнение.
        </p>
        {dirty && <p className="mb-2 text-[11px] text-vipGold">Има незаписани промени.</p>}
        {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
        {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>експедиция</th>
                <th>минути</th>
                <th>битки</th>
                <th>битки на час</th>
                <th>бонус предмет %</th>
                <th>ниво Навигация</th>
              </tr>
            </thead>
            <tbody>
              {data.expeditions.map((e) => {
                const ec = config.expeditions[e.key];
                return (
                  <tr key={e.key}>
                    <td>{resolveMessageKey(e.nameKey)}</td>
                    <td><input type="number" value={ec.durationMinutes} onChange={(ev) => update((c) => (c.expeditions[e.key].durationMinutes = Number(ev.target.value)))} className={num} /></td>
                    <td><input type="number" step="any" value={ec.fights} onChange={(ev) => update((c) => (c.expeditions[e.key].fights = Number(ev.target.value)))} className={num} /></td>
                    <td className="tabular-nums">{ec.durationMinutes > 0 ? gmNumber(Math.round((ec.fights / (ec.durationMinutes / 60)) * 100) / 100) : '—'}</td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        value={Math.round(ec.bonusItemChance * 10000) / 100}
                        onChange={(ev) => update((c) => (c.expeditions[e.key].bonusItemChance = Number(ev.target.value) / 100))}
                        className={num}
                      />
                    </td>
                    <td><input type="number" value={ec.requiredNavigationLevel} onChange={(ev) => update((c) => (c.expeditions[e.key].requiredNavigationLevel = Number(ev.target.value)))} className={num} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label className="mt-3 flex w-fit flex-col gap-1 text-[11px] text-textFaint">
          ранно прекратяване: изплаща % от събраното
          <input
            type="number"
            step="any"
            value={Math.round(config.earlyCancelPercentage * 10000) / 100}
            onChange={(ev) => update((c) => (c.earlyCancelPercentage = Number(ev.target.value) / 100))}
            className={num}
          />
        </label>
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Награди по ниво на играча</h3>
        <p className="mb-2 text-[11px] text-textFaint">Без „Навигация“. В цвят са промените, които „Преглед“ показва, със сегашните в скоби.</p>
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th rowSpan={2}>ниво</th>
                {data.expeditions.map((e) => (
                  <th key={e.key} colSpan={3} className="text-center">
                    {resolveMessageKey(e.nameKey)}
                  </th>
                ))}
              </tr>
              <tr>
                {data.expeditions.flatMap((e) => [
                  <th key={`${e.key}-m`}>метал</th>,
                  <th key={`${e.key}-c`}>кристал</th>,
                  <th key={`${e.key}-x`}>опит</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {data.levels.map((row) => {
                const current = data.currentLevels?.find((r) => r.level === row.level);
                return (
                  <tr key={row.level}>
                    <td>{row.level}</td>
                    {data.expeditions.flatMap((e) => {
                      const r = row.rewards[e.key];
                      const c = current?.rewards[e.key];
                      return [
                        <td key={`${e.key}-m`} className="tabular-nums">{cell(r.metal, c?.metal)}</td>,
                        <td key={`${e.key}-c`} className="tabular-nums">{cell(r.crystal, c?.crystal)}</td>,
                        <td key={`${e.key}-x`} className="tabular-nums">{cell(r.xp, c?.xp)}</td>,
                      ];
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function BossBalancePanel() {
  const [data, setData] = useState<AdminBossBalanceDto | null>(null);
  const [config, setConfig] = useState<BossBalanceConfigDto | null>(null);
  const [split, setSplit] = useState<EquipmentSplitDto>({ damage: 1, defense: 1, hp: 1, researchAttack: 0, researchHp: 0, forge: 0 });
  const [tavern, setTavern] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    adminFetch<AdminBossBalanceDto>('/admin/balance/bosses')
      .then((res) => {
        setData(res);
        setConfig(res.config);
        setDirty(false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  async function send(method: 'POST' | 'PUT') {
    if (!config) return;
    if (method === 'PUT' && !window.confirm('Да запиша ли баланса на босовете?')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<AdminBossBalanceDto>(method === 'PUT' ? '/admin/balance/bosses' : '/admin/balance/bosses/preview', {
        method,
        body: { config, split, tavern },
      });
      setData(res);
      if (method === 'PUT') {
        setConfig(res.config);
        setDirty(false);
        setMessage('Записано и приложено.');
      } else {
        setMessage('Прегледът е обновен — нищо не е записано.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  if (!data || !config) {
    return (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="text-sm font-semibold">Босове</h2>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : <p className="mt-2 text-xs text-textFaint">Зареждане…</p>}
      </section>
    );
  }

  const num = 'w-20 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent';
  const select = 'max-w-[14rem] rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent';
  const update = (fn: (c: BossBalanceConfigDto) => void) => {
    const next = structuredClone(config);
    fn(next);
    setConfig(next);
    setDirty(true);
  };
  const field = (label: string, value: number, onChange: (v: number) => void) => (
    <label className="flex flex-col gap-1 text-[11px] text-textFaint">
      {label}
      <input type="number" step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} className={num} />
    </label>
  );
  const pct = (v: number) => Math.round(v * 10000) / 100;
  const boxes = data.items.filter((i) => i.key.endsWith('_box'));
  const winCell = (rate: number, current: number | undefined) => (
    <span className={rate >= 90 ? 'text-positive' : rate <= 10 ? 'text-danger' : 'text-vipGold'}>
      {gmNumber(rate)}%
      {current !== undefined && current !== rate && <span className="text-textFaint"> ({gmNumber(current)}%)</span>}
    </span>
  );

  return (
    <>
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Босове</h2>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send('POST')} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Преглед
            </button>
            <button type="button" disabled={busy || !dirty} onClick={() => send('PUT')} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Запази и приложи
            </button>
            <button type="button" disabled={busy || !dirty} onClick={load} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover disabled:opacity-50">
              Отказ
            </button>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-textFaint">
          Всеки участник в спечелена формация получава гарантираната кутия, своя дял от опита (опитът се дели на заетите места) и тегли плячката
          отделно. Метал и кристал: колкото „битки“ с Пентил на мин. ниво на боса, по кривите от „Пентили“ с колебанието им. Кредитите са по подразбиране
          0 (босовете не дават кредити).
        </p>
        {dirty && <p className="mb-2 text-[11px] text-vipGold">Има незаписани промени.</p>}
        {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
        {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}
        <div className="flex flex-col gap-4">
          {data.bosses.map((row) => {
            const b = config.bosses[row.key];
            if (!b) return null;
            const set = (fn: (x: BossBalanceConfigDto['bosses'][string]) => void) => update((c) => fn(c.bosses[row.key]));
            return (
              <div key={row.key} className="rounded-md border border-wellBorder p-3">
                <p className="mb-2 text-xs font-semibold">
                  {resolveMessageKey(row.nameKey)} <span className="font-normal text-textFaint">— {resolveMessageKey(row.zoneNameKey)}</span>
                </p>
                <div className="flex flex-wrap gap-3">
                  {field('мин. ниво', b.minLevel, (v) => set((x) => (x.minLevel = v)))}
                  {field('HP', b.maxHp, (v) => set((x) => (x.maxHp = v)))}
                  {field('атака', b.attack, (v) => set((x) => (x.attack = v)))}
                  {field('защита', b.defense, (v) => set((x) => (x.defense = v)))}
                  {field('опит (общо)', b.xpReward, (v) => set((x) => (x.xpReward = v)))}
                  <label className="flex flex-col gap-1 text-[11px] text-textFaint">
                    гарантирана кутия
                    <select value={b.boxKey} onChange={(e) => set((x) => (x.boxKey = e.target.value))} className={select}>
                      {boxes.map((i) => (
                        <option key={i.key} value={i.key}>
                          {resolveMessageKey(i.nameKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {field('ресурси: битки', b.resourceFights, (v) => set((x) => (x.resourceFights = v)))}
                </div>
                <p className="mt-2 text-[11px] text-textFaint">
                  На участник: метал {gmNumber(row.metal[0])}–{gmNumber(row.metal[1])}, кристал {gmNumber(row.crystal[0])}–{gmNumber(row.crystal[1])}
                  {data.currentBosses && ' (след „Преглед“)'}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {field('кредити: шанс %', pct(b.credits.chance), (v) => set((x) => (x.credits.chance = v / 100)))}
                  {field('кредити: от', b.credits.min, (v) => set((x) => (x.credits.min = v)))}
                  {field('кредити: до', b.credits.max, (v) => set((x) => (x.credits.max = v)))}
                </div>
                <p className="mb-1 mt-3 text-[11px] font-semibold text-textMuted">Предмети</p>
                <div className="flex flex-col gap-2">
                  {b.items.map((drop, index) => (
                    <div key={index} className="flex flex-wrap items-end gap-2">
                      <select value={drop.itemKey} onChange={(e) => set((x) => (x.items[index].itemKey = e.target.value))} className={select}>
                        {data.items.map((i) => (
                          <option key={i.key} value={i.key}>
                            {resolveMessageKey(i.nameKey)}
                          </option>
                        ))}
                      </select>
                      {field('шанс %', pct(drop.chance), (v) => set((x) => (x.items[index].chance = v / 100)))}
                      {field('от', drop.min, (v) => set((x) => (x.items[index].min = v)))}
                      {field('до', drop.max, (v) => set((x) => (x.items[index].max = v)))}
                      <button type="button" onClick={() => set((x) => x.items.splice(index, 1))} className="rounded-md border border-panelBorder px-2 py-1 text-[11px] text-danger hover:bg-accentBgHover">
                        махни
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => set((x) => x.items.push({ itemKey: data.items[0]?.key ?? '', chance: 0.1, min: 1, max: 1 }))}
                    className="w-fit rounded-md border border-panelBorder px-2 py-1 text-[11px] hover:bg-accentBgHover"
                  >
                    + предмет
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Преглед: формации от еталонни роботи</h3>
        <p className="mb-2 text-[11px] text-textFaint">
          1 до 5 еднакви робота на мин. ниво на боса, със сета на зоната му (+0 и макс.), точки и бонуси както долу (същите като в „Сетове“, плюс
          Кръчмата, която важи само срещу босове и Ядрото). Шансът е от {data.simulationRuns} истински симулации на боя. Не се записва.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          {field('точки: атака (дял)', split.damage, (v) => setSplit((s) => ({ ...s, damage: v })))}
          {field('точки: защита (дял)', split.defense, (v) => setSplit((s) => ({ ...s, defense: v })))}
          {field('точки: HP (дял)', split.hp, (v) => setSplit((s) => ({ ...s, hp: v })))}
          {field('проучване атака %', pct(split.researchAttack), (v) => setSplit((s) => ({ ...s, researchAttack: v / 100 })))}
          {field('проучване HP %', pct(split.researchHp), (v) => setSplit((s) => ({ ...s, researchHp: v / 100 })))}
          {field('Ковачница %', pct(split.forge), (v) => setSplit((s) => ({ ...s, forge: v / 100 })))}
          {field('Кръчма %', pct(tavern), (v) => setTavern(v / 100))}
          <button
            type="button"
            onClick={() => {
              const { tavern: maxTavern, ...rest } = data.maxBonuses;
              setSplit((s) => ({ ...s, ...rest }));
              setTavern(maxTavern);
            }}
            className="rounded-md border border-panelBorder px-2 py-1.5 text-[11px] hover:bg-accentBgHover"
          >
            максимални
          </button>
          <button
            type="button"
            onClick={() => {
              setSplit((s) => ({ ...s, researchAttack: 0, researchHp: 0, forge: 0 }));
              setTavern(0);
            }}
            className="rounded-md border border-panelBorder px-2 py-1.5 text-[11px] hover:bg-accentBgHover"
          >
            без бонуси
          </button>
          <button type="button" disabled={busy} onClick={() => send('POST')} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
            Пресметни
          </button>
        </div>
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>бос</th>
                {[1, 2, 3, 4, 5].map((k) => (
                  <th key={k}>{k} играч{k === 1 ? '' : 'а'}: +0 / макс.</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.bosses.map((row) => {
                const current = data.currentBosses?.find((r) => r.key === row.key);
                return (
                  <tr key={row.key}>
                    <td>
                      {resolveMessageKey(row.nameKey)}
                      <div className="text-[10px] text-textFaint">ниво {config.bosses[row.key]?.minLevel}, {SET_LABELS.find(([t]) => t === row.tier)?.[1] ?? row.tier}</div>
                    </td>
                    {row.formations.map((f) => {
                      const cf = current?.formations.find((x) => x.players === f.players);
                      return (
                        <td key={f.players} className="tabular-nums">
                          {winCell(f.base, cf?.base)} / {winCell(f.max, cf?.max)}
                          <div className="text-[10px] text-textFaint">опит {gmNumber(f.xpEach)} на играч</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// Labels for godmaster → Balance → Other values (the API only knows the paths).
const OTHER_GROUPS: { title: string; items: [string, string, string?][] }[] = [
  {
    title: 'Енергия и инвентар',
    items: [
      ['newPlayer.actionEnergy', 'базова макс. енергия', 'преди Реактора, Генератора и VIP; важи при следващото действие на играча'],
      ['actionEnergy.regenIntervalMinutes', 'минути за 1 енергия'],
      ['inventory.baseCapacity', 'места в инвентара', 'преди Склада'],
    ],
  },
  {
    title: 'Бой',
    items: [
      ['combat.basePlayerHp', 'базово HP на робота', 'и без екипировка'],
      ['combat.baseAttack', 'базова атака на робота'],
      ['combat.baseDefense', 'базова защита на робота'],
      ['combat.damageVariance', 'колебание на щетата %', '± от удара'],
      ['combat.maxRounds', 'макс. рундове в битка с Пентил'],
      ['combat.criticalChance', 'шанс за критичен удар %'],
      ['combat.criticalMultiplier', 'критичен удар ×'],
    ],
  },
  {
    title: 'Качество и раса на предметите',
    items: [
      ['rarity.rareChance', 'шанс за Рядък %', 'при всеки паднал или купен предмет'],
      ['boxOpen.epicChance', 'кутия: шанс за Епичен %', 'останалото е Рядък'],
      ['raceLock.ascendantUniversalChance', 'Ascendant: шанс да е универсален %', 'останалото се дели поравно между 5-те раси'],
    ],
  },
  {
    title: 'Точки за атрибути',
    items: [
      ['robotAttributes.basePointsPerLevel', 'точки на ниво'],
      ['robotAttributes.pointsGrowthRate', 'растеж на точките на ниво', '0 = еднакво на всяко ниво'],
      ['robotAttributes.baseAttributeCost', 'цена на точка'],
      ['robotAttributes.attributeCostGrowthRate', 'растеж на цената', '0 = всяка точка струва еднакво'],
      ['robotAttributes.damagePointValue', 'атака за 1 точка'],
      ['robotAttributes.defensePointValue', 'защита за 1 точка'],
      ['robotAttributes.hpPointValue', 'HP за 1 точка'],
      ['robotAttributes.evasionPointValue', 'избягване за 1 точка (%)'],
      ['robotAttributes.maxEvasionPercent', 'макс. избягване (%)'],
    ],
  },
  {
    title: 'Рециклиране',
    items: [
      ['itemRecycle.fragmentsPerItem', 'фрагменти от 1 предмет'],
      ['recyclingExtraFragmentEvery', 'проучване „Рециклиране“: +1 фрагмент на всеки … нива'],
    ],
  },
  {
    title: 'Формации срещу босове',
    items: [
      ['bossFormations.enrollmentWindowHours', 'часове за записване'],
      ['bossFormations.visibilityEditWindowHours', 'часове, в които създателят може да сменя видимостта'],
      ['bossFormations.actionCooldownHours', 'изчакване за формация: нулира се на всеки … часа', 'всички играчи едновременно; стойности, които делят 24'],
      ['bossFormations.cooldownResetHour', 'изчакване за формация: от кой час (UTC)', '0 = 00:00 UTC = 02:00 българско зимно / 03:00 лятно време'],
      ['bossFormations.maxDamageDecrease', 'таван на „намаление на щетата“ във формация %'],
    ],
  },
  {
    title: 'PvP',
    items: [
      ['pvp.minLevel', 'от ниво', 'и не може да бъде нападан под него'],
      ['pvp.attackCostEnergy', 'енергия за нападение'],
      ['pvp.resourceStealPercentage', 'взема % от метала и кристала', 'над защитеното в Скривалището'],
      ['pvp.attackCooldownMinutes', 'минути между две нападения на същия играч'],
      ['pvp.revengeProtectionMinutes', 'минути защита след загубена защита', 'преди Стената'],
      ['pvp.levelDifferenceAdjustment', '% промяна на плячката за всяко ниво разлика'],
      ['pvp.minStealMultiplier', 'плячка: най-малко ×'],
      ['pvp.maxStealMultiplier', 'плячка: най-много ×'],
    ],
  },
  {
    title: 'Кланови войни',
    items: [
      ['clanWar.minMembersToParticipate', 'мин. членове на клан'],
      ['clanWar.maxDurationHours', 'макс. продължителност (часове)'],
      ['clanWar.rematchCooldownDays', 'дни до нова война със същия клан'],
      ['clanWar.poolMultiplier', 'размер на пула ×', 'HP на членовете без екипировка × това'],
      ['clanWar.targetProtectionMinutes', 'минути защита на нападнатия'],
      ['clanWar.attackCooldownMinutes', 'минути между две нападения на същия играч'],
      ['clanWar.conquestTreasuryStealPercentage', 'победа с разбиване: % от хазната на загубилия'],
      ['clanWar.decisionTreasuryStealPercentage', 'победа по точки: % от хазната на загубилия'],
    ],
  },
  {
    title: 'Ядрото',
    items: [
      ['core.attackCostEnergy', 'енергия за нападение'],
      ['core.attackCooldownSeconds', 'секунди между две нападения'],
      ['core.attack', 'атака на Ядрото'],
      ['core.defense', 'защита на Ядрото'],
      ['core.maxRounds', 'макс. рундове'],
    ],
  },
  {
    title: 'Борса',
    items: [
      ['exchange.metalPerCrystal', 'метал за 1 кристал (при равен курс)'],
      ['exchange.baseRateFactor', 'курс на ниво 0 %', 'от равния курс'],
      ['exchange.rateFactorPerLevel', 'подобрение на курса на ниво %'],
      ['exchange.creditsPer100', 'такса: кредити на 100 ресурса'],
    ],
  },
  {
    title: 'VIP',
    items: [
      ['vip.multiAttackCount', '„Атака ×N“: N'],
      ['vip.maxEnergyBonus', '+ макс. енергия'],
    ],
  },
];

const TECHNICAL_GROUPS: { title: string; items: [string, string, string?][] }[] = [
  {
    title: 'Вход',
    items: [
      ['loginLimits.maxFailures', 'грешни опити до блокиране', 'за акаунт или за адрес'],
      ['loginLimits.windowMinutes', 'минути блокиране'],
      ['loginLimits.adminMaxFailures', 'godmaster: грешни опити до блокиране'],
    ],
  },
  {
    title: 'Имейли',
    items: [
      ['email.verifyTokenHours', 'часове валидност на линка за потвърждение'],
      ['email.resetTokenMinutes', 'минути валидност на линка за нова парола'],
      ['email.maxPerHour', 'имейли от един вид на играч на час'],
    ],
  },
  {
    title: '„Пиши на екипа“',
    items: [
      ['support.maxNewPerDay', 'нови разговори на ден'],
      ['support.maxOpen', 'отворени разговори наведнъж'],
      ['support.maxUnansweredMessages', 'съобщения подред без отговор'],
    ],
  },
  {
    title: 'Сигнали за нарушения',
    items: [
      ['moderation.reportsPerDay', 'сигнала на ден'],
      ['moderation.secondsBetweenReports', 'секунди между два сигнала'],
      ['moderation.minAccountAgeDays', 'може да сигнализира след … дни', 'или от ниво долу'],
      ['moderation.minLevel', 'или от ниво'],
      ['moderation.reputationWindow', 'репутация: последните … решени сигнала'],
      ['moderation.maxDismissedInWindow', 'репутация: отхвърлени, след които се спира'],
      ['moderation.suspensionDays', 'дни спиране на сигналите'],
    ],
  },
  {
    title: 'Чат и онлайн',
    items: [
      ['presence.onlineThresholdMinutes', '„онлайн“ до … минути след последното действие'],
      ['presence.activityUpdateThrottleSeconds', 'секунди между два записа на активност'],
      ['clanChat.minSecondsBetweenMessages', 'кланов чат: секунди между съобщения'],
      ['clanChat.historyLimit', 'кланов чат: показани съобщения'],
      ['directMessages.minSecondsBetweenMessages', 'лични съобщения: секунди между съобщения'],
      ['directMessages.historyLimit', 'лични съобщения: показани съобщения'],
    ],
  },
  {
    title: 'Класиране на Ядрото',
    items: [
      ['core.standingsTopN', 'кланове в класирането'],
      ['core.playerRankingPageSize', 'играчи на страница'],
    ],
  },
];

function OtherBalancePanel() {
  return (
    <OverridesPanel
      endpoint="/admin/balance/other"
      title="Други стойности"
      groups={OTHER_GROUPS}
      intro="Единичните числа на играта, които не са в другите страници. Стойностите на опциите на предметите (+2% щета и т.н.) ще дойдат тук, когато текстовете им започнат да показват числото от сървъра."
    />
  );
}

function TechnicalSettingsPanel() {
  return (
    <OverridesPanel
      endpoint="/admin/balance/technical"
      title="Технически настройки"
      groups={TECHNICAL_GROUPS}
      intro="Лимити срещу злоупотреби и технически числа — не са баланс. Дължините на съобщенията не са тук: те са зададени и в полетата на играта. Промяната на лимита за вход не изчиства вече броените опити."
    />
  );
}

function OverridesPanel({
  endpoint,
  title,
  intro,
  groups,
}: {
  endpoint: string;
  title: string;
  intro: string;
  groups: { title: string; items: [string, string, string?][] }[];
}) {
  const [data, setData] = useState<AdminOtherBalanceDto | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    adminFetch<AdminOtherBalanceDto>(endpoint)
      .then((res) => {
        setData(res);
        setValues(Object.fromEntries(res.values.map((v) => [v.path, v.value])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [endpoint]);

  if (!data) {
    return (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : <p className="mt-2 text-xs text-textFaint">Зареждане…</p>}
      </section>
    );
  }

  const byPath = new Map(data.values.map((v) => [v.path, v]));
  const dirty = data.values.some((v) => values[v.path] !== v.value);
  // Percent values are fractions in the API, shown as %.
  const shown = (path: string, v: number) => (byPath.get(path)?.kind === 'percent' ? Math.round(v * 1_000_000) / 10_000 : v);
  const stored = (path: string, v: number) => (byPath.get(path)?.kind === 'percent' ? v / 100 : v);

  async function save() {
    if (!window.confirm('Да запиша ли промените? Важат веднага за всички играчи.')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<AdminOtherBalanceDto>(endpoint, { method: 'PUT', body: { values } });
      setData(res);
      setValues(Object.fromEntries(res.values.map((v) => [v.path, v.value])));
      setMessage('Записано и приложено.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-panelBorder bg-panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex gap-2">
          <button type="button" disabled={busy || !dirty} onClick={save} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
            Запази и приложи
          </button>
          <button type="button" disabled={busy || !dirty} onClick={load} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover disabled:opacity-50">
            Отказ
          </button>
        </div>
      </div>
      <p className="mb-3 text-[11px] text-textFaint">
        {intro} Промяната важи веднага, без рестарт. В злато са стойностите, различни от тези по подразбиране; „↺“ връща стойността по подразбиране.
      </p>
      {dirty && <p className="mb-2 text-[11px] text-vipGold">Има незаписани промени.</p>}
      {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
      {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.title} className="rounded-md border border-wellBorder p-3">
            <p className="mb-2 text-xs font-semibold">{group.title}</p>
            <div className="flex flex-col gap-2">
              {group.items
                .filter(([path]) => byPath.has(path))
                .map(([path, label, hint]) => {
                  const def = byPath.get(path)!;
                  const value = values[path];
                  const changed = value !== def.default;
                  return (
                    <div key={path} className="flex items-center justify-between gap-2">
                      <div className="text-[11px]">
                        <span className={changed ? 'text-vipGold' : ''}>{label}</span>
                        {hint && <div className="text-[10px] text-textFaint">{hint}</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {def.oneOf ? (
                          <select
                            value={value}
                            onChange={(e) => setValues((v) => ({ ...v, [path]: Number(e.target.value) }))}
                            className="w-24 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent"
                          >
                            {def.oneOf.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="number"
                            step="any"
                            value={shown(path, value)}
                            onChange={(e) => setValues((v) => ({ ...v, [path]: stored(path, Number(e.target.value)) }))}
                            className="w-24 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent"
                          />
                        )}
                        <button
                          type="button"
                          title={`по подразбиране: ${gmNumber(shown(path, def.default))}`}
                          disabled={!changed}
                          onClick={() => setValues((v) => ({ ...v, [path]: def.default }))}
                          className="rounded-md border border-panelBorder px-1.5 py-1 text-[11px] hover:bg-accentBgHover disabled:opacity-30"
                        >
                          ↺
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** A godmaster label from the game's texts, with {count}/{set} filled in. */
function fillMessage(key: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), resolveMessageKey(key));
}

function RewardBalancePanel() {
  const [data, setData] = useState<AdminRewardBalanceDto | null>(null);
  const [config, setConfig] = useState<RewardBalanceConfigDto | null>(null);
  const [view, setView] = useState<'daily' | 'achievements' | 'levels'>('daily');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    adminFetch<AdminRewardBalanceDto>('/admin/balance/rewards')
      .then((res) => {
        setData(res);
        setConfig(res.config);
        setDirty(false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Грешка'));
  }
  useEffect(load, []);

  async function send(method: 'POST' | 'PUT') {
    if (!config) return;
    if (method === 'PUT' && !window.confirm('Да запиша ли наградите? Важат веднага за всички играчи.')) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch<AdminRewardBalanceDto>(method === 'PUT' ? '/admin/balance/rewards' : '/admin/balance/rewards/preview', { method, body: { config } });
      setData(res);
      if (method === 'PUT') {
        setConfig(res.config);
        setDirty(false);
        setMessage('Записано и приложено.');
      } else {
        setMessage('Прегледът е обновен — нищо не е записано.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  if (!data || !config) {
    return (
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h2 className="text-sm font-semibold">Награди</h2>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : <p className="mt-2 text-xs text-textFaint">Зареждане…</p>}
      </section>
    );
  }

  const num = 'w-20 rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent';
  const select = 'max-w-[13rem] rounded-md border border-wellBorder bg-well px-2 py-1 text-xs outline-none focus:border-accent';
  const update = (fn: (c: RewardBalanceConfigDto) => void) => {
    const next = structuredClone(config);
    fn(next);
    setConfig(next);
    setDirty(true);
  };
  const input = (value: number, onChange: (v: number) => void) => (
    <input type="number" step="any" value={value} onChange={(e) => onChange(Number(e.target.value))} className={num} />
  );
  const itemSelect = (value: string | null, onChange: (v: string | null) => void, allowNone: boolean) => (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={select}>
      {allowNone && <option value="">— без предмет —</option>}
      {data.items.map((i) => (
        <option key={i.key} value={i.key}>
          {resolveMessageKey(i.nameKey)}
        </option>
      ))}
    </select>
  );
  const cell = (next: number, current: number | undefined) => (
    <span className={current !== undefined && current !== next ? 'text-vipGold' : ''}>
      {gmNumber(next)}
      {current !== undefined && current !== next && <span className="text-textFaint"> ({gmNumber(current)})</span>}
    </span>
  );

  return (
    <>
      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Награди</h2>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => send('POST')} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Преглед
            </button>
            <button type="button" disabled={busy || !dirty} onClick={() => send('PUT')} className="rounded-md border border-accent bg-accentBg px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
              Запази и приложи
            </button>
            <button type="button" disabled={busy || !dirty} onClick={load} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs text-textMuted hover:bg-accentBgHover disabled:opacity-50">
              Отказ
            </button>
          </div>
        </div>
        <p className="mb-3 text-[11px] text-textFaint">
          Само числата и предметите на съществуващите мисии, постижения и награди за ниво; добавяне и махане засега се прави в кода. Промяната важи
          веднага. „Запази“ записва и трите страници.
        </p>
        {dirty && <p className="mb-2 text-[11px] text-vipGold">Има незаписани промени.</p>}
        {message && <p className="mb-2 text-[11px] text-positive">{message}</p>}
        {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['daily', 'Дневни мисии'],
              ['achievements', 'Постижения'],
              ['levels', 'Награди за ниво'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`rounded-md border px-3 py-1 text-[11px] ${view === key ? 'border-accent bg-accentBg' : 'border-panelBorder text-textMuted hover:bg-accentBgHover'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {view === 'daily' && (
        <section className="rounded-lg border border-panelBorder bg-panel p-4">
          <h3 className="mb-1 text-xs font-semibold">Дневни мисии</h3>
          <p className="mb-2 text-[11px] text-textFaint">Наградата е „на ниво“ — умножава се по нивото на играча. Енергията е фиксирана.</p>
          <div className="max-w-full overflow-x-auto">
            <table className={GRID_TABLE}>
              <thead className="text-[10px] uppercase text-textFaint">
                <tr>
                  <th>мисия</th>
                  <th>цел</th>
                  <th>метал / ниво</th>
                  <th>кристал / ниво</th>
                  <th>опит / ниво</th>
                  <th>енергия</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(config.dailyTasks.tasks).map(([key, task]) => {
                  const info = data.taskInfo[key];
                  const set = (fn: (t: RewardBalanceConfigDto['dailyTasks']['tasks'][string]) => void) => update((c) => fn(c.dailyTasks.tasks[key]));
                  return (
                    <tr key={key}>
                      <td>
                        {info ? fillMessage(`dailyTasks.types.${info.type}`, { count: task.target }) : key}
                        {info?.chain && <div className="text-[10px] text-textFaint">верига „{info.chain}“ — показват се една след друга</div>}
                      </td>
                      <td>{input(task.target, (v) => set((t) => (t.target = v)))}</td>
                      <td>{input(task.reward.metalPerLevel, (v) => set((t) => (t.reward.metalPerLevel = v)))}</td>
                      <td>{input(task.reward.crystalPerLevel, (v) => set((t) => (t.reward.crystalPerLevel = v)))}</td>
                      <td>{input(task.reward.xpPerLevel, (v) => set((t) => (t.reward.xpPerLevel = v)))}</td>
                      <td>{input(task.reward.energy, (v) => set((t) => (t.reward.energy = v)))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] text-textFaint">
              бонус за всичко изпълнено
              {itemSelect(config.dailyTasks.allDoneBonusItemKey, (v) => update((c) => (c.dailyTasks.allDoneBonusItemKey = v ?? c.dailyTasks.allDoneBonusItemKey)), false)}
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-textFaint">
              серия: дни
              {input(config.dailyTasks.streak.days, (v) => update((c) => (c.dailyTasks.streak.days = v)))}
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-textFaint">
              серия: позволени пропуски
              {input(config.dailyTasks.streak.allowedMisses, (v) => update((c) => (c.dailyTasks.streak.allowedMisses = v)))}
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-textFaint">
              серия: награда
              {itemSelect(config.dailyTasks.streak.rewardItemKey, (v) => update((c) => (c.dailyTasks.streak.rewardItemKey = v ?? c.dailyTasks.streak.rewardItemKey)), false)}
            </label>
          </div>
        </section>
      )}

      {view === 'achievements' && (
        <section className="rounded-lg border border-panelBorder bg-panel p-4">
          <h3 className="mb-1 text-xs font-semibold">Постижения</h3>
          <p className="mb-2 text-[11px] text-textFaint">Всяко постижение е верига от нива; наградите са фиксирани (не растат с нивото на играча).</p>
          <div className="flex flex-col gap-3">
            {Object.entries(config.achievements).map(([key, tiers]) => {
              const fullSet = data.achievementMetrics[key] === 'FULL_SET';
              return (
                <div key={key} className="rounded-md border border-wellBorder p-2">
                  <p className="mb-1 text-[11px] font-semibold">{fillMessage(`achievements.items.${key}`, { count: 'N', set: '…' })}</p>
                  <div className="max-w-full overflow-x-auto">
                    <table className={GRID_TABLE}>
                      <thead className="text-[10px] uppercase text-textFaint">
                        <tr>
                          <th>ниво</th>
                          <th>цел (N)</th>
                          <th>метал</th>
                          <th>кристал</th>
                          <th>предмет</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tiers.map((tier, index) => {
                          const set = (fn: (t: RewardBalanceConfigDto['achievements'][string][number]) => void) => update((c) => fn(c.achievements[key][index]));
                          return (
                            <tr key={index}>
                              <td>{index + 1}</td>
                              <td>{fullSet ? <span className="text-textFaint">7 слота</span> : input(tier.target, (v) => set((t) => (t.target = v)))}</td>
                              <td>{input(tier.reward.metal, (v) => set((t) => (t.reward.metal = v)))}</td>
                              <td>{input(tier.reward.crystal, (v) => set((t) => (t.reward.crystal = v)))}</td>
                              <td>{itemSelect(tier.reward.itemKey, (v) => set((t) => (t.reward.itemKey = v)), true)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {view === 'levels' && (
        <section className="rounded-lg border border-panelBorder bg-panel p-4">
          <h3 className="mb-1 text-xs font-semibold">Награди за ниво</h3>
          <p className="mb-2 text-[11px] text-textFaint">
            При достигане на ниво L: метал и кристал × L. На всеки N нива и кутия — от реда, в чийто обхват е нивото.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] text-textFaint">
              метал × ниво
              {input(config.levelRewards.metalPerLevel, (v) => update((c) => (c.levelRewards.metalPerLevel = v)))}
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-textFaint">
              кристал × ниво
              {input(config.levelRewards.crystalPerLevel, (v) => update((c) => (c.levelRewards.crystalPerLevel = v)))}
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-textFaint">
              кутия на всеки … нива
              {input(config.levelRewards.boxEveryLevels, (v) => update((c) => (c.levelRewards.boxEveryLevels = v)))}
            </label>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {config.levelRewards.boxes.map((box, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2 text-[11px] text-textFaint">
                <label className="flex flex-col gap-1">
                  до ниво
                  {input(box.upToLevel, (v) => update((c) => (c.levelRewards.boxes[index].upToLevel = v)))}
                </label>
                {itemSelect(box.itemKey, (v) => update((c) => (c.levelRewards.boxes[index].itemKey = v ?? c.levelRewards.boxes[index].itemKey)), false)}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-panelBorder bg-panel p-4">
        <h3 className="mb-1 text-xs font-semibold">Колко струват наградите</h3>
        <p className="mb-2 text-[11px] text-textFaint">
          Всички дневни мисии за един ден и една награда за ниво, на няколко нива на играча — и колко битки с Пентил на това ниво дават същото (метал и
          опит по кривите от „Пентили“). В цвят са промените, които „Преглед“ показва, със сегашните в скоби.
        </p>
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>ниво</th>
                <th>мисии: метал</th>
                <th>= битки</th>
                <th>мисии: опит</th>
                <th>= битки</th>
                <th>за ниво: метал</th>
                <th>= битки</th>
              </tr>
            </thead>
            <tbody>
              {data.levels.map((row) => {
                const c = data.currentLevels?.find((r) => r.level === row.level);
                return (
                  <tr key={row.level}>
                    <td>{row.level}</td>
                    <td className="tabular-nums">{cell(row.dailyMetal, c?.dailyMetal)}</td>
                    <td className="tabular-nums">{cell(row.dailyMetalFights, c?.dailyMetalFights)}</td>
                    <td className="tabular-nums">{cell(row.dailyXp, c?.dailyXp)}</td>
                    <td className="tabular-nums">{cell(row.dailyXpFights, c?.dailyXpFights)}</td>
                    <td className="tabular-nums">{cell(row.levelMetal, c?.levelMetal)}</td>
                    <td className="tabular-nums">{cell(row.levelMetalFights, c?.levelMetalFights)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const LOGIN_KINDS: Record<string, string> = { LOGIN: 'вход', REGISTER: 'регистрация', REFRESH: 'продължена сесия' };
const DEVICE_LABELS: Record<string, string> = { DESKTOP: 'компютър', MOBILE: 'телефон', TABLET: 'таблет' };

/** Login records, loaded only on request — each look is written to the action log. */
function PlayerLoginsControls({ playerId, onOpenPlayer }: { playerId: string; onOpenPlayer: (username: string) => void }) {
  const [data, setData] = useState<AdminPlayerLoginsDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setData(await adminFetch<AdminPlayerLoginsDto>(`/admin/players/${playerId}/logins`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={load} className="rounded-md border border-panelBorder px-3 py-1.5 text-xs hover:bg-accentBgHover disabled:opacity-50">
          Покажи входовете
        </button>
        <span className="text-[11px] text-textFaint">Записва се в дневника на действията.</span>
        {error && <span className="text-[11px] text-danger">{error}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-wellBorder p-3">
      <p className="mb-1 text-xs font-semibold">Входове (пазят се {data.retentionDays} дни)</p>
      <p className="mb-2 text-[11px] text-textFaint">
        Общ IP адрес е само подсказка: домакинства, офиси и мобилни оператори често споделят един адрес. Не е доказателство за мулти-акаунт.
      </p>
      {data.sharedAccounts.length > 0 ? (
        <div className="mb-3">
          <p className="mb-1 text-[11px] font-medium text-vipGold">Други акаунти от същите адреси ({data.sharedAccounts.length})</p>
          <div className="flex flex-col gap-1">
            {data.sharedAccounts.map((a) => (
              <div key={a.playerId} className="flex flex-wrap items-center gap-2 text-[11px]">
                <button type="button" onClick={() => onOpenPlayer(a.username)} className="text-accent underline">
                  {a.username}
                </button>
                {a.banned && <span className="text-danger">наказан</span>}
                <span className="text-textFaint">
                  {a.sharedIps.length} общ{a.sharedIps.length === 1 ? '' : 'и'} адрес{a.sharedIps.length === 1 ? '' : 'а'}: {a.sharedIps.join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mb-3 text-[11px] text-textFaint">Няма други акаунти от същите адреси.</p>
      )}
      {data.events.length === 0 ? (
        <p className="text-[11px] text-textFaint">Няма записани входове.</p>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <table className={GRID_TABLE}>
            <thead className="text-[10px] uppercase text-textFaint">
              <tr>
                <th>кога</th>
                <th>какво</th>
                <th>IP</th>
                <th>държава</th>
                <th>устройство</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap">{new Date(e.createdAt).toLocaleString('bg-BG')}</td>
                  <td>{LOGIN_KINDS[e.kind] ?? e.kind}</td>
                  <td className="tabular-nums">{e.ip}</td>
                  <td>{e.country ?? '—'}</td>
                  <td>
                    {e.device ? (DEVICE_LABELS[e.device] ?? e.device) : '—'}
                    {e.browser ? `, ${e.browser}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
