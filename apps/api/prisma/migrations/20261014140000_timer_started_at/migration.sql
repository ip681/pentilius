-- Start times for progress bars (2026-10-14).
ALTER TABLE "player_buildings" ADD COLUMN "constructionStartedAt" TIMESTAMP(3);
ALTER TABLE "player_researches" ADD COLUMN "researchStartedAt" TIMESTAMP(3);
