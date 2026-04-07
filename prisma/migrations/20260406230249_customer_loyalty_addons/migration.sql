/*
  Warnings:

  - Added the required column `baseAmountCents` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerId` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ticketNumber` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "Customer" ("id", "firstName", "lastName", "phone", "email", "isActive", "createdAt", "updatedAt")
VALUES ('legacy-customer', 'Cliente', 'Mostrador', 'LEGACY-UNASSIGNED', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "businessName" TEXT NOT NULL DEFAULT 'La Burbuja',
    "timezone" TEXT NOT NULL DEFAULT 'America/Monterrey',
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "serialPortPath" TEXT NOT NULL DEFAULT 'COM3',
    "serialBaudRate" INTEGER NOT NULL DEFAULT 9600,
    "relayMockMode" BOOLEAN NOT NULL DEFAULT true,
    "relayConnected" BOOLEAN NOT NULL DEFAULT false,
    "selfServiceWashPriceCents" INTEGER NOT NULL DEFAULT 4500,
    "selfServiceDryPriceCents" INTEGER NOT NULL DEFAULT 4500,
    "selfServiceCycleMinutes" INTEGER NOT NULL DEFAULT 50,
    "encargoPricePerKgCents" INTEGER NOT NULL DEFAULT 3300,
    "encargoMinimumChargeCents" INTEGER NOT NULL DEFAULT 12000,
    "xlEdredonIndividualCents" INTEGER NOT NULL DEFAULT 15000,
    "xlEdredonMatrimonialCents" INTEGER NOT NULL DEFAULT 18000,
    "xlEdredonKingCents" INTEGER NOT NULL DEFAULT 20000,
    "xlCobijaGruesaCents" INTEGER NOT NULL DEFAULT 12000,
    "xlAlmohadaParCents" INTEGER NOT NULL DEFAULT 8000,
    "dryCleaningMinimumCents" INTEGER NOT NULL DEFAULT 15000,
    "dryCleaningUrgentSurchargePct" INTEGER NOT NULL DEFAULT 50,
    "detergentAddonCents" INTEGER NOT NULL DEFAULT 500,
    "softenerAddonCents" INTEGER NOT NULL DEFAULT 500,
    "bleachAddonCents" INTEGER NOT NULL DEFAULT 500,
    "loyaltyEveryNTransactions" INTEGER NOT NULL DEFAULT 10,
    "loyaltyDiscountPct" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppConfig" ("businessName", "currency", "dryCleaningMinimumCents", "dryCleaningUrgentSurchargePct", "encargoMinimumChargeCents", "encargoPricePerKgCents", "id", "relayConnected", "relayMockMode", "selfServiceCycleMinutes", "selfServiceDryPriceCents", "selfServiceWashPriceCents", "serialBaudRate", "serialPortPath", "timezone", "updatedAt", "xlAlmohadaParCents", "xlCobijaGruesaCents", "xlEdredonIndividualCents", "xlEdredonKingCents", "xlEdredonMatrimonialCents") SELECT "businessName", "currency", "dryCleaningMinimumCents", "dryCleaningUrgentSurchargePct", "encargoMinimumChargeCents", "encargoPricePerKgCents", "id", "relayConnected", "relayMockMode", "selfServiceCycleMinutes", "selfServiceDryPriceCents", "selfServiceWashPriceCents", "serialBaudRate", "serialPortPath", "timezone", "updatedAt", "xlAlmohadaParCents", "xlCobijaGruesaCents", "xlEdredonIndividualCents", "xlEdredonKingCents", "xlEdredonMatrimonialCents" FROM "AppConfig";
DROP TABLE "AppConfig";
ALTER TABLE "new_AppConfig" RENAME TO "AppConfig";
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketNumber" INTEGER NOT NULL,
    "machineId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "baseAmountCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "loyaltyDiscountApplied" BOOLEAN NOT NULL DEFAULT false,
    "addonDetergentQty" INTEGER NOT NULL DEFAULT 0,
    "addonSoftenerQty" INTEGER NOT NULL DEFAULT 0,
    "addonBleachQty" INTEGER NOT NULL DEFAULT 0,
    "addonAmountCents" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "expectedEndAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_relay',
    "endedAt" DATETIME,
    "relayOnAttemptedAt" DATETIME,
    "relayTurnedOnAt" DATETIME,
    "relayOffAttemptedAt" DATETIME,
    "relayTurnedOffAt" DATETIME,
    "relayFailureReason" TEXT,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" (
    "id",
    "ticketNumber",
    "machineId",
    "employeeId",
    "customerId",
    "baseAmountCents",
    "discountCents",
    "loyaltyDiscountApplied",
    "addonDetergentQty",
    "addonSoftenerQty",
    "addonBleachQty",
    "addonAmountCents",
    "amountCents",
    "paymentMethod",
    "startedAt",
    "expectedEndAt",
    "status",
    "endedAt",
    "relayOnAttemptedAt",
    "relayTurnedOnAt",
    "relayOffAttemptedAt",
    "relayTurnedOffAt",
    "relayFailureReason",
    "voidReason",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS "ticketNumber",
    "machineId",
    "employeeId",
    'legacy-customer' AS "customerId",
    "amountCents" AS "baseAmountCents",
    0 AS "discountCents",
    false AS "loyaltyDiscountApplied",
    0 AS "addonDetergentQty",
    0 AS "addonSoftenerQty",
    0 AS "addonBleachQty",
    0 AS "addonAmountCents",
    "amountCents",
    "paymentMethod",
    "startedAt",
    "expectedEndAt",
    "status",
    "endedAt",
    "relayOnAttemptedAt",
    "relayTurnedOnAt",
    "relayOffAttemptedAt",
    "relayTurnedOffAt",
    "relayFailureReason",
    "voidReason",
    "createdAt",
    "updatedAt"
FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_ticketNumber_key" ON "Transaction"("ticketNumber");
CREATE INDEX "Transaction_expectedEndAt_idx" ON "Transaction"("expectedEndAt");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_customerId_idx" ON "Transaction"("customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_lastName_firstName_idx" ON "Customer"("lastName", "firstName");
