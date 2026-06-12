# DealEdge probate-worker — deploy & run

## What it does
Every Tuesday morning it grabs the newest "Legal and public notices" post from
knoxfocus.com, has Haiku extract every estate notice, petition-to-sell, and
foreclosure into structured rows, stores them in D1, and promotes matches into
the `signals` table that feeds parcel scoring.

## Deploy (5 steps)
1. Edit `wrangler.toml` → set `database_id` to your existing DealEdge D1 id
   (`npx wrangler d1 list` shows it).
2. Run the schema (once):
   npx wrangler d1 execute dealedge --remote --file=../phase8_schema.sql
   npx wrangler d1 execute dealedge --remote --file=migrations/0002_probate_notices.sql
3. npx wrangler secret put ANTHROPIC_API_KEY
4. npx wrangler deploy
5. Smoke test: open https://dealedge-probate-worker.<your-subdomain>.workers.dev/run
   — should return JSON with `blocks`, `inserted`, `promoted`.

## Endpoints
- GET /run      — run the pipeline now (idempotent; re-running a week is safe)
- GET /pending  — notices not yet matched to a parcel (review queue)

## Cost
~30-60 Haiku calls per weekly issue ≈ pennies. Cron + D1 within free/paid plan
you already have.

## Known limitations (read before trusting output)
1. NAME MATCHING IS DORMANT until the parcels table is populated (Phase 2 KGIS
   load). Until then, creditor notices accumulate with matched=0 — nothing is
   lost; the matcher sweeps pending rows on every run.
2. Parcel ID format: foreclosure notices print "093FC-028.01"; the worker
   normalizes to "093FC02801". Verify this matches the format your KGIS load
   uses (your Lilac lot is "083AB037") and adjust ensureParcelStub if needed.
3. Decedent ≠ owner. The deceased may have rented, or the house may be in a
   trust. match_conf (0.6–0.85) reflects this; treat single-LIKE-hit matches
   as leads to verify on propertyinfo.knoxcountytn.gov, not facts.
4. The Focus occasionally changes formatting. If a week returns 0 blocks,
   check the post manually — header wording may have shifted; update
   HEADER_RE in splitNotices().
5. PR mailing addresses are extracted when printed — that's your direct-mail
   target with zero skip-trace cost. Pull them:
   SELECT decedent_name, pr_name, pr_address FROM probate_notices
   WHERE notice_type='creditor_notice' AND pr_address IS NOT NULL
   ORDER BY id DESC;

## Backfill
The Focus archive goes back years. To backfill, temporarily replace
findLatestPostUrl() with a hardcoded list of weekly URLs and hit /run once per
URL. Estates from the last ~12 months are still live leads.
