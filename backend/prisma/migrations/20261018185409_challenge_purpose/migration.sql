-- CreateEnum
CREATE TYPE "ChallengePurpose" AS ENUM ('LOGIN', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "LoginChallenge" ADD COLUMN     "purpose" "ChallengePurpose" NOT NULL DEFAULT 'LOGIN';
