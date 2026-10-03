-- Product photos live in the database: the app's filesystem is per-device and
-- Render's is ephemeral, so a disk would lose every photo on redeploy.
-- Bytes, not base64, in the column; the API base64-encodes on the wire.
ALTER TABLE "Product" ADD COLUMN "imageBytes" BYTEA;
ALTER TABLE "Product" ADD COLUMN "imageMime" TEXT;
ALTER TABLE "Product" ADD COLUMN "imageWidth" INTEGER;
ALTER TABLE "Product" ADD COLUMN "imageHeight" INTEGER;