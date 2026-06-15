#!/usr/bin/env node
/**
 * DealEdge buildability enrichment
 * -----------------------------------------------------------------
 * For each matched parcel (has a signal), this:
 *   1. pulls the parcel polygon from GlobalSearch, computes a centroid
 *   2. spatially queries each constraint layer at that point:
 *        - city zoning   (Zoning_Dynamic / 98)  -> ZONE1
 *        - county zoning (Zoning_Dynamic / 99)  -> ZONE1   (fallback if no city)
 *        - hillside      (Zoning_Dynamic / 76)  -> OVERLAY_TYPE 'HP'
 *        - floodplain    (Zoning_Dynamic / 77)  -> present = flood
 *        - city overlays (Zoning_Dynamic / 74)  -> OVERLAY_TYPE (historic, etc.)
 *        - county overlay(Zoning_Dynamic / 80)  -> OVERLAY_TYPE
 *   3. writes parcels.zoning + parcels.constraints (e.g. "HP,FLOOD")
 *
 * Scores are NOT touched. This is information shown beside them.
 *
 * Run from workers/probate-worker:
 *   node tools/kgis-buildability.cjs            # dry run, prints findings
 *   node tools/kgis-buildability.cjs --import   # writes to D1
 *
 * GUARD: every spatial query verifies it actually filtered. If a layer
 * ever returns more than a handful of features for one point, we treat
 * it as a FAILED filter (not a real hit) and skip it, so we never
 * false-flag a parcel as HP/flood. (Learned from the layer-76 behavior
 * where a dropped geometry returns every polygon in the county.)
 */

const path = require("path");
const { execSync } = require("child_process");

const PROXY = "https://www.kgis.org/proxy/proxy.ashx?";
const BASE = "https://www.kgis.org/arcgis/rest/services/Maps";
const GS = `${BASE}/GlobalSearch/MapServer/28/query`;
const ZON = `${BASE}/Zoning_Dynamic/MapServer`;
const REFERER = "https://www.kgis.org/kgismaps/";
const SR = 2915;
const DB_NAME = "leads";
const WORKER_DIR = path.join(__dirname, "..");
const DO_IMPORT = process.argv.includes("--import");

// If a "point" query returns more than this, the spatial filter failed.
const FILTER_SANITY_MAX = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function kfetch(url) {
  const res = await fetch(url, {
    headers: {
      Referer: REFERER,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      Accept: "application/json",
    },
  });
  const t = await res.text();
  let j;
  try { j = JSON.parse(t); } catch { throw new Error("non-JSON: " + t.slice(0,120)); }
  if (j.error) throw new Error("KGIS: " + JSON.stringify(j.error));
  return j;
}

// centroid of the parcel polygon (average of outer ring vertices)
async function centroid(parcelId) {
  const url = `${PROXY}${GS}?where=${encodeURIComponent(`PARCELID='${parcelId}'`)}&returnGeometry=true&outFields=PARCELID&f=json`;
  const j = await kfetch(url);
  const f = (j.features || [])[0];
  if (!f || !f.geometry || !f.geometry.rings) return null;
  const ring = f.geometry.rings[0];
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  return [xs.reduce((a,b)=>a+b,0)/xs.length, ys.reduce((a,b)=>a+b,0)/ys.length];
}

// spatial point query against a layer; returns {features, filtered}
async function pointQuery(layerId, x, y, outFields) {
  const url =
    `${PROXY}${ZON}/${layerId}/query?geometry=${x},${y}` +
    `&geometryType=esriGeometryPoint&inSR=${SR}` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=${encodeURIComponent(outFields)}&returnGeometry=false&f=json`;
  const j = await kfetch(url);
  const feats = j.features || [];
  // GUARD: too many features = filter didn't apply -> not trustworthy
  const filtered = feats.length <= FILTER_SANITY_MAX;
  return { features: filtered ? feats : [], filtered };
}

async function zoningFor(x, y) {
  // city first, then county fallback
  let r = await pointQuery(98, x, y, "ZONE1,ZONE_LABEL");
  let z = (r.features[0] || {}).attributes;
  if (z && z.ZONE1 && z.ZONE1 !== "ROW") return z.ZONE1;
  await sleep(300);
  r = await pointQuery(99, x, y, "ZONE1,ZONE_LABEL");
  z = (r.features[0] || {}).attributes;
  if (z && z.ZONE1 && z.ZONE1 !== "ROW") return z.ZONE1;
  return z && z.ZONE1 ? z.ZONE1 : null; // may be ROW or null
}

async function overlayFor(layerId, x, y) {
  const r = await pointQuery(layerId, x, y, "OVERLAY_TYPE");
  const types = r.features
    .map((f) => f.attributes.OVERLAY_TYPE)
    .filter(Boolean);
  return [...new Set(types)];
}

function d1(sql, json = false) {
  return execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --yes ${json ? "--json" : ""} --command="${sql.replace(/"/g, '\\"')}"`,
    { cwd: WORKER_DIR, encoding: "utf8" }
  );
}

async function main() {
  console.log("Fetching matched parcels...");
  const raw = d1("SELECT DISTINCT parcel_id FROM signals ORDER BY parcel_id", true);
  let parcels = [];
  try {
    const p = JSON.parse(raw);
    const rows = (p[0] && p[0].results) || p.results || p || [];
    parcels = rows.map((r) => r.parcel_id).filter(Boolean);
  } catch (e) {
    console.error("parse fail:", raw.slice(0, 200)); process.exit(1);
  }
  console.log(`${parcels.length} parcels.\n`);

  const updates = [];
  for (let i = 0; i < parcels.length; i++) {
    const pid = parcels[i];
    try {
      const c = await centroid(pid);
      if (!c) { console.log(`  ${pid}: no geometry`); continue; }
      const [x, y] = c;
      await sleep(300);
      const zoning = await zoningFor(x, y);
      await sleep(300);
      const constraints = [];
      const hp = await overlayFor(76, x, y);
      if (hp.includes("HP")) constraints.push("HP");
      await sleep(300);
      const flood = await pointQuery(77, x, y, "OVERLAY_TYPE");
      if (flood.features.length > 0) constraints.push("FLOOD");
      await sleep(300);
      const cityOv = await overlayFor(74, x, y);
      await sleep(300);
      const cntyOv = await overlayFor(80, x, y);
      for (const o of [...cityOv, ...cntyOv]) {
        if (o && o !== "HP" && !constraints.includes(o)) constraints.push(o);
      }

      const cstr = constraints.join(",");
      console.log(`  ${pid}: zoning=${zoning || "?"}  constraints=${cstr || "(none)"}`);
      updates.push(
        `UPDATE parcels SET zoning='${(zoning||"").replace(/'/g,"''")}', ` +
        `constraints='${cstr.replace(/'/g,"''")}' WHERE parcel_id='${pid}';`
      );
    } catch (e) {
      console.log(`  ${pid}: ERROR ${String(e).slice(0,80)}`);
    }
    await sleep(400);
  }

  if (!DO_IMPORT) {
    console.log(`\nDry run — ${updates.length} parcels resolved. Re-run with --import to write.`);
    return;
  }
  console.log(`\nWriting ${updates.length} updates to D1...`);
  for (const u of updates) d1(u);
  console.log("Done. zoning + constraints columns populated.");
  console.log("Next: add the columns to your board query to see them beside the scores.");
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
