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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppConfig" ("businessName", "currency", "id", "relayConnected", "relayMockMode", "serialBaudRate", "serialPortPath", "timezone", "updatedAt") SELECT "businessName", "currency", "id", "relayConnected", "relayMockMode", "serialBaudRate", "serialPortPath", "timezone", "updatedAt" FROM "AppConfig";
DROP TABLE "AppConfig";
ALTER TABLE "new_AppConfig" RENAME TO "AppConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
