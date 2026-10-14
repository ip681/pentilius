import { HttpException, HttpStatus } from '@nestjs/common';
import { GAME_BALANCE } from '../config/game-config';

/**
 * Failed-login limit (owner decision, 2026-10-14): after too many wrong
 * attempts on one account, or from one address, further tries are refused
 * for a while. Usernames are public (rankings), so without this anyone could
 * keep guessing passwords. Kept in memory: there is one API instance, and a
 * restart only clears the counters early, which is harmless. Players and
 * godmaster are counted separately; godmaster allows fewer attempts.
 */
type Entry = { failures: number; windowStart: number };
export type LoginScope = 'player' | 'admin';

function maxFailures(scope: LoginScope): number {
  return scope === 'admin' ? GAME_BALANCE.loginLimits.adminMaxFailures : GAME_BALANCE.loginLimits.maxFailures;
}

const entries = new Map<string, Entry>();

function windowMs(): number {
  return GAME_BALANCE.loginLimits.windowMinutes * 60_000;
}

function current(key: string, now: number): Entry | null {
  const entry = entries.get(key);
  if (!entry) return null;
  if (now - entry.windowStart >= windowMs()) {
    entries.delete(key);
    return null;
  }
  return entry;
}

function accountKey(scope: LoginScope, identifier: string): string {
  return `${scope}:account:${identifier.trim().toLowerCase()}`;
}

function keysFor(scope: LoginScope, identifier: string, ip: string | undefined): string[] {
  const keys = [accountKey(scope, identifier)];
  if (ip) keys.push(`${scope}:ip:${ip}`);
  return keys;
}

/** Throws 429 TOO_MANY_LOGIN_ATTEMPTS while the account or the address is blocked. */
export function assertLoginAllowed(identifier: string, ip: string | undefined, scope: LoginScope = 'player'): void {
  const now = Date.now();
  for (const key of keysFor(scope, identifier, ip)) {
    const entry = current(key, now);
    if (entry && entry.failures >= maxFailures(scope)) {
      const retryAfterSeconds = Math.ceil((entry.windowStart + windowMs() - now) / 1000);
      throw new HttpException({ statusCode: 429, message: 'TOO_MANY_LOGIN_ATTEMPTS', retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

export function recordLoginFailure(identifier: string, ip: string | undefined, scope: LoginScope = 'player'): void {
  const now = Date.now();
  // Drop stale entries now and then so the map can't grow without bound.
  if (entries.size > 10_000) {
    for (const [key, entry] of entries) if (now - entry.windowStart >= windowMs()) entries.delete(key);
  }
  for (const key of keysFor(scope, identifier, ip)) {
    const entry = current(key, now);
    if (entry) entry.failures += 1;
    else entries.set(key, { failures: 1, windowStart: now });
  }
}

/** A correct password clears the account's counter (not the address's). */
export function recordLoginSuccess(identifier: string, scope: LoginScope = 'player'): void {
  entries.delete(accountKey(scope, identifier));
}
