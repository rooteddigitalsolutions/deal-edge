-- Migration 0006: value columns (Path 1 - appraised/assessed, no liens)
-- Run: npx wrangler d1 execute leads --remote --file=migrations/0006_value.sql
--
-- NOTE: if any column already exists this aborts at that line and the REST
-- DO NOT GET ADDED. If that happens, add the missing ones individually with:
--   npx wrangler d1 execute leads --remote --command="ALTER TABLE parcels ADD COLUMN <name> <type>"
--
-- appraised_total is COUNTY value (~60-80% of market) = size proxy + tax
-- basis, NOT ARV. Real value still comes from comps.

ALTER TABLE parcels ADD COLUMN appraised_total INTEGER;
ALTER TABLE parcels ADD COLUMN appraised_land INTEGER;
ALTER TABLE parcels ADD COLUMN appraised_bldg INTEGER;
ALTER TABLE parcels ADD COLUMN assessed_total INTEGER;
ALTER TABLE parcels ADD COLUMN mail_address TEXT;
ALTER TABLE parcels ADD COLUMN sale_date TEXT;
ALTER TABLE parcels ADD COLUMN purchase_price INTEGER;
