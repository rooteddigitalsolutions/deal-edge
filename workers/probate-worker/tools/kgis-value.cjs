#!/usr/bin/env node
/**
 * DealEdge value enrichment  (Path 1: assessed/appraised value, no liens)
 * -----------------------------------------------------------------
 * One spatial query per parcel against PropertyAppraisedValue / layer 3
 * returns appraised value, assessed value, owner mailing address, last
 * sale date/price, and deed reference — all at once.
 *
 * Writes columns:
 *   appraised_total   INTEGER  county appraised value (land+bldg)
 *   appraised_land    INTEGER
 *   appraised_bldg    INTEGER
 *   assessed_total    INTEGER  taxable fraction
 *   mail_address      TEXT     owner mailing addr (outreach target)
 *   sale_date         TEXT     YYYY-MM-DD of last recorded sale
 *   purchase_price    INTEGER  if present (often null on old/inherited)
 *
 * HONEST LABEL: appraised_total is the COUNTY value — typically 60-80% of
 * market, worse on land. It is a deal-SIZE proxy and tax basis, NOT ARV.
 * Real value still comes from neighborhood comps. Equity here is
 * value-only; lien/debt is a manual pull on the shortlist (deeds are
 * paywalled, not scriptable).
 *
 * Run from workers/probate-worker:
 *   node tools/kgis-value.cjs            # dry run
 *   node tools/kgis-value.cjs --import   # writes to D1
 */

const path = require("path");
const { execSync } = require("child_process");

const PROXY = "https://www.kgis.org/proxy/proxy.ashx?";
const BASE = "https://www.kgis.org/arcgis/rest/services/Maps";
const GS = `${BASE}/GlobalSearch/MapServer/28/query`;
const VAL = `${BASE}/PropertyAppraisedValue/MapServer/3/query`;
const REFERER = "https://www.kgis.org/kgismaps/";
const SR = 2915;
const DB_NAME = "leads";
const WORKER_DIR = path.join(__dirname, "..");
const DO_IMPORT = process.argv.includes("--import");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function kfetch(url) {
  if (process.env.DEBUG_URL) console.error("FETCH:", url);
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

async function centroid(parcelId) {
  const url = `${PROXY}${GS}?where=PARCELID='${parcelId}'&returnGeometry=true&outFields=PARCELID&f=json`;
  const j = await kfetch(url);
  const f = (j.features || [])[0];
  if (!f || !f.geometry || !f.geometry.rings) return null;
  const ring = f.geometry.rings[0];
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  return [xs.reduce((a,b)=>a+b,0)/xs.length, ys.reduce((a,b)=>a+b,0)/ys.length];
}

// epoch-millis -> YYYY-MM-DD, or null
function epochToDate(ms) {
  if (ms === null || ms === undefined || ms === "") return null;
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function valueFor(x, y) {
  const gx = Math.round(x), gy = Math.round(y);
  const fields = [
    "PARCELID","APPRAISED_TOTAL","APPRAISED_LAND","APPRAISED_BLDG",
    "ASSESSED_TOTAL","FULL_MAIL_ADDRESS","FULL_MAIL_CITY_STATE_ZIP",
    "SALE_DATE","PURCHASE_PRICE","LANDUSE"
  ].join(",");
  const url =
    `${PROXY}${VAL}?geometry=${gx},${gy}` +
    `&geometryType=esriGeometryPoint&inSR=${SR}` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=${fields}&returnGeometry=false&f=json`;
  const j = await kfetch(url);
  const a = ((j.features || [])[0] || {}).attributes;
  if (!a) return null;
  const mail = [a.FULL_MAIL_ADDRESS, a.FULL_MAIL_CITY_STATE_ZIP]
    .filter(Boolean).join(", ");
  return {
    appraised_total: Math.round(a.APPRAISED_TOTAL || 0),
    appraised_land: Math.round(a.APPRAISED_LAND || 0),
    appraised_bldg: Math.round(a.APPRAISED_BLDG || 0),
    assessed_total: Math.round(a.ASSESSED_TOTAL || 0),
    mail_address: mail,
    sale_date: epochToDate(a.SALE_DATE),
    purchase_price: a.PURCHASE_PRICE ? Math.round(a.PURCHASE_PRICE) : null,
  };
}

function d1(sql, json = false) {
  return execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --yes ${json ? "--json" : ""} --command="${sql.replace(/"/g, '\\"')}"`,
    { cwd: WORKER_DIR, encoding: "utf8" }
  );
}

function sqlStr(v) {
  if (v === null || v === undefined) return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlNum(v) {
  return (v === null || v === undefined) ? "NULL" : Number(v);
}

async function main() {
  console.log("Fetching matched parcels...");
  const raw = d1("SELECT DISTINCT parcel_id FROM signals ORDER BY parcel_id", true);
  let parcels = [];
  try {
    const p = JSON.parse(raw);
    const rows = (p[0] && p[0].results) || p.results || p || [];
    parcels = rows.map((r) => r.parcel_id).filter(Boolean);
  } catch (e) { console.error("parse fail:", raw.slice(0,200)); process.exit(1); }
  console.log(`${parcels.length} parcels.\n`);

  const updates = [];
  for (const pid of parcels) {
    try {
      const c = await centroid(pid);
      if (!c) { console.log(`  ${pid}: no geometry`); continue; }
      await sleep(300);
      const v = await valueFor(c[0], c[1]);
      if (!v) { console.log(`  ${pid}: no value record`); continue; }
      const appr = v.appraised_total.toLocaleString();
      console.log(`  ${pid}: appraised=$${appr}  sale=${v.sale_date || "-"}  mail=${v.mail_address || "-"}`);
      updates.push(
        `UPDATE parcels SET ` +
        `appraised_total=${sqlNum(v.appraised_total)}, ` +
        `appraised_land=${sqlNum(v.appraised_land)}, ` +
        `appraised_bldg=${sqlNum(v.appraised_bldg)}, ` +
        `assessed_total=${sqlNum(v.assessed_total)}, ` +
        `mail_address=${sqlStr(v.mail_address)}, ` +
        `sale_date=${sqlStr(v.sale_date)}, ` +
        `purchase_price=${sqlNum(v.purchase_price)} ` +
        `WHERE parcel_id='${pid}';`
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
  console.log("Done. Value columns populated.");
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
