#!/usr/bin/env node
/**
 * DealEdge KGIS parcel loader (v2 — matched to actual table schema)
 * -----------------------------------------------------------------
 * Source: KGIS.VIEW_PARCEL_ADDR_OWNER (Maps/QueryTasks/MapServer/13)
 * Fields: ADDR_ID (OID), PARCELID, ADDRESS_NUM, ADDRESS_NUM_SUF,
 *         STREET_NAME, UNIT, OWNER, ACTIVE, UNIT_TYPE, OWN_MOD_FLAG
 * Note:   no mailing address in this view — owner-name matching only;
 *         absentee detection comes from per-lead enrichment later.
 *
 * Run from workers/probate-worker:
 *   node tools/kgis-load.cjs              # fetch + write SQL chunks
 *   node tools/kgis-load.cjs --import     # ...and import each into D1
 *
 * Resume-safe via tools/.kgis-progress.json. Polite: 1 req/sec.
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

const normParcel = (s) => (s || "").toUpperCase().replace(/[\s#.\-]/g, "");

const q = (s) =>
  s === null || s === undefined || s === ""
    ? "NULL"
    : "'" + String(s).replace(/'/g, "''").trim() + "'";

function rowToSql(a) {
  const pid = normParcel(a.PARCELID);
  if (!pid) return null;
  if (a.ACTIVE && a.ACTIVE !== "Y") return null; // retired address points
  const situs = [
    a.ADDRESS_NUM,
    a.ADDRESS_NUM_SUF,
    a.STREET_NAME,
    a.UNIT ? "UNIT " + a.UNIT : null,
  ]
    .filter((x) => x !== null && x !== undefined && x !== "")
    .join(" ");
  return (
    `INSERT INTO parcels (parcel_id, situs_address, owner_name_raw) VALUES (` +
    [q(pid), q(situs || null), q(a.OWNER ?? null)].join(",") +
    `) ON CONFLICT(parcel_id) DO UPDATE SET ` +
    `situs_address=COALESCE(excluded.situs_address, parcels.situs_address), ` +
    `owner_name_raw=excluded.owner_name_raw, ` +
    `updated_at=datetime('now');`
  );
}

// ---------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let progress = { lastId: 0, fileIndex: 0, total: 0 };
  if (fs.existsSync(PROGRESS_FILE))
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));

  let buffer = [];
  let page = 0;

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

  console.log(`Starting KGIS load from ADDR_ID > ${progress.lastId} (resume-safe)`);

  while (true) {
    page++;
    const data = await kgisFetch({
      f: "json",
      where: `ADDR_ID > ${progress.lastId}`,
      orderByFields: "ADDR_ID",
      outFields: "*",
      resultRecordCount: String(PAGE_SIZE),
    });

    const feats = data.features || [];
    if (!feats.length) break;

    for (const f of feats) {
      const sql = rowToSql(f.attributes);
      if (sql) {
        buffer.push(sql);
        progress.total++;
      }
      if (f.attributes.ADDR_ID > progress.lastId)
        progress.lastId = f.attributes.ADDR_ID;
    }

    console.log(
      `page ${page}: +${feats.length} rows (kept ${progress.total}, lastId ${progress.lastId})`
    );

    if (buffer.length >= ROWS_PER_SQL_FILE) flush();
    if (feats.length < PAGE_SIZE) break; // last page
    await sleep(1000); // be polite
  }

  flush();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
  console.log(
    `\nDone. ${progress.total} address/owner rows across ${progress.fileIndex} SQL files in tools/kgis_sql/`
  );
  if (!DO_IMPORT) {
    console.log(`\nTo import, re-run with --import, or per file:`);
    console.log(
      `  npx wrangler d1 execute ${DB_NAME} --remote --yes --file=tools/kgis_sql/parcels_001.sql`
    );
  } else {
    console.log(
      `All chunks imported. Now hit your worker's /run URL to sweep the 36 pending notices against the loaded parcels.`
    );
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  console.error("Progress is saved — re-running resumes where it stopped.");
  process.exit(1);
});
