import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { PlayerProfileDto } from '@pentilius/shared';
import { getProfile } from './api';
import { clearTokens, loadTokens } from './auth-storage';
import { setLocale } from './i18n';

interface Session {
  ready: boolean;
  profile: PlayerProfileDto | null;
  refresh: () => Promise<void>;
  signedIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

/** Who is logged in, loaded once at start and refreshed by the screens. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await getProfile();
      setLocale(me.preferredLocale);
      setProfile(me);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (await loadTokens()) await refresh();
      setReady(true);
    })();
  }, [refresh]);

  const logout = useCallback(async () => {
    await clearTokens();
    setProfile(null);
  }, []);

  return <SessionContext.Provider value={{ ready, profile, refresh, signedIn: refresh, logout }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
}
