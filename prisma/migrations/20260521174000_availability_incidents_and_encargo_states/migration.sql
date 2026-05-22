PRAGMA foreign_keys=OFF;

CREATE TABLE "AvailabilityIncident" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "machineId" TEXT NOT NULL,
  "relayChannel" INTEGER,
  "startedAt" DATETIME NOT NULL,
  "endedAt" DATETIME,
  "minutes" INTEGER,
  "reasonCode" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AvailabilityIncident_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AvailabilityIncident_machineId_startedAt_idx" ON "AvailabilityIncident"("machineId", "startedAt");
CREATE INDEX "AvailabilityIncident_startedAt_endedAt_idx" ON "AvailabilityIncident"("startedAt", "endedAt");
CREATE INDEX "AvailabilityIncident_reasonCode_startedAt_idx" ON "AvailabilityIncident"("reasonCode", "startedAt");

UPDATE "EncargoOrder" SET "status" = 'order' WHERE "status" = 'recibido';
UPDATE "EncargoOrder" SET "status" = 'processing' WHERE "status" IN ('lavando', 'secando', 'doblando');
UPDATE "EncargoOrder" SET "status" = 'ready' WHERE "status" = 'listo';
UPDATE "EncargoOrder" SET "status" = 'picked_up' WHERE "status" = 'entregado';

PRAGMA foreign_keys=ON;
