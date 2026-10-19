-- Initial schema: staff users + foot-check bookings. Hand-written to match
-- what `prisma migrate diff` emits for prisma/schema.prisma; applied and
-- exercised against PostgreSQL 16.

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('STAFF', 'ADMIN');

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'ARRIVED', 'CHECKING', 'DONE', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('WEB', 'PHONE', 'WALKIN');

-- CreateEnum
CREATE TYPE "BookingCustomerType" AS ENUM ('NEW', 'RETURNING');

-- CreateEnum
CREATE TYPE "BookingPurpose" AS ENUM ('REGULAR_RESCAN', 'EARLY_CHECK', 'WEAR_CONSULT');

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientBookingId" TEXT,
    "storeCode" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "source" "BookingSource" NOT NULL DEFAULT 'WEB',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneDigits" TEXT NOT NULL,
    "partyType" TEXT NOT NULL DEFAULT 'self',
    "lang" TEXT NOT NULL DEFAULT 'ko',
    "pageLang" TEXT,
    "contactMethod" TEXT NOT NULL DEFAULT 'sms',
    "contactConsent" BOOLEAN NOT NULL DEFAULT false,
    "customerType" "BookingCustomerType" NOT NULL DEFAULT 'NEW',
    "lastScanMonth" TEXT,
    "nextRescanMonth" TEXT,
    "purpose" "BookingPurpose",
    "wearingModel" TEXT,
    "healthConsent" BOOLEAN NOT NULL DEFAULT false,
    "healthConsentAt" TIMESTAMP(3),
    "selfCheck" JSONB,
    "medicalReferralFlag" BOOLEAN NOT NULL DEFAULT false,
    "staffNotes" TEXT,
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_code_key" ON "Booking"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_clientBookingId_key" ON "Booking"("clientBookingId");

-- CreateIndex
CREATE INDEX "Booking_storeCode_date_idx" ON "Booking"("storeCode", "date");

-- CreateIndex
CREATE INDEX "Booking_phoneDigits_idx" ON "Booking"("phoneDigits");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");
