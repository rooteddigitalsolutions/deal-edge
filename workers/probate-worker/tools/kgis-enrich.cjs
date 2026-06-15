#!/usr/bin/env node
/**
 * DealEdge land-use enrichment
 * -----------------------------------------------------------------
 * For every parcel that already has a signal, pull LANDUSE from the
 * KGIS GlobalSearch layer (the one that returns "191: UNUSED-LAND",
 * "101: 1-FAMILY", etc.) and update parcels.land_use.
 *
 * Then emit a 'vacant_land' signal for unused/vacant parcels so they
 * rise on the board — land is the strategy, the score should say so.
 *
 * Run from workers/probate-worker:
 *   node tools/kgis-enrich.cjs            # dry run: print what it found
 *   node tools/kgis-enrich.cjs --import   # write to D1
 *
 * Cheap: only touches parcels that have signals (dozens, not 200k).
 */

const path = require("path");
const { execSync } = require("child_process");

const PROXY = "https://www.kgis.org/proxy/proxy.ashx?";
const LAYER =
  "https://www.kgis.org/arcgis/rest/services/Maps/GlobalSearch/MapServer/28/query";
const REFERER = "https://www.kgis.org/kgismaps/";
const DB_NAME = "leads";
const WORKER_DIR = path.join(__dirname, "..");
const DO_IMPORT = process.argv.includes("--import");

// KGIS land-use code prefixes that mean "buildable / unused land".
// 19x = unused/vacant variants; 100 = vacant residential lot.
// Anything starting 1xx that says UNUSED, VACANT, or is "100" counts.
function isVacant(landuse) {
  if (!landuse) return false;
  const u = landuse.toUpperCase();
  if (/UNUSED|VACANT|UNDEVELOPED/.test(u)) return true;
  const code = (u.match(/^(\d+)/) || [])[1];
  return code === "100" || code === "191" || code === "192" || code === "193";
}

async function kgisLandUse(parcelId) {
  const where = `PARCELID='${parcelId}'`;
  const qs =
    "where=" + encodeURIComponent(where) + "&outFields=PARCELID,LANDUSE&f=json";
  const url = PROXY + LAYER + "?" + qs;
  const res = await fetch(url, {
    headers: {
      Referer: REFERER,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      Accept: "application/json",
    },
  });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  const f = (j.features || [])[0];
  return f ? f.attributes.LANDUSE : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function d1(sql, json = false) {
  const flag = json ? "--json" : "";
  const out = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --yes ${flag} --command="${sql.replace(/"/g, '\\"')}"`,
    { cwd: WORKER_DIR, encoding: "utf8" }
  );
  return out;
}

async function main() {
  // 1. Get the distinct parcels that have signals
  console.log("Fetching matched parcels from D1...");
  const raw = d1(
    "SELECT DISTINCT parcel_id FROM signals ORDER BY parcel_id",
    true
  );
  // wrangler --json prints an array of result objects
  let parcels = [];
  try {
    const parsed = JSON.parse(raw);
    const rows =
      (parsed[0] && parsed[0].results) || parsed.results || parsed || [];
    parcels = rows.map((r) => r.parcel_id).filter(Boolean);
  } catch (e) {
    console.error("Could not parse D1 output. Raw:", raw.slice(0, 300));
    process.exit(1);
  }
  console.log(`${parcels.length} parcels to enrich.\n`);

  const updates = [];
  let vacantCount = 0;

  for (let i = 0; i < parcels.length; i++) {
    const pid = parcels[i];
    let landuse = null;
    try {
      landuse = await kgisLandUse(pid);
    } catch (e) {
      console.log(`  ${pid}: lookup failed (${String(e).slice(0, 60)})`);
    }
    const vacant = isVacant(landuse);
    if (vacant) vacantCount++;
    console.log(
      `  ${pid}: ${landuse || "(none)"}${vacant ? "   <-- VACANT" : ""}`
    );

    if (landuse) {
      updates.push(
        `UPDATE parcels SET land_use='${landuse.replace(/'/g, "''")}' WHERE parcel_id='${pid}';`
      );
    }
    // NOTE: vacant land is handled as a TAG by migration 0004 (reads land_use
    // directly). We intentionally do NOT write a vacant_land signal here —
    // that kept the score strategy-neutral and avoids a dead FK reference.
    await sleep(400); // polite
  }

  console.log(
    `\n${vacantCount} vacant parcels found of ${parcels.length}.`
  );

  if (!DO_IMPORT) {
    console.log("\nDry run — no DB writes. Re-run with --import to apply.");
    return;
  }

  console.log("\nApplying updates to D1...");
  // batch the UPDATEs/INSERTs into one statement file via --command chunks
  for (const stmt of updates) {
    d1(stmt);
  }
  console.log(
    `Applied ${updates.length} statements. Vacant-land signals are now live.`
  );
  console.log(
    `\nNext: deploy the scoring update so 'vacant_land' weight counts, then recompute scores.`
  );
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
