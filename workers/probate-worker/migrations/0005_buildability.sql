-- Migration 0005: buildability columns
-- Run: npx wrangler d1 execute leads --remote --file=migrations/0005_buildability.sql
-- Strategy-neutral: these are facts shown beside scores, never inputs to scores.

ALTER TABLE parcels ADD COLUMN zoning TEXT;        -- base district: RN-1, EN, C-G-2...
ALTER TABLE parcels ADD COLUMN constraints TEXT;   -- comma list: HP,FLOOD,H-1 ... or ''
