-- Retain staff identity for orders, cash handoffs and audit history.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
