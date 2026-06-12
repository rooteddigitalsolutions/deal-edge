-- Migration 0002: raw store for Knoxville Focus legal notice extractions.
-- Run after phase8_schema.sql (0001).
-- Raw extractions land here first; the matcher promotes them into signals.

CREATE TABLE IF NOT EXISTS probate_notices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_type     TEXT NOT NULL,       -- 'creditor_notice' | 'petition_to_sell' | 'foreclosure'
  decedent_name   TEXT,                -- or borrower name for foreclosures
  docket_number   TEXT,                -- estate docket / case no / instrument no
  date_of_death   TEXT,                -- ISO date if stated
  letters_date    TEXT,                -- date letters testamentary issued / sale date for foreclosure
  pr_name         TEXT,                -- personal representative / substitute trustee
  pr_address      TEXT,                -- PR mailing address (direct-mail target, no skip trace)
  property_address TEXT,               -- present on foreclosures + petitions to sell
  parcel_id       TEXT,                -- present on foreclosures ("Property Tax ID#...")
  source_url      TEXT NOT NULL,
  published_week  TEXT,                -- ISO date of the Focus issue
  matched         INTEGER DEFAULT 0,   -- 0=pending, 1=promoted to signals, -1=no match found
  raw_text        TEXT,                -- the notice block as scraped (audit trail)
  created_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(notice_type, docket_number, decedent_name)  -- idempotent weekly re-runs
);

CREATE INDEX IF NOT EXISTS idx_pn_matched ON probate_notices(matched);
CREATE INDEX IF NOT EXISTS idx_pn_week ON probate_notices(published_week);

-- New signal types this worker emits (extends the registry from 0001):
INSERT OR REPLACE INTO signal_types (signal_type, label, weight, half_life_d, stackable, notes) VALUES
  ('petition_to_sell', 'Estate petition to sell real property', 95, 180, 0,
   'Estate has ALREADY decided to sell; hottest signal in the Focus feed');
