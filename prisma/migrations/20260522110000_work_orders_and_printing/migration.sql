-- Work orders + printing pipeline

ALTER TABLE "Transaction" ADD COLUMN "workOrderId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "workOrderLoadId" TEXT;

ALTER TABLE "AppConfig" ADD COLUMN "washerNormalCapacityKg" REAL NOT NULL DEFAULT 5;
ALTER TABLE "AppConfig" ADD COLUMN "washerXlCapacityKg" REAL NOT NULL DEFAULT 7;
ALTER TABLE "AppConfig" ADD COLUMN "ticketAutoPrintEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AppConfig" ADD COLUMN "ticketPrinterTransport" TEXT NOT NULL DEFAULT 'node_red_http';
ALTER TABLE "AppConfig" ADD COLUMN "ticketPrinterEndpoint" TEXT NOT NULL DEFAULT 'http://127.0.0.1:1880/printer/jobs';
ALTER TABLE "AppConfig" ADD COLUMN "ticketPrinterProfile" TEXT NOT NULL DEFAULT 'epson_tm_t20iii';
ALTER TABLE "AppConfig" ADD COLUMN "ticketPrinterTimeoutMs" INTEGER NOT NULL DEFAULT 7000;

CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "encargoOrderId" TEXT,
    "serviceType" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "weightKg" REAL NOT NULL,
    "requiredLoads" INTEGER NOT NULL,
    "baseAmountCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "loyaltyDiscountApplied" BOOLEAN NOT NULL DEFAULT false,
    "addonDetergentQty" INTEGER NOT NULL DEFAULT 0,
    "addonSoftenerQty" INTEGER NOT NULL DEFAULT 0,
    "addonBleachQty" INTEGER NOT NULL DEFAULT 0,
    "addonAmountCents" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkOrder_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkOrder_encargoOrderId_fkey" FOREIGN KEY ("encargoOrderId") REFERENCES "EncargoOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkOrder_orderNumber_key" ON "WorkOrder"("orderNumber");
CREATE INDEX "WorkOrder_createdAt_idx" ON "WorkOrder"("createdAt");
CREATE INDEX "WorkOrder_customerId_idx" ON "WorkOrder"("customerId");
CREATE INDEX "WorkOrder_employeeId_idx" ON "WorkOrder"("employeeId");
CREATE INDEX "WorkOrder_encargoOrderId_idx" ON "WorkOrder"("encargoOrderId");

CREATE TABLE "WorkOrderLoad" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workOrderId" TEXT NOT NULL,
    "loadIndex" INTEGER NOT NULL,
    "washerMachineId" TEXT NOT NULL,
    "dryerMachineId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkOrderLoad_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkOrderLoad_washerMachineId_fkey" FOREIGN KEY ("washerMachineId") REFERENCES "Machine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkOrderLoad_dryerMachineId_fkey" FOREIGN KEY ("dryerMachineId") REFERENCES "Machine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkOrderLoad_workOrderId_loadIndex_key" ON "WorkOrderLoad"("workOrderId", "loadIndex");
CREATE INDEX "WorkOrderLoad_washerMachineId_idx" ON "WorkOrderLoad"("washerMachineId");
CREATE INDEX "WorkOrderLoad_dryerMachineId_idx" ON "WorkOrderLoad"("dryerMachineId");

CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workOrderId" TEXT NOT NULL,
    "ticketType" TEXT NOT NULL,
    "loadIndex" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payloadJson" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "printedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrintJob_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PrintJob_workOrderId_status_idx" ON "PrintJob"("workOrderId", "status");
CREATE INDEX "PrintJob_ticketType_createdAt_idx" ON "PrintJob"("ticketType", "createdAt");

CREATE INDEX "Transaction_workOrderId_idx" ON "Transaction"("workOrderId");
CREATE UNIQUE INDEX "Transaction_workOrderLoadId_key" ON "Transaction"("workOrderLoadId");
