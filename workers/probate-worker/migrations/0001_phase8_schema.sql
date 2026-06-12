-- ============================================================
-- DealEdge Phase 8: Pre-Listing Seller Prediction Engine
-- Cloudflare D1 (SQLite)
-- Design: append-only signal events -> computed scores -> tier routing
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. PARCELS — canonical record, one row per Knox County parcel
--    Enriched from KGIS (Phase 2 worker)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parcels (
  parcel_id        TEXT PRIMARY KEY,          -- e.g. '083AB037'
  situs_address    TEXT,
  situs_city       TEXT,
  situs_zip        TEXT,
  zoning           TEXT,
  overlay          TEXT,                      -- HP, H-1, NC-1 etc.
  land_use         TEXT,                      -- SFR, duplex, vacant, etc.
  acreage          REAL,
  sqft_improved    INTEGER,
  year_built       INTEGER,
  assessed_value   INTEGER,                   -- county assessment, cents avoided: whole dollars
  last_sale_date   TEXT,                      -- ISO date from deed
  last_sale_price  INTEGER,
  owner_name_raw   TEXT,                      -- exactly as deed reads
  mailing_address  TEXT,
  mailing_state    TEXT,
  is_absentee      INTEGER GENERATED ALWAYS AS
                     (CASE WHEN mailing_address IS NOT NULL
                           AND situs_address IS NOT NULL
                           AND mailing_address <> situs_address
                      THEN 1 ELSE 0 END) VIRTUAL,
  est_open_liens   INTEGER DEFAULT 0,         -- summed from liens table, denormalized for speed
  est_equity       INTEGER,                   -- assessed_value - est_open_liens (refresh job)
  kgis_synced_at   TEXT,
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_parcels_zip ON parcels(situs_zip);
CREATE INDEX IF NOT EXISTS idx_parcels_absentee ON parcels(is_absentee);

-- ------------------------------------------------------------
-- 2. OWNER_NAMES — alias table for fuzzy matching
--    One parcel owner can appear as: estate, trust, maiden name,
--    'SMITH JOHN & MARY', LLC. Obit/court matching joins here.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owner_names (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  parcel_id    TEXT NOT NULL REFERENCES parcels(parcel_id),
  name_raw     TEXT NOT NULL,
  name_norm    TEXT NOT NULL,        -- uppercased, punctuation stripped, tokens sorted
  name_type    TEXT,                 -- 'individual','estate','trust','llc','joint'
  source       TEXT,                 -- 'deed','probate','manual'
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_owner_names_norm ON owner_names(name_norm);

-- ------------------------------------------------------------
-- 3. SIGNAL_TYPES — weight registry. Edit weights here, never in code.
--    weight      : base points 0-100
--    half_life_d : days until signal contributes half its weight
--                  NULL = static signal, no decay
--    stackable   : 1 = repeat occurrences add (diminishing), 0 = count once
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signal_types (
  signal_type   TEXT PRIMARY KEY,
  label         TEXT,
  weight        REAL NOT NULL,
  half_life_d   INTEGER,
  stackable     INTEGER DEFAULT 0,
  notes         TEXT
);

INSERT OR REPLACE INTO signal_types (signal_type, label, weight, half_life_d, stackable, notes) VALUES
  ('probate',        'Probate filing matched to owner',      90, 365, 0, 'Strongest sell predictor; estates must resolve'),
  ('preforeclosure', 'NOD / foreclosure notice',             85,  90, 0, 'Already in leads-worker; short fuse, fast decay'),
  ('tax_delinq',     'Property tax delinquent 2+ years',     80, 540, 0, 'Slow burn; refresh annually from Trustee'),
  ('obit_match',     'Obituary matched to owner name',       75, 365, 0, 'Feeds probate ~60-90 days later; earlier signal'),
  ('divorce',        'Divorce filing matched to owner',      70, 270, 0, 'Circuit Court; house usually sells in settlement'),
  ('eviction',       'Detainer warrant filed BY owner',      60, 180, 1, 'Tired landlord signal; stacks per filing'),
  ('code_violation', 'City code enforcement case',           55, 270, 1, 'Stacks; deferred-maintenance proxy'),
  ('bankruptcy',     'Ch 7/13 filing matched to owner',      55, 365, 0, 'PACER; pair with equity for tier routing'),
  ('vacancy',        'USPS vacancy flag',                    50, 180, 0, 'From BatchData append'),
  ('expired_mls',    'Expired/withdrawn listing',            50, 120, 0, 'From Travis; failed sale = motivated + anchored'),
  ('senior_tenure',  'Owner 70+ with 30+ yr tenure',         40, NULL,0, 'Static; seller-finance segment, not distress'),
  ('absentee',       'Mailing address != situs',             30, NULL,0, 'Static; weak alone, strong in stacks'),
  ('utility_shutoff','KUB disconnect (if obtainable)',       45, 120, 0, 'Speculative source; verify availability');

-- ------------------------------------------------------------
-- 4. SIGNALS — append-only event log. NEVER update, only insert.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  parcel_id     TEXT NOT NULL REFERENCES parcels(parcel_id),
  signal_type   TEXT NOT NULL REFERENCES signal_types(signal_type),
  observed_at   TEXT NOT NULL,                -- date the event occurred (filing date, obit date)
  ingested_at   TEXT DEFAULT (datetime('now')),
  source_url    TEXT,
  source_doc_id TEXT,                          -- court case no, code case no, etc.
  match_conf    REAL DEFAULT 1.0,              -- 0-1 fuzzy-match confidence (obits, court names)
  raw_json      TEXT,                          -- full extracted record from Haiku
  UNIQUE(parcel_id, signal_type, source_doc_id) -- idempotent re-scrapes
);

CREATE INDEX IF NOT EXISTS idx_signals_parcel ON signals(parcel_id);
CREATE INDEX IF NOT EXISTS idx_signals_type_date ON signals(signal_type, observed_at);

-- ------------------------------------------------------------
-- 5. SCORES — recomputed by cron worker (daily). One row per parcel.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scores (
  parcel_id       TEXT PRIMARY KEY REFERENCES parcels(parcel_id),
  motivation      REAL NOT NULL,        -- decayed, stacked signal sum (uncapped raw)
  motivation_norm REAL NOT NULL,        -- 0-100 normalized
  signal_count    INTEGER NOT NULL,     -- distinct signal types present
  stack_bonus     REAL NOT NULL,        -- multiplier applied
  equity_pct      REAL,                 -- est_equity / assessed_value
  tier            TEXT,                 -- 'cash','listing','seller_finance','lend','watch'
  scored_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scores_tier ON scores(tier, motivation_norm DESC);

-- ------------------------------------------------------------
-- 6. SKIP_TRACES — BatchData results (Phase 3)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skip_traces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parcel_id   TEXT NOT NULL REFERENCES parcels(parcel_id),
  phone       TEXT,
  phone_type  TEXT,            -- 'mobile','landline','voip'
  email       TEXT,
  dnc_flag    INTEGER DEFAULT 0,  -- DO NOT CALL registry hit — respect this
  cost_cents  INTEGER,
  traced_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_skip_parcel ON skip_traces(parcel_id);

-- ------------------------------------------------------------
-- 7. OUTREACH — every touch logged (compliance + calibration)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outreach (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  parcel_id   TEXT NOT NULL REFERENCES parcels(parcel_id),
  channel     TEXT,             -- 'mail','call','sms','door'
  tier_pitched TEXT,
  result      TEXT,             -- 'no_answer','not_interested','callback','appt','deal'
  notes       TEXT,
  touched_at  TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 8. OUTCOMES — ground truth for weight calibration.
--    Populate from deed transfers + MLS solds. THIS IS THE TABLE
--    THAT LETS YOU REPLACE GUESSED WEIGHTS WITH REGRESSED ONES.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outcomes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  parcel_id       TEXT NOT NULL REFERENCES parcels(parcel_id),
  sold            INTEGER NOT NULL,      -- 1/0: transferred within window
  sale_date       TEXT,
  sale_price      INTEGER,
  sale_channel    TEXT,                  -- 'mls','off_market','foreclosure','tax_sale'
  we_contacted    INTEGER DEFAULT 0,
  we_acquired     INTEGER DEFAULT 0,
  score_at_signal REAL,                  -- snapshot of motivation_norm when first flagged
  window_months   INTEGER DEFAULT 12,
  recorded_at     TEXT DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- 9. SCORING VIEW — reference implementation of the math.
--    Decay: weight * 0.5 ^ (age_days / half_life)
--    Match confidence multiplies in.
--    Cron worker can SELECT from this and write to scores.
-- ------------------------------------------------------------
CREATE VIEW IF NOT EXISTS v_signal_scores AS
SELECT
  s.parcel_id,
  s.signal_type,
  st.weight
    * COALESCE(POWER(0.5, (julianday('now') - julianday(s.observed_at)) / st.half_life_d), 1.0)
    * s.match_conf
    AS decayed_points,
  s.observed_at
FROM signals s
JOIN signal_types st ON st.signal_type = s.signal_type
WHERE
  -- drop fully-decayed noise (< 10% of base weight remaining)
  st.half_life_d IS NULL
  OR (julianday('now') - julianday(s.observed_at)) < (st.half_life_d * 3.33);

-- Aggregate per parcel with stack bonus:
--   raw      = SUM(decayed_points), but stackable types use
--              first occurrence full + each repeat at 50%
--              (implement repeat-discount in worker code; SQL kept simple here)
--   stack    = 1.0 + 0.25 * (distinct_signal_types - 1), capped at 2.0
--   final    = raw * stack
CREATE VIEW IF NOT EXISTS v_parcel_scores AS
SELECT
  parcel_id,
  SUM(decayed_points) AS raw_points,
  COUNT(DISTINCT signal_type) AS sig_types,
  MIN(2.0, 1.0 + 0.25 * (COUNT(DISTINCT signal_type) - 1)) AS stack_mult,
  SUM(decayed_points) * MIN(2.0, 1.0 + 0.25 * (COUNT(DISTINCT signal_type) - 1)) AS motivation
FROM v_signal_scores
GROUP BY parcel_id;

-- ------------------------------------------------------------
-- TIER ROUTING (implement in worker after scoring):
--
--   equity_pct = est_equity / assessed_value
--
--   motivation_norm >= 60 AND equity_pct >= 0.50  -> 'listing'
--        (high equity + motivated: GRID listing pitch first,
--         cash offer as fallback in same conversation)
--   motivation_norm >= 60 AND equity_pct 0.20-0.50 -> 'cash'
--        (classic wholesale/flip spread lives here)
--   motivation_norm >= 60 AND equity_pct < 0.20   -> 'lend' or pass
--        (no room for discount; bridge/foreclosure-rescue loan
--         IF equity supports first position — else walk)
--   motivation_norm 35-59 AND senior_tenure flag   -> 'seller_finance'
--        (free-and-clear, low urgency: terms pitch, monthly income
--         angle beats lump-sum for this segment)
--   motivation_norm 35-59 otherwise                -> 'watch'
--        (drip mail only; wait for second signal)
--   motivation_norm < 35                           -> no action
--
-- NOTE: lis pendens/preforeclosure parcels can route to 'lend'
-- even at high motivation if owner wants to STAY — that is the
-- private-lending pipeline, scored by equity coverage not motivation.
-- ------------------------------------------------------------
