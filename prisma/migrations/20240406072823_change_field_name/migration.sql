/*
  Warnings:

  - You are about to drop the column `curentQuestion` on the `GameSession` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GameSession" DROP COLUMN "curentQuestion",
ADD COLUMN     "currentQuestion" INTEGER NOT NULL DEFAULT 0;
