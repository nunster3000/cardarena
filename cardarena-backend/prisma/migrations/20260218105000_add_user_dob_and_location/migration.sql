-- Add DOB + location fields for geofencing/compliance
ALTER TABLE "User"
ADD COLUMN "dateOfBirth" TIMESTAMP(3),
ADD COLUMN "countryCode" TEXT,
ADD COLUMN "region" TEXT;
