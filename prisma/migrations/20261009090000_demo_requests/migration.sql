-- CreateEnum
CREATE TYPE "DemoStatus" AS ENUM ('NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "DemoRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "city" TEXT,
    "outlets" INTEGER NOT NULL DEFAULT 1,
    "restaurantType" TEXT,
    "currentSystem" TEXT,
    "message" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" "DemoStatus" NOT NULL DEFAULT 'NEW',
    "meetingLink" TEXT,
    "adminNotes" TEXT,
    "assignedToId" TEXT,
    "restaurantId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'website',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoRequest_status_scheduledAt_idx" ON "DemoRequest"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "DemoRequest_scheduledAt_idx" ON "DemoRequest"("scheduledAt");

-- CreateIndex
CREATE INDEX "DemoRequest_email_idx" ON "DemoRequest"("email");

-- AddForeignKey
ALTER TABLE "DemoRequest" ADD CONSTRAINT "DemoRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoRequest" ADD CONSTRAINT "DemoRequest_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
