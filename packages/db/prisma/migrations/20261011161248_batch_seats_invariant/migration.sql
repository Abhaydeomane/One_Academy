-- BR-010: seatsAvailable is always between 0 and seatsTotal inclusive.
--
-- The service layer checks this too, so the error reaching a partner is a
-- readable SEATS_OUT_OF_RANGE rather than a database failure. This constraint
-- exists because the invariant must hold regardless of which code path writes
-- the row — including a future migration, a backfill script, or psql.
ALTER TABLE "Batch"
  ADD CONSTRAINT "Batch_seats_invariant"
  CHECK ("seatsAvailable" >= 0 AND "seatsAvailable" <= "seatsTotal");
