import { ClanEmblemChoiceDto, ClanEmblemDto, ClanEmblemOptionsDto } from '@pentilius/shared';
import { GAME_BALANCE } from '../config/game-config';

/**
 * Clan emblems (owner decision, 2026-10-21): a background shape and a symbol,
 * both white-on-transparent images the site tints with two palette colors.
 * The clan stores numbers and palette keys; this file turns them into asset ids
 * and colors, so the images can be replaced without touching the data.
 */
type EmblemFields = { emblemShape: number; emblemSymbol: number; emblemBgColor: string; emblemSymbolColor: string };

const pad = (n: number) => String(n).padStart(2, '0');
export const shapeAssetId = (n: number) => `clanShapes.clan_shape${pad(n)}`;
export const symbolAssetId = (n: number) => `clanSymbols.clan_symbol${pad(n)}`;

function colorHex(key: string): string {
  const palette = GAME_BALANCE.clanEmblem.palette;
  return (palette.find((c) => c.key === key) ?? palette[0]).hex;
}

export function toClanEmblemDto(clan: EmblemFields): ClanEmblemDto {
  return {
    shapeAssetId: shapeAssetId(clan.emblemShape),
    symbolAssetId: symbolAssetId(clan.emblemSymbol),
    backgroundColor: colorHex(clan.emblemBgColor),
    symbolColor: colorHex(clan.emblemSymbolColor),
    symbolScale: GAME_BALANCE.clanEmblem.symbolScale,
  };
}

export function toClanEmblemChoiceDto(clan: EmblemFields): ClanEmblemChoiceDto {
  return { shape: clan.emblemShape, symbol: clan.emblemSymbol, backgroundColor: clan.emblemBgColor, symbolColor: clan.emblemSymbolColor };
}

/** A random emblem with two different colors — every new clan starts with one. */
export function randomEmblem(): EmblemFields {
  const { shapeCount, symbolCount, palette } = GAME_BALANCE.clanEmblem;
  const pick = (n: number) => 1 + Math.floor(Math.random() * n);
  const bg = Math.floor(Math.random() * palette.length);
  const fg = (bg + 1 + Math.floor(Math.random() * (palette.length - 1))) % palette.length;
  return { emblemShape: pick(shapeCount), emblemSymbol: pick(symbolCount), emblemBgColor: palette[bg].key, emblemSymbolColor: palette[fg].key };
}

export function emblemOptions(): ClanEmblemOptionsDto {
  const { shapeCount, symbolCount, palette, symbolScale, changeCooldownDays } = GAME_BALANCE.clanEmblem;
  return {
    shapes: Array.from({ length: shapeCount }, (_, i) => ({ id: i + 1, assetId: shapeAssetId(i + 1) })),
    symbols: Array.from({ length: symbolCount }, (_, i) => ({ id: i + 1, assetId: symbolAssetId(i + 1) })),
    palette: palette.map((c) => ({ key: c.key, hex: c.hex })),
    symbolScale,
    changeCooldownDays,
  };
}

/** When the leader may change it again; null = now. Free for the first day of a new clan. */
export function emblemChangeAvailableAt(clan: { createdAt: Date; emblemChangedAt: Date | null }): Date | null {
  const { changeCooldownDays, freeChangeHours } = GAME_BALANCE.clanEmblem;
  if (!clan.emblemChangedAt || Date.now() - clan.createdAt.getTime() < freeChangeHours * 3600_000) return null;
  const next = new Date(clan.emblemChangedAt.getTime() + changeCooldownDays * 24 * 3600_000);
  return next.getTime() > Date.now() ? next : null;
}

/** The error code when the choice isn't a valid emblem, or null. */
export function emblemValidationError(choice: ClanEmblemChoiceDto): string | null {
  const { shapeCount, symbolCount, palette } = GAME_BALANCE.clanEmblem;
  const isInt = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
  if (!isInt(choice.shape, shapeCount) || !isInt(choice.symbol, symbolCount)) return 'EMBLEM_INVALID';
  const keys: string[] = palette.map((c) => c.key);
  if (!keys.includes(choice.backgroundColor) || !keys.includes(choice.symbolColor)) return 'EMBLEM_INVALID';
  if (choice.backgroundColor === choice.symbolColor) return 'EMBLEM_SAME_COLORS';
  return null;
}
