import type { Prisma } from "../generated/prisma/client";
import { localDateForInstant } from "../accounting/accounting-period";

// PostgreSQL's upsert serializes increments for one local date. The caller
// creates the order in the same transaction, so a rollback also rolls back the
// counter and never burns a visible number.
export async function allocateDailyOrderNumber(
  tx: Prisma.TransactionClient,
  createdAt: Date,
) {
  const numberDate = localDateForInstant(createdAt);
  const counter = await tx.orderDailyCounter.upsert({
    where: { date: numberDate },
    create: { date: numberDate, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return { numberDate, number: counter.lastNumber };
}
