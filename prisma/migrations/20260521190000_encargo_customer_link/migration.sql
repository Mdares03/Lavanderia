ALTER TABLE "EncargoOrder" ADD COLUMN "customerId" TEXT;

CREATE INDEX "EncargoOrder_customerId_idx" ON "EncargoOrder"("customerId");
