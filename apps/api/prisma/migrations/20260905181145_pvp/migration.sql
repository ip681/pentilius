-- AlterTable
ALTER TABLE "players" ADD COLUMN     "pvpProtectedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pvp_battle_reports" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "pvp_battle_reports_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pvp_battle_reports" ADD CONSTRAINT "pvp_battle_reports_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_battle_reports" ADD CONSTRAINT "pvp_battle_reports_defenderId_fkey" FOREIGN KEY ("defenderId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
