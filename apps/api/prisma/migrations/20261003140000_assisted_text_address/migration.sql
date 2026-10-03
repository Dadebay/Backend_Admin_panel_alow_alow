-- A phone order may retain the caller's text address without claiming a map location.
CREATE TYPE "AddressLocationStatus" AS ENUM ('MAP_CONFIRMED', 'PIN_DROPPED', 'MANUAL_UNVERIFIED', 'VERIFIED_LATER');

ALTER TABLE "UserAddress"
  ADD COLUMN "locationStatus" "AddressLocationStatus" NOT NULL DEFAULT 'MAP_CONFIRMED',
  ADD COLUMN "landmark" VARCHAR(160),
  ALTER COLUMN "latitude" DROP NOT NULL,
  ALTER COLUMN "longitude" DROP NOT NULL;

ALTER TABLE "Order"
  ADD COLUMN "addressLocationStatus" "AddressLocationStatus" NOT NULL DEFAULT 'MAP_CONFIRMED',
  ADD COLUMN "addressLandmark" VARCHAR(160),
  ALTER COLUMN "latitude" DROP NOT NULL,
  ALTER COLUMN "longitude" DROP NOT NULL;

ALTER TABLE "UserAddress"
  ADD CONSTRAINT "UserAddress_locationStatus_coordinates_check"
  CHECK (("locationStatus" = 'MANUAL_UNVERIFIED' AND "latitude" IS NULL AND "longitude" IS NULL)
    OR ("locationStatus" <> 'MANUAL_UNVERIFIED' AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL));

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_addressLocationStatus_coordinates_check"
  CHECK (("addressLocationStatus" = 'MANUAL_UNVERIFIED' AND "latitude" IS NULL AND "longitude" IS NULL)
    OR ("addressLocationStatus" <> 'MANUAL_UNVERIFIED' AND "latitude" IS NOT NULL AND "longitude" IS NOT NULL));
