ALTER TABLE "Machine" ADD COLUMN "awaitingRelease" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Transaction" ADD COLUMN "isExtension" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Transaction" ADD COLUMN "parentTransactionId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "encargoOrderId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "voidedAt" DATETIME;
ALTER TABLE "Transaction" ADD COLUMN "voidedByEmployeeId" TEXT;

CREATE TABLE "EncargoOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "weightKg" REAL NOT NULL,
    "loads" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "priceCents" INTEGER NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "paymentMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'recibido',
    "createdByEmployeeId" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EncargoOrder_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Transaction_parentTransactionId_idx" ON "Transaction"("parentTransactionId");
CREATE INDEX "Transaction_encargoOrderId_idx" ON "Transaction"("encargoOrderId");
CREATE INDEX "Transaction_voidedAt_idx" ON "Transaction"("voidedAt");
CREATE INDEX "EncargoOrder_status_idx" ON "EncargoOrder"("status");
CREATE INDEX "EncargoOrder_receivedAt_idx" ON "EncargoOrder"("receivedAt");
CREATE INDEX "EncargoOrder_createdByEmployeeId_idx" ON "EncargoOrder"("createdByEmployeeId");
