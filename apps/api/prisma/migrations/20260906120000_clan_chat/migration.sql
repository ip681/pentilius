-- Clan chat: plain-text messages scoped to a clan. Purely additive — no
-- existing data is touched.
CREATE TABLE "clan_messages" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "clan_messages_clanId_createdAt_idx" ON "clan_messages"("clanId", "createdAt");

ALTER TABLE "clan_messages" ADD CONSTRAINT "clan_messages_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clan_messages" ADD CONSTRAINT "clan_messages_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
