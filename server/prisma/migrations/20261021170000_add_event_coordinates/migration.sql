-- Optional map coordinates for an event's location.
ALTER TABLE "events" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "events" ADD COLUMN "longitude" DOUBLE PRECISION;
