-- Existing order numbers and receipts remain unchanged. NULL numberDate marks
-- the legacy global sequence; new orders use an Ashgabat calendar date.
ALTER TABLE "Order" ADD COLUMN "numberDate" VARCHAR(10);
DROP INDEX "Order_number_key";
CREATE UNIQUE INDEX "Order_numberDate_number_key" ON "Order"("numberDate", "number");
CREATE INDEX "Order_number_idx" ON "Order"("number");

CREATE TABLE "OrderDailyCounter" (
    "date" VARCHAR(10) NOT NULL,
    "lastNumber" INTEGER NOT NULL,
    CONSTRAINT "OrderDailyCounter_pkey" PRIMARY KEY ("date")
);

-- Archiving retains products and their order, recipe, stock and favorite links.
ALTER TABLE "Category" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Category_deletedAt_idx" ON "Category"("deletedAt");
