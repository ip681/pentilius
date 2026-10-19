import { t } from './i18n';

// The shared package's DELETED_PLAYER_PREFIX — repeated here because the app
// only takes types from @pentilius/shared, never runtime code.
const DELETED_PLAYER_PREFIX = '~deleted~';

/** A player's display name; a deleted account becomes "Deleted player". */
export function displayPlayerName(username: string | null | undefined): string {
  if (username && username.startsWith(DELETED_PLAYER_PREFIX)) return t('common.deletedPlayer');
  return username ?? '';
}
