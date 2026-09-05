import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Milestone 0 establishes the seed mechanism only (`npm run db:seed`).
 * Static game definitions (zones, Pentili, items, loot tables) are seeded
 * here starting in Milestone 1, once those entities exist in the schema.
 */
async function main() {
  console.log('No static definitions to seed yet (Milestone 0).');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
