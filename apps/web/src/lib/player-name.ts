import { isDeletedPlayerName } from '@pentilius/shared';

type Translate = (key: string) => string;

/**
 * A player's display name — a deleted account's anonymized "~deleted~…"
 * marker becomes a translated "Deleted player" (owner decision, 2026-10-12).
 * Use it anywhere a username is shown without going through <PlayerLink>.
 */
export function displayPlayerName(t: Translate, username: string | null | undefined): string {
  if (isDeletedPlayerName(username)) return t('common.deletedPlayer');
  return username ?? '';
}
