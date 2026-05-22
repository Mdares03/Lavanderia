PRAGMA foreign_keys=OFF;

ALTER TABLE "Transaction" ADD COLUMN "voidReasonCode" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "voidReasonNotes" TEXT;

CREATE TABLE "new_Shift" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "startTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endTime" DATETIME,
  "closedByEmployeeId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "startingCashCents" INTEGER NOT NULL,
  "expectedCashCents" INTEGER,
  "actualCashCents" INTEGER,
  "differenceCashCents" INTEGER,
  "countedCashSubmittedAt" DATETIME,
  "expectedCashRevealedAt" DATETIME,
  "varianceApprovedByEmployeeId" TEXT,
  "varianceApprovalNote" TEXT,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Shift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Shift_closedByEmployeeId_fkey" FOREIGN KEY ("closedByEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Shift_varianceApprovedByEmployeeId_fkey" FOREIGN KEY ("varianceApprovedByEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Shift" (
  "id",
  "employeeId",
  "startTime",
  "endTime",
  "startingCashCents",
  "expectedCashCents",
  "actualCashCents",
  "differenceCashCents",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "employeeId",
  "startTime",
  "endTime",
  "startingCashCents",
  "expectedCashCents",
  "actualCashCents",
  "differenceCashCents",
  "notes",
  "createdAt",
  "updatedAt"
FROM "Shift";

DROP TABLE "Shift";
ALTER TABLE "new_Shift" RENAME TO "Shift";
CREATE INDEX "Shift_startTime_idx" ON "Shift"("startTime");

ALTER TABLE "AppConfig" ADD COLUMN "downtimeThresholdMinutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "AppConfig" ADD COLUMN "voidSpikePercentThreshold" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "AppConfig" ADD COLUMN "voidSpikeAmountCents" INTEGER NOT NULL DEFAULT 50000;
ALTER TABLE "AppConfig" ADD COLUMN "cashVarianceApprovalThresholdCents" INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE "AppConfig" ADD COLUMN "cashDrawerCapCents" INTEGER NOT NULL DEFAULT 200000;
ALTER TABLE "AppConfig" ADD COLUMN "cashDrawerSoftWarningPct" INTEGER NOT NULL DEFAULT 80;
ALTER TABLE "AppConfig" ADD COLUMN "cashDropResidualCents" INTEGER NOT NULL DEFAULT 50000;

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "actorEmployeeId" TEXT,
  "deviceId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditEvent_type_createdAt_idx" ON "AuditEvent"("type", "createdAt");
CREATE INDEX "AuditEvent_actorEmployeeId_createdAt_idx" ON "AuditEvent"("actorEmployeeId", "createdAt");

CREATE TABLE "VoidReason" (
  "code" TEXT NOT NULL PRIMARY KEY,
  "label" TEXT NOT NULL,
  "requiresNotes" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "CashDrop" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shiftId" TEXT NOT NULL,
  "performedByEmployeeId" TEXT NOT NULL,
  "approvedByEmployeeId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "destination" TEXT NOT NULL DEFAULT 'safe',
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "deviceId" TEXT,
  "overrideUsed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashDrop_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashDrop_performedByEmployeeId_fkey" FOREIGN KEY ("performedByEmployeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CashDrop_approvedByEmployeeId_fkey" FOREIGN KEY ("approvedByEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "CashDrop_shiftId_createdAt_idx" ON "CashDrop"("shiftId", "createdAt");
CREATE INDEX "CashDrop_performedByEmployeeId_createdAt_idx" ON "CashDrop"("performedByEmployeeId", "createdAt");

CREATE TABLE "SafeLedgerEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shiftId" TEXT,
  "cashDropId" TEXT,
  "performedByEmployeeId" TEXT,
  "type" TEXT NOT NULL,
  "amountDeltaCents" INTEGER NOT NULL,
  "expectedBalanceAfterCents" INTEGER NOT NULL,
  "countedBalanceCents" INTEGER,
  "varianceCents" INTEGER,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SafeLedgerEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SafeLedgerEvent_cashDropId_fkey" FOREIGN KEY ("cashDropId") REFERENCES "CashDrop" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SafeLedgerEvent_performedByEmployeeId_fkey" FOREIGN KEY ("performedByEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "SafeLedgerEvent_createdAt_idx" ON "SafeLedgerEvent"("createdAt");
CREATE INDEX "SafeLedgerEvent_type_createdAt_idx" ON "SafeLedgerEvent"("type", "createdAt");

INSERT OR IGNORE INTO "VoidReason" ("code", "label", "requiresNotes", "isActive", "createdAt", "updatedAt") VALUES
  ('customer_changed_mind', 'Cliente cambió de opinión', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cashier_error', 'Error de cajero', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('machine_failure', 'Falla de máquina', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('refund', 'Reembolso', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('service_change', 'Cambio de servicio', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('other', 'Otro', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

PRAGMA foreign_keys=ON;
