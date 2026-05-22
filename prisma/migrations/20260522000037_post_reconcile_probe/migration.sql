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
    "relayMockMode" BOOLEAN NOT NULL DEFAULT false,
    "relayConnected" BOOLEAN NOT NULL DEFAULT false,
    "washerNormalCycleMinutes" INTEGER NOT NULL DEFAULT 35,
    "washerXlCycleMinutes" INTEGER NOT NULL DEFAULT 45,
    "dryerNormalCycleMinutes" INTEGER NOT NULL DEFAULT 45,
    "dryerXlCycleMinutes" INTEGER NOT NULL DEFAULT 55,
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
    "downtimeThresholdMinutes" INTEGER NOT NULL DEFAULT 5,
    "voidSpikePercentThreshold" INTEGER NOT NULL DEFAULT 5,
    "voidSpikeAmountCents" INTEGER NOT NULL DEFAULT 50000,
    "cashVarianceApprovalThresholdCents" INTEGER NOT NULL DEFAULT 5000,
    "cashDrawerCapCents" INTEGER NOT NULL DEFAULT 200000,
    "cashDrawerSoftWarningPct" INTEGER NOT NULL DEFAULT 80,
    "cashDropResidualCents" INTEGER NOT NULL DEFAULT 50000,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppConfig" ("bleachAddonCents", "businessName", "cashDrawerCapCents", "cashDrawerSoftWarningPct", "cashDropResidualCents", "cashVarianceApprovalThresholdCents", "currency", "detergentAddonCents", "downtimeThresholdMinutes", "dryCleaningMinimumCents", "dryCleaningUrgentSurchargePct", "dryerNormalCycleMinutes", "dryerXlCycleMinutes", "encargoMinimumChargeCents", "encargoPricePerKgCents", "id", "loyaltyDiscountPct", "loyaltyEveryNTransactions", "relayConnected", "relayMockMode", "selfServiceCycleMinutes", "selfServiceDryPriceCents", "selfServiceWashPriceCents", "serialBaudRate", "serialPortPath", "softenerAddonCents", "timezone", "updatedAt", "voidSpikeAmountCents", "voidSpikePercentThreshold", "washerNormalCycleMinutes", "washerXlCycleMinutes", "xlAlmohadaParCents", "xlCobijaGruesaCents", "xlEdredonIndividualCents", "xlEdredonKingCents", "xlEdredonMatrimonialCents") SELECT "bleachAddonCents", "businessName", "cashDrawerCapCents", "cashDrawerSoftWarningPct", "cashDropResidualCents", "cashVarianceApprovalThresholdCents", "currency", "detergentAddonCents", "downtimeThresholdMinutes", "dryCleaningMinimumCents", "dryCleaningUrgentSurchargePct", "dryerNormalCycleMinutes", "dryerXlCycleMinutes", "encargoMinimumChargeCents", "encargoPricePerKgCents", "id", "loyaltyDiscountPct", "loyaltyEveryNTransactions", "relayConnected", "relayMockMode", "selfServiceCycleMinutes", "selfServiceDryPriceCents", "selfServiceWashPriceCents", "serialBaudRate", "serialPortPath", "softenerAddonCents", "timezone", "updatedAt", "voidSpikeAmountCents", "voidSpikePercentThreshold", "washerNormalCycleMinutes", "washerXlCycleMinutes", "xlAlmohadaParCents", "xlCobijaGruesaCents", "xlEdredonIndividualCents", "xlEdredonKingCents", "xlEdredonMatrimonialCents" FROM "AppConfig";
DROP TABLE "AppConfig";
ALTER TABLE "new_AppConfig" RENAME TO "AppConfig";
CREATE TABLE "new_EncargoOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "weightKg" REAL NOT NULL,
    "loads" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "priceCents" INTEGER NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'order',
    "createdByEmployeeId" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EncargoOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EncargoOrder_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EncargoOrder" ("createdAt", "createdByEmployeeId", "customerId", "customerName", "customerPhone", "deliveredAt", "id", "loads", "notes", "paymentMethod", "paymentMode", "paymentStatus", "priceCents", "readyAt", "receivedAt", "status", "updatedAt", "weightKg") SELECT "createdAt", "createdByEmployeeId", "customerId", "customerName", "customerPhone", "deliveredAt", "id", "loads", "notes", "paymentMethod", "paymentMode", "paymentStatus", "priceCents", "readyAt", "receivedAt", "status", "updatedAt", "weightKg" FROM "EncargoOrder";
DROP TABLE "EncargoOrder";
ALTER TABLE "new_EncargoOrder" RENAME TO "EncargoOrder";
CREATE INDEX "EncargoOrder_status_idx" ON "EncargoOrder"("status");
CREATE INDEX "EncargoOrder_receivedAt_idx" ON "EncargoOrder"("receivedAt");
CREATE INDEX "EncargoOrder_createdByEmployeeId_idx" ON "EncargoOrder"("createdByEmployeeId");
CREATE INDEX "EncargoOrder_customerId_idx" ON "EncargoOrder"("customerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
