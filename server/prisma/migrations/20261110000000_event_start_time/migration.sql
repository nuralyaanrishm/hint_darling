-- AlterTable
ALTER TABLE "events" ADD COLUMN "eventStartsAt" TIMESTAMP(3);

-- Deliberately no backfill: existing events never opted into a deadline, so
-- their gifting window stays open until an owner sets a start time. Backfilling
-- from "eventDate" would silently close claiming on events that are mid-flight.
