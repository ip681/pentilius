-- CreateEnum
CREATE TYPE "ClanWarStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ClanWarOutcome" AS ENUM ('CONQUEST', 'DECISION', 'DRAW');

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "clanWarProtectedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "clan_wars" (
    "id" TEXT NOT NULL,
    "attackerClanId" TEXT NOT NULL,
    "defenderClanId" TEXT NOT NULL,
    "status" "ClanWarStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "attackerPoolMax" INTEGER NOT NULL,
    "attackerPoolRemaining" INTEGER NOT NULL,
    "defenderPoolMax" INTEGER NOT NULL,
    "defenderPoolRemaining" INTEGER NOT NULL,
    "outcome" "ClanWarOutcome",
    "winnerClanId" TEXT,

    CONSTRAINT "clan_wars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_war_attacks" (
    "id" TEXT NOT NULL,
    "clanWarId" TEXT NOT NULL,
    "attackerId" TEXT NOT NULL,
    "defenderId" TEXT NOT NULL,
    "outcome" "BattleOutcome" NOT NULL,
    "rounds" JSONB NOT NULL,
    "attackerMaxHp" INTEGER NOT NULL,
    "defenderMaxHp" INTEGER NOT NULL,
    "damageDealt" INTEGER NOT NULL,
    "damageTaken" INTEGER NOT NULL,
    "lootSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_war_attacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clan_wars_attackerClanId_status_idx" ON "clan_wars"("attackerClanId", "status");

-- CreateIndex
CREATE INDEX "clan_wars_defenderClanId_status_idx" ON "clan_wars"("defenderClanId", "status");

-- CreateIndex
CREATE INDEX "clan_war_attacks_clanWarId_idx" ON "clan_war_attacks"("clanWarId");

-- CreateIndex
CREATE INDEX "clan_war_attacks_attackerId_defenderId_createdAt_idx" ON "clan_war_attacks"("attackerId", "defenderId", "createdAt");

-- AddForeignKey
ALTER TABLE "clan_wars" ADD CONSTRAINT "clan_wars_attackerClanId_fkey" FOREIGN KEY ("attackerClanId") REFERENCES "clans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_wars" ADD CONSTRAINT "clan_wars_defenderClanId_fkey" FOREIGN KEY ("defenderClanId") REFERENCES "clans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_war_attacks" ADD CONSTRAINT "clan_war_attacks_clanWarId_fkey" FOREIGN KEY ("clanWarId") REFERENCES "clan_wars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_war_attacks" ADD CONSTRAINT "clan_war_attacks_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_war_attacks" ADD CONSTRAINT "clan_war_attacks_defenderId_fkey" FOREIGN KEY ("defenderId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
