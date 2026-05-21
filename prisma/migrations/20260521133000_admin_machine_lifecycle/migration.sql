PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Machine" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "size" TEXT NOT NULL DEFAULT 'normal',
  "relayChannel" INTEGER,
  "defaultPriceCents" INTEGER NOT NULL,
  "defaultDurationMinutes" INTEGER NOT NULL,
  "outOfService" BOOLEAN NOT NULL DEFAULT false,
  "awaitingRelease" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastRelayTestOk" BOOLEAN,
  "lastRelayTestAt" DATETIME,
  "lastRelayTestError" TEXT,
  "hardwareValidatedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Machine" (
  "id",
  "name",
  "type",
  "size",
  "relayChannel",
  "defaultPriceCents",
  "defaultDurationMinutes",
  "outOfService",
  "awaitingRelease",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "name",
  "type",
  CASE
    WHEN UPPER("name") LIKE '%(XL)%' THEN 'xl'
    ELSE 'normal'
  END,
  "relayChannel",
  "defaultPriceCents",
  "defaultDurationMinutes",
  "outOfService",
  "awaitingRelease",
  "isActive",
  "createdAt",
  "updatedAt"
FROM "Machine";

DROP TABLE "Machine";
ALTER TABLE "new_Machine" RENAME TO "Machine";
CREATE UNIQUE INDEX "Machine_name_key" ON "Machine"("name");
CREATE UNIQUE INDEX "Machine_relayChannel_key" ON "Machine"("relayChannel");

ALTER TABLE "AppConfig" ADD COLUMN "washerNormalCycleMinutes" INTEGER NOT NULL DEFAULT 35;
ALTER TABLE "AppConfig" ADD COLUMN "washerXlCycleMinutes" INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "AppConfig" ADD COLUMN "dryerNormalCycleMinutes" INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "AppConfig" ADD COLUMN "dryerXlCycleMinutes" INTEGER NOT NULL DEFAULT 55;

UPDATE "AppConfig"
SET
  "washerNormalCycleMinutes" = COALESCE((
    SELECT "defaultDurationMinutes"
    FROM "Machine"
    WHERE "type" = 'washer' AND "size" = 'normal' AND "isActive" = 1
    ORDER BY "relayChannel" ASC
    LIMIT 1
  ), "washerNormalCycleMinutes"),
  "washerXlCycleMinutes" = COALESCE((
    SELECT "defaultDurationMinutes"
    FROM "Machine"
    WHERE "type" = 'washer' AND "size" = 'xl' AND "isActive" = 1
    ORDER BY "relayChannel" ASC
    LIMIT 1
  ), "washerXlCycleMinutes"),
  "dryerNormalCycleMinutes" = COALESCE((
    SELECT "defaultDurationMinutes"
    FROM "Machine"
    WHERE "type" = 'dryer' AND "size" = 'normal' AND "isActive" = 1
    ORDER BY "relayChannel" ASC
    LIMIT 1
  ), "dryerNormalCycleMinutes"),
  "dryerXlCycleMinutes" = COALESCE((
    SELECT "defaultDurationMinutes"
    FROM "Machine"
    WHERE "type" = 'dryer' AND "size" = 'xl' AND "isActive" = 1
    ORDER BY "relayChannel" ASC
    LIMIT 1
  ), "dryerXlCycleMinutes"),
  "relayMockMode" = 0;

PRAGMA foreign_keys=ON;
