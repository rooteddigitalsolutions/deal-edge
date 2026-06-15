-- Migration 0004: three-horizon scoring
-- Replaces the single biased motivation score with three independent
-- 0-100 scores per parcel: flip (short), brrrr (mid), hold (long).
-- Strategy-neutral: vacant_land is a TAG, not a score booster. Each
-- horizon weights the same underlying facts differently.
--
-- Run: npx wrangler d1 execute leads --remote --file=migrations/0004_three_horizon.sql
-- Re-runnable: recompute by re-executing the INSERT...SELECT at the bottom.

-- ---------------------------------------------------------------
-- 1. Scores table gets three columns (keep old 'motivation' for ref)
-- ---------------------------------------------------------------
ALTER TABLE scores ADD COLUMN flip_score REAL;
ALTER TABLE scores ADD COLUMN brrrr_score REAL;
ALTER TABLE scores ADD COLUMN hold_score REAL;
ALTER TABLE scores ADD COLUMN property_type TEXT;   -- 'house' | 'vacant' | 'other'
ALTER TABLE scores ADD COLUMN flags TEXT;            -- neutral tags: 'foreclosure,out_of_state,single_owner'

-- ---------------------------------------------------------------
-- 2. Per-parcel feature view: extract the neutral facts each score reads
-- ---------------------------------------------------------------
DROP VIEW IF EXISTS v_parcel_features;
CREATE VIEW v_parcel_features AS
SELECT
  p.parcel_id,
  p.owner_name_raw,
  p.situs_address,
  p.land_use,
  -- property type from land_use code
  CASE
    WHEN UPPER(COALESCE(p.land_use,'')) LIKE '%UNUSED%'
      OR UPPER(COALESCE(p.land_use,'')) LIKE '%VACANT%'
      OR p.land_use LIKE '100%' OR p.land_use LIKE '19%'
      THEN 'vacant'
    WHEN p.land_use LIKE '101%' OR p.land_use LIKE '102%'
      OR UPPER(COALESCE(p.land_use,'')) LIKE '%FAMILY%'
      THEN 'house'
    ELSE 'other'
  END AS property_type,
  -- signal presence flags
  MAX(CASE WHEN s.signal_type='preforeclosure' THEN 1 ELSE 0 END) AS has_foreclosure,
  MAX(CASE WHEN s.signal_type='petition_to_sell' THEN 1 ELSE 0 END) AS has_petition,
  MAX(CASE WHEN s.signal_type='probate' THEN 1 ELSE 0 END) AS has_probate,
  MAX(CASE WHEN s.signal_type='vacant_land' THEN 1 ELSE 0 END) AS is_vacant_signal,
  -- owner structure: single owner vs multi (& or %)
  CASE WHEN p.owner_name_raw LIKE '%&%' OR p.owner_name_raw LIKE '%\%%' ESCAPE '\'
       THEN 0 ELSE 1 END AS single_owner,
  -- trust/company owner (slower, often pre-handled)
  CASE WHEN UPPER(COALESCE(p.owner_name_raw,'')) LIKE '%TRUST%'
         OR UPPER(COALESCE(p.owner_name_raw,'')) LIKE '%REALTY%'
         OR UPPER(COALESCE(p.owner_name_raw,'')) LIKE '% CO%'
       THEN 1 ELSE 0 END AS entity_owner,
  COUNT(DISTINCT s.signal_type) AS signal_count
FROM parcels p
JOIN signals s ON s.parcel_id = p.parcel_id
GROUP BY p.parcel_id;

-- ---------------------------------------------------------------
-- 3. Compute the three scores. Each is 0-100, capped.
--    Weights are starting judgment — recalibrate against outcomes later.
-- ---------------------------------------------------------------
-- FLIP (short, <2yr): speed + clean exit. Foreclosure clock, petition
--   already filed, single owner = fast. Vacant land and entity/trust
--   owners drag it down (no quick retail buyer / slow to transact).
--
-- BRRRR (mid, 2-5yr): forced-appreciation. Houses to renovate score
--   high; buildable vacant land scores medium-high; motivation matters
--   but urgency less so. Multi-owner penalized lightly.
--
-- HOLD (long, 5-10yr+): durable cash-flow / land-bank. Rentable houses
--   and vacant land both viable; foreclosure urgency nearly irrelevant;
--   entity/trust owners fine (seller-finance candidates).

INSERT INTO scores (parcel_id, motivation, motivation_norm, signal_count, stack_bonus,
                    flip_score, brrrr_score, hold_score, property_type, flags, scored_at)
SELECT
  f.parcel_id,
  0, 0, f.signal_count, 1.0,

  -- FLIP ---------------------------------------------------------
  MIN(100.0, MAX(0.0,
      40 * f.has_foreclosure
    + 45 * f.has_petition
    + 20 * f.has_probate
    + 15 * f.single_owner
    - 30 * (CASE WHEN f.property_type='vacant' THEN 1 ELSE 0 END)
    - 15 * f.entity_owner
  )) AS flip_score,

  -- BRRRR --------------------------------------------------------
  MIN(100.0, MAX(0.0,
      35 * (CASE WHEN f.property_type='house' THEN 1 ELSE 0 END)
    + 25 * (CASE WHEN f.property_type='vacant' THEN 1 ELSE 0 END)
    + 25 * f.has_probate
    + 25 * f.has_petition
    + 15 * f.has_foreclosure
    - 10 * (1 - f.single_owner)
  )) AS brrrr_score,

  -- HOLD ---------------------------------------------------------
  MIN(100.0, MAX(0.0,
      30 * (CASE WHEN f.property_type='house' THEN 1 ELSE 0 END)
    + 30 * (CASE WHEN f.property_type='vacant' THEN 1 ELSE 0 END)
    + 25 * f.has_probate
    + 20 * f.has_petition
    + 10 * f.entity_owner          -- seller-finance candidate
    +  5 * f.has_foreclosure
  )) AS hold_score,

  f.property_type,

  -- neutral flags string
  TRIM(
    (CASE WHEN f.has_foreclosure=1 THEN 'foreclosure ' ELSE '' END) ||
    (CASE WHEN f.has_petition=1 THEN 'petition_to_sell ' ELSE '' END) ||
    (CASE WHEN f.property_type='vacant' THEN 'vacant ' ELSE '' END) ||
    (CASE WHEN f.single_owner=1 THEN 'single_owner ' ELSE 'multi_owner ' END) ||
    (CASE WHEN f.entity_owner=1 THEN 'entity_owner ' ELSE '' END)
  ) AS flags,

  datetime('now')
FROM v_parcel_features f
WHERE true
ON CONFLICT(parcel_id) DO UPDATE SET
  flip_score    = excluded.flip_score,
  brrrr_score   = excluded.brrrr_score,
  hold_score    = excluded.hold_score,
  property_type = excluded.property_type,
  flags         = excluded.flags,
  signal_count  = excluded.signal_count,
  scored_at     = excluded.scored_at;
