-- Food status and payment are separate: paid orders go to the kitchen board,
-- and table orders the kitchen has handed over wait as SERVED until the bill is paid.

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'SERVED' AFTER 'READY';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "servedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RestaurantSettings" ALTER COLUMN "autoCompleteOnPayment" SET DEFAULT false;

-- Switch existing restaurants to the kitchen flow (they can turn it back off in Settings → Kitchen).
UPDATE "RestaurantSettings" SET "autoCompleteOnPayment" = false;
