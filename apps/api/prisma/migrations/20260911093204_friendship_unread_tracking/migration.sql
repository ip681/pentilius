-- AlterTable
ALTER TABLE "friendships" ADD COLUMN     "addresseeLastReadAt" TIMESTAMP(3),
ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "requesterLastReadAt" TIMESTAMP(3);
