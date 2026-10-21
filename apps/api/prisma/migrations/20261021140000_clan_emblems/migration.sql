-- Clan emblems (owner decision, 2026-10-21).
ALTER TABLE "clans" ADD COLUMN "emblemShape" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "emblemSymbol" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "emblemBgColor" TEXT NOT NULL DEFAULT 'darkblue',
ADD COLUMN "emblemSymbolColor" TEXT NOT NULL DEFAULT 'gold',
ADD COLUMN "emblemChangedAt" TIMESTAMP(3);

-- Every existing clan starts with a random emblem: shape and symbol 1..18, two
-- different palette colors (same keys as GAME_BALANCE.clanEmblem.palette).
WITH palette AS (
  SELECT ARRAY['red','darkred','orange','gold','yellow','green','darkgreen','teal','lightblue','darkblue','purple','pink','white','grey','darkgrey','black'] AS keys
), picks AS (
  SELECT c."id",
         1 + floor(random() * 18)::int AS shape,
         1 + floor(random() * 18)::int AS symbol,
         floor(random() * 16)::int AS bg,
         1 + floor(random() * 15)::int AS shift
  FROM "clans" c
)
UPDATE "clans" c
SET "emblemShape" = p.shape,
    "emblemSymbol" = p.symbol,
    "emblemBgColor" = (SELECT keys[p.bg + 1] FROM palette),
    "emblemSymbolColor" = (SELECT keys[((p.bg + p.shift) % 16) + 1] FROM palette)
FROM picks p
WHERE c."id" = p."id";
