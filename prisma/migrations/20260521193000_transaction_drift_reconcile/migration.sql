-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "serviceType" TEXT NOT NULL DEFAULT 'autoservicio',
    "amountCents" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "isExtension" BOOLEAN NOT NULL DEFAULT false,
    "parentTransactionId" TEXT,
    "encargoOrderId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "expectedEndAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_relay',
    "endedAt" DATETIME,
    "voidedAt" DATETIME,
    "voidedByEmployeeId" TEXT,
    "relayOnAttemptedAt" DATETIME,
    "relayTurnedOnAt" DATETIME,
    "relayOffAttemptedAt" DATETIME,
    "relayTurnedOffAt" DATETIME,
    "relayFailureReason" TEXT,
    "voidReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "voidReasonCode" TEXT,
    "voidReasonNotes" TEXT,
    FOREIGN KEY ("voidedByEmployeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("encargoOrderId") REFERENCES "EncargoOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("parentTransactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("machineId") REFERENCES "Machine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("addonAmountCents", "addonBleachQty", "addonDetergentQty", "addonSoftenerQty", "amountCents", "baseAmountCents", "createdAt", "customerId", "discountCents", "employeeId", "encargoOrderId", "endedAt", "expectedEndAt", "id", "isExtension", "loyaltyDiscountApplied", "machineId", "parentTransactionId", "paymentMethod", "relayFailureReason", "relayOffAttemptedAt", "relayOnAttemptedAt", "relayTurnedOffAt", "relayTurnedOnAt", "serviceType", "startedAt", "status", "ticketNumber", "updatedAt", "voidReason", "voidReasonCode", "voidReasonNotes", "voidedAt", "voidedByEmployeeId") SELECT "addonAmountCents", "addonBleachQty", "addonDetergentQty", "addonSoftenerQty", "amountCents", "baseAmountCents", "createdAt", "customerId", "discountCents", "employeeId", "encargoOrderId", "endedAt", "expectedEndAt", "id", "isExtension", "loyaltyDiscountApplied", "machineId", "parentTransactionId", "paymentMethod", "relayFailureReason", "relayOffAttemptedAt", "relayOnAttemptedAt", "relayTurnedOffAt", "relayTurnedOnAt", "serviceType", "startedAt", "status", "ticketNumber", "updatedAt", "voidReason", "voidReasonCode", "voidReasonNotes", "voidedAt", "voidedByEmployeeId" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_voidedAt_idx" ON "Transaction"("voidedAt" ASC);
CREATE INDEX "Transaction_encargoOrderId_idx" ON "Transaction"("encargoOrderId" ASC);
CREATE INDEX "Transaction_parentTransactionId_idx" ON "Transaction"("parentTransactionId" ASC);
CREATE INDEX "Transaction_customerId_idx" ON "Transaction"("customerId" ASC);
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status" ASC);
CREATE INDEX "Transaction_expectedEndAt_idx" ON "Transaction"("expectedEndAt" ASC);
CREATE UNIQUE INDEX "Transaction_ticketNumber_key" ON "Transaction"("ticketNumber" ASC);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

