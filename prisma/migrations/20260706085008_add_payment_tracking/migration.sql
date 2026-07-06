-- AlterTable
ALTER TABLE "salon_entries" ADD COLUMN     "mainIsPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mainPaidAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "split_entries" ADD COLUMN     "isPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paidAt" TIMESTAMP(3);
