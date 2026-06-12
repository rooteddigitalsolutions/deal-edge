#!/usr/bin/env node
/**
 * DealEdge KGIS parcel loader
 * ---------------------------------------------------------------
 * Pages KGIS.VIEW_PARCEL_ADDR_OWNER (QueryTasks table 13) through
 * the KGIS proxy and upserts every Knox County parcel into D1.
 *
 * Run from workers/probate-worker:
 *   node tools/kgis-load.js              # fetch + generate SQL chunks
 *   node tools/kgis-load.js --import     # ...and import each chunk via wrangler
 *
 * Resume-safe: keeps progress in tools/.kgis-progress.json
 * Polite: 1 request/second, browser-like headers.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PROXY = "https://www.kgis.org/proxy/proxy.ashx?";
const TABLE_URL =
  "https://www.kgis.org/arcgis/rest/services/Maps/QueryTasks/MapServer/13/query";
const REFERER = "https://www.kgis.org/kgismaps/";
const PAGE_SIZE = 2000;
const DB_NAME = "leads";
const OUT_DIR = path.join(__dirname, "kgis_sql");
const PROGRESS_FILE = path.join(__dirname, ".kgis-progress.json");
const ROWS_PER_SQL_FILE = 10000;

const DO_IMPORT = process.argv.includes("--import");

// ---------------------------------------------------------------
async function kgisFetch(params) {
  // Manual encoding: ArcGIS + this proxy want %20, not '+', for spaces
  const qs = Object.entries(params)
    .map(([k, v]) => k + "=" + encodeURIComponent(v))
    .join("&");
  const url = PROXY + TABLE_URL + "?" + qs;
  const res = await fetch(url, {
    headers: {
      Referer: REFERER,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Non-JSON response (proxy blocked?): " + text.slice(0, 200));
  }
  if (json.error) throw new Error("KGIS error: " + JSON.stringify(json.error));
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------
// Field mapping: discover actual field names on first page, then
// map by pattern so we survive KGIS renames.
function buildFieldMap(fields) {
  const names = fields.map((f) => f.name);
  const pick = (...patterns) => {
    for (const p of patterns) {
      const hit = names.find((n) => n.toUpperCase() === p);
      if (hit) return hit;
    }
    for (const p of patterns) {
      const hit = names.find((n) => n.toUpperCase().includes(p));
      if (hit) return hit;
    }
    return null;
  };
  const map = {
    objectid: pick("OBJECTID", "OID"),
    parcel_id: pick("PARCELID", "PARCEL_ID", "PIN"),
    owner: pick("OWNER", "OWNERNAME", "OWNER_NAME"),
    situs: pick("FULL_ADDRESS", "SITE_ADDR", "PROP_ADDR", "ADDRESS"),
    own_addr: pick("OWNER_ADDR", "MAIL_ADDR", "CAREOF", "ADDR1"),
    own_city: pick("OWNER_CITY", "MAIL_CITY", "CITY"),
    own_state: pick("OWNER_STATE", "MAIL_STATE", "STATE"),
    own_zip: pick("OWNER_ZIP", "MAIL_ZIP", "ZIP"),
    landuse: pick("LANDUSE", "LAND_USE", "LUC"),
  };
  console.log("Field map:", map);
  if (!map.parcel_id || !map.owner) {
    console.error("\nAvailable fields were:", names.join(", "));
    throw new Error(
      "Could not find PARCELID/OWNER fields — paste the field list above back into Claude."
    );
  }
  return map;
}

const normParcel = (s) =>
  (s || "").toUpperCase().replace(/[\s#.\-]/g, "");

const q = (s) =>
  s === null || s === undefined ? "NULL" : "'" + String(s).replace(/'/g, "''").trim() + "'";

function rowToSql(attrs, m) {
  const pid = normParcel(attrs[m.parcel_id]);
  if (!pid) return null;
  const mailing =
    m.own_addr && attrs[m.own_addr]
      ? [attrs[m.own_addr], m.own_city && attrs[m.own_city], m.own_state && attrs[m.own_state], m.own_zip && attrs[m.own_zip]]
          .filter(Boolean)
          .join(", ")
      : null;
  return (
    `INSERT INTO parcels (parcel_id, situs_address, owner_name_raw, mailing_address, mailing_state, land_use) VALUES (` +
    [
      q(pid),
      q(attrs[m.situs] ?? null),
      q(attrs[m.owner] ?? null),
      q(mailing),
      q(m.own_state ? attrs[m.own_state] ?? null : null),
      q(m.landuse ? attrs[m.landuse] ?? null : null),
    ].join(",") +
    `) ON CONFLICT(parcel_id) DO UPDATE SET ` +
    `situs_address=COALESCE(excluded.situs_address, parcels.situs_address), ` +
    `owner_name_raw=excluded.owner_name_raw, ` +
    `mailing_address=excluded.mailing_address, ` +
    `mailing_state=excluded.mailing_state, ` +
    `land_use=COALESCE(excluded.land_use, parcels.land_use), ` +
    `updated_at=datetime('now');`
  );
}


// In window mode the loop already advanced lastObjectId via max(OID); ensure
// we never go backwards and always clear the current window.
function windowEnd(lastId, feats, m) {
  return lastId; // max OID was already recorded per-feature in the main loop
}

// ---------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let progress = { lastObjectId: 0, fileIndex: 0, total: 0 };
  if (fs.existsSync(PROGRESS_FILE))
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));

  let fieldMap = null;
  let buffer = [];
  let page = 0;
  let emptyStreak = 0;

  const flush = () => {
    if (!buffer.length) return;
    progress.fileIndex++;
    const file = path.join(
      OUT_DIR,
      `parcels_${String(progress.fileIndex).padStart(3, "0")}.sql`
    );
    fs.writeFileSync(file, buffer.join("\n") + "\n");
    console.log(`  wrote ${file} (${buffer.length} rows)`);
    if (DO_IMPORT) {
      console.log(`  importing ${path.basename(file)} into D1...`);
      execSync(
        `npx wrangler d1 execute ${DB_NAME} --remote --yes --file="${file}"`,
        { stdio: "inherit", cwd: path.join(__dirname, "..") }
      );
    }
    buffer = [];
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
  };

  console.log(
    `Starting KGIS load from OBJECTID > ${progress.lastObjectId} (resume-safe)`
  );

  // Strategy A: ordered paging. Strategy C fallback: fixed OBJECTID windows
  // (works on every ArcGIS version, just makes a few empty calls).
  let strategy = "A";

  while (true) {
    page++;
    let data;
    if (strategy === "A") {
      try {
        data = await kgisFetch({
          f: "json",
          where: `OBJECTID > ${progress.lastObjectId}`,
          orderByFields: "OBJECTID",
          outFields: "*",
          resultRecordCount: String(PAGE_SIZE),
        });
      } catch (e) {
        console.log("Strategy A rejected (" + e.message.slice(0, 80) + "...), falling back to OBJECTID windows");
        strategy = "C";
      }
    }
    if (strategy === "C") {
      data = await kgisFetch({
        f: "json",
        where: `OBJECTID > ${progress.lastObjectId} AND OBJECTID <= ${progress.lastObjectId + PAGE_SIZE}`,
        outFields: "*",
      });
    }

    if (!fieldMap) fieldMap = buildFieldMap(data.fields || []);
    const feats = data.features || [];
    if (!feats.length) {
      if (strategy === "C") {
        progress.lastObjectId += PAGE_SIZE; // empty window: skip ahead
        emptyStreak++;
        if (emptyStreak >= 50) break; // 100k empty IDs in a row = end of table
        continue;
      }
      break;
    }
    emptyStreak = 0;

    for (const f of feats) {
      const sql = rowToSql(f.attributes, fieldMap);
      if (sql) {
        buffer.push(sql);
        progress.total++;
      }
      const oid = f.attributes[fieldMap.objectid];
      if (oid > progress.lastObjectId) progress.lastObjectId = oid;
    }

    console.log(
      `page ${page}: +${feats.length} rows (total ${progress.total}, lastOID ${progress.lastObjectId})`
    );

    if (buffer.length >= ROWS_PER_SQL_FILE) flush();
    if (strategy === "A" && feats.length < PAGE_SIZE) break; // last page
    if (strategy === "C") progress.lastObjectId = windowEnd(progress.lastObjectId, feats, fieldMap);
    await sleep(1000); // be polite
  }

  flush();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
  console.log(`\nDone. ${progress.total} parcels across ${progress.fileIndex} SQL files in tools/kgis_sql/`);
  if (!DO_IMPORT) {
    console.log(`\nTo import, either re-run with --import, or run for each file:`);
    console.log(`  npx wrangler d1 execute ${DB_NAME} --remote --yes --file=tools/kgis_sql/parcels_001.sql`);
  } else {
    console.log(`All chunks imported. Now hit your worker's /run URL to sweep pending notices against the loaded parcels.`);
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  console.error("Progress is saved — re-running resumes where it stopped.");
  process.exit(1);
});
