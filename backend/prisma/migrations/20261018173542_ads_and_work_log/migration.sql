-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('META', 'GOOGLE', 'YOUTUBE', 'LINKEDIN', 'X', 'OTHER');

-- CreateEnum
CREATE TYPE "AdCampaignType" AS ENUM ('POST_BOOST', 'REEL_BOOST', 'STORY_BOOST', 'ADS_MANAGER_CAMPAIGN', 'LEAD_GENERATION', 'SEARCH_ADS', 'DISPLAY_ADS', 'VIDEO_ADS', 'OTHER');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdSpendSource" AS ENUM ('CLIENT_ACCOUNT', 'AGENCY_PAID');

-- CreateEnum
CREATE TYPE "WorkTaskType" AS ENUM ('DESIGN', 'VIDEO_EDITING', 'CONTENT_WRITING', 'SOCIAL_MEDIA_MANAGEMENT', 'ADS_MANAGEMENT', 'PHOTOGRAPHY', 'STRATEGY', 'CLIENT_MEETING', 'REVISIONS', 'ADMIN', 'OTHER');

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "creativeId" TEXT,
    "name" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "campaignType" "AdCampaignType" NOT NULL,
    "objective" TEXT,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "budget" DECIMAL(14,2),
    "spend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidFrom" "AdSpendSource" NOT NULL DEFAULT 'CLIENT_ACCOUNT',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "results" INTEGER NOT NULL DEFAULT 0,
    "resultLabel" TEXT,
    "externalId" TEXT,
    "notes" TEXT,
    "managedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "clientId" TEXT,
    "workDate" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "taskType" "WorkTaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCampaign_clientId_startDate_idx" ON "AdCampaign"("clientId", "startDate");

-- CreateIndex
CREATE INDEX "AdCampaign_startDate_idx" ON "AdCampaign"("startDate");

-- CreateIndex
CREATE INDEX "WorkLog_employeeId_workDate_idx" ON "WorkLog"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "WorkLog_clientId_workDate_idx" ON "WorkLog"("clientId", "workDate");

-- CreateIndex
CREATE INDEX "WorkLog_workDate_idx" ON "WorkLog"("workDate");

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "CreativeAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_managedById_fkey" FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
