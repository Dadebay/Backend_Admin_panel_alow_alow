-- Preserve existing whole points while supporting hundredths throughout earning.
BEGIN;
ALTER TABLE "Product" DROP CONSTRAINT "Product_loyaltyPoints_check";
ALTER TABLE "Product" ALTER COLUMN "loyaltyPoints" TYPE DECIMAL(12,2);
ALTER TABLE "Product" ADD CONSTRAINT "Product_loyaltyPoints_check" CHECK ("loyaltyPoints" >= 0.01);
ALTER TABLE "OrderItem" ALTER COLUMN "loyaltyPoints" TYPE DECIMAL(12,2);
ALTER TABLE "Order" ALTER COLUMN "loyaltyPointsEarned" TYPE DECIMAL(12,2);
ALTER TABLE "User" ALTER COLUMN "pointsBalance" TYPE DECIMAL(12,2);
ALTER TABLE "LoyaltyEntry" ALTER COLUMN "points" TYPE DECIMAL(12,2);
COMMIT;
