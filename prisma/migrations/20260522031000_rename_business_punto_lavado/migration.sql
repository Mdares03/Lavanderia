-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "businessName" TEXT NOT NULL DEFAULT 'Punto Lavado',
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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
