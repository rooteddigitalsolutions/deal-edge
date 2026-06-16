// board.js — DealEdge probate lead-board (data-driven scores)
// Routes: GET /board (HTML)  +  GET /api/board (JSON)
// State Plane -> WGS84 conversion happens HERE (server-side), not in the browser.
//
// DATA-DRIVEN SCORES: the worker reads the `scores` table schema at request time
// and surfaces every column ending in `_score`. Add `lending_score` (or any
// `*_score`) to the table and it appears as a sortable column + map option with
// no code change. Columns NOT ending in `_score` are ignored.
//
// INTEGRATION: if you already have a router, copy the two route branches from the
// default export into your fetch(), plus everything above the PAGE constant.
//
// SETUP:
//   cd workers/probate-worker
//   npm i proj4
//   npx wrangler secret put BOARD_KEY      # set before going public
//   npx wrangler deploy

import proj4 from "proj4";

// ---- CONFIRM THESE ----------------------------------------------------------
const DB_BINDING  = "DB";           // wrangler.toml D1 binding name (database is "leads")
const GEOM_X      = "centroid_x";   // parcels column: State Plane easting  (WKID 2915)
const GEOM_Y      = "centroid_y";   // parcels column: State Plane northing (WKID 2915)
const COLOR_SCORE = "hold_score";   // which score drives pin color (falls back to 1st score)
// Preferred left-to-right ordering of score columns; any discovered score not
// listed here is appended (alphabetically) after these.
const SCORE_ORDER = ["flip_score", "brrrr_score", "hold_score", "lending_score"];
// Fallback if schema introspection is unavailable:
const SCORE_FALLBACK = ["flip_score", "brrrr_score", "hold_score"];
// -----------------------------------------------------------------------------

// EPSG:2915 — NAD83(HARN) / Tennessee (ftUS). Canonical epsg.io definition.
proj4.defs(
  "EPSG:2915",
  "+proj=lcc +lat_1=35.25 +lat_2=36.41666666666666 +lat_0=34.33333333333334 " +
  "+lon_0=-86 +x_0=600000.0000000001 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 " +
  "+units=us-ft +no_defs"
);
const toWGS84 = (x, y) => proj4("EPSG:2915", "WGS84", [Number(x), Number(y)]); // [lng, lat]

function orderScores(cols) {
  const known = SCORE_ORDER.filter((k) => cols.indexOf(k) !== -1);
  const rest  = cols.filter((k) => SCORE_ORDER.indexOf(k) === -1).sort();
  return known.concat(rest);
}

async function discoverScoreColumns(db) {
  try {
    const { results } = await db.prepare("PRAGMA table_info(scores)").all();
    const cols = (results || []).map((r) => r.name).filter((n) => /_score$/.test(n));
    if (cols.length) return orderScores(cols);
  } catch (_) { /* PRAGMA unsupported -> fall through */ }
  return orderScores(SCORE_FALLBACK);
}

function buildSql(scoreCols, colorKey) {
  const scoreSel = scoreCols.map((c) => 'sc."' + c + '"').join(", ");
  const orderCol = scoreCols.indexOf(colorKey) !== -1 ? colorKey : (scoreCols[0] || null);
  const order = orderCol ? ' ORDER BY sc."' + orderCol + '" DESC' : "";
  return (
    "SELECT p.owner_name_raw, p.situs_address, p.parcel_id, p.zoning, p.constraints, " +
    "p.appraised_total, p.sale_date, p.mail_address, " +
    'p."' + GEOM_X + '" AS gx, p."' + GEOM_Y + '" AS gy' +
    (scoreSel ? ", " + scoreSel : "") +
    " FROM scores sc JOIN parcels p USING(parcel_id)" + order
  );
}

function gate(request, env) {
  if (!env.BOARD_KEY) return null; // open for local testing if secret unset
  const key = new URL(request.url).searchParams.get("key");
  return key === env.BOARD_KEY ? null : new Response("Unauthorized", { status: 401 });
}

export async function handleApiBoard(request, env) {
  const blocked = gate(request, env);
  if (blocked) return blocked;

  const db = env[DB_BINDING];
  if (!db) return new Response("D1 binding '" + DB_BINDING + "' not found", { status: 500 });

  const scoreCols = await discoverScoreColumns(db);
  const colorKey  = scoreCols.indexOf(COLOR_SCORE) !== -1 ? COLOR_SCORE : (scoreCols[0] || null);
  const { results } = await db.prepare(buildSql(scoreCols, colorKey)).all();

  const rows = (results || []).map((r) => {
    const scores = {};
    scoreCols.forEach((k) => { scores[k] = r[k]; });
    let lat = null, lng = null;
    if (r.gx != null && r.gy != null) {
      try { const c = toWGS84(r.gx, r.gy); lng = c[0]; lat = c[1]; } catch (_) {}
    }
    return {
      owner_name_raw: r.owner_name_raw,
      situs_address: r.situs_address,
      parcel_id: r.parcel_id,
      zoning: r.zoning,
      constraints: r.constraints,
      appraised_total: r.appraised_total,
      sale_date: r.sale_date,
      mail_address: r.mail_address,
      scores, lat, lng,
    };
  });

  return Response.json(
    { score_keys: scoreCols, color_key: colorKey, rows },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function handleBoard(request, env) {
  const blocked = gate(request, env);
  if (blocked) return blocked;
  return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/board") return handleApiBoard(request, env);
    if (pathname === "/board") return handleBoard(request, env);
    return new Response("Not found", { status: 404 });
  },
};

// ============================================================================
// CLIENT PAGE — client JS avoids template literals / ${} so this outer template
// literal stays clean. Score columns are built at runtime from the API payload.
// ============================================================================
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DealEdge — Probate Lead Board</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>
  :root { --bg:#0f1115; --panel:#171a21; --line:#262b36; --txt:#e6e9ef; --mut:#8a93a6; --accent:#4ea1ff; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--txt);
    font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header { display:flex; flex-wrap:wrap; gap:8px; align-items:center;
    padding:12px 16px; border-bottom:1px solid var(--line); position:sticky; top:0;
    background:var(--bg); z-index:500; }
  header h1 { font-size:16px; margin:0; margin-right:auto; }
  button, select { background:var(--panel); color:var(--txt); border:1px solid var(--line);
    border-radius:8px; padding:7px 12px; cursor:pointer; font-size:13px; }
  button:hover { border-color:var(--accent); }
  #map { height:42vh; min-height:280px; width:100%; border-bottom:1px solid var(--line); }
  .wrap { padding:0 12px 40px; }
  .meta { color:var(--mut); padding:8px 4px; font-size:12px; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); white-space:nowrap; }
  th { position:sticky; top:0; background:var(--panel); cursor:pointer; user-select:none;
    font-size:12px; color:var(--mut); }
  th .arr { color:var(--accent); }
  tbody tr:hover { background:#1b1f28; cursor:pointer; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  .score { display:inline-block; min-width:30px; text-align:center; border-radius:5px;
    padding:2px 6px; color:#0b0d11; font-weight:600; }
  .links a { color:var(--accent); text-decoration:none; margin-right:8px; }
  .links a:hover { text-decoration:underline; }
  .pill { font-size:11px; color:var(--mut); border:1px solid var(--line); padding:1px 6px; border-radius:999px; }
  @media print {
    header, #map, .links, .meta { display:none !important; }
    body { background:#fff; color:#000; }
    th, td { border-color:#ccc; }
  }
</style>
</head>
<body>
<header>
  <h1>Probate Lead Board</h1>
  <span id="count" class="pill">…</span>
  <label class="pill">Color: <select id="colorSel"></select></label>
  <button id="pdfBtn" title="Opens print dialog; choose Save as PDF">Export PDF</button>
  <button id="digestBtn" title="Phase 2 — wire to your Resend digest">Email digest</button>
</header>
<div id="map"></div>
<div class="wrap">
  <div class="meta">Pin color = selected score (relative, red→green). Click a row to fly to its pin.</div>
  <table>
    <thead><tr id="head"></tr></thead>
    <tbody id="body"></tbody>
  </table>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function () {
  var KNOX = [35.9606, -83.9207];

  // Pretty labels for known scores; anything else is humanized from the key.
  var SCORE_LABELS = { flip_score:"Flip", brrrr_score:"BRRRR", hold_score:"Hold", lending_score:"Lending" };
  function scoreLabel(key) {
    if (SCORE_LABELS[key]) return SCORE_LABELS[key];
    return key.replace(/_score$/, "").replace(/_/g, " ")
              .replace(/\\b\\w/g, function (m) { return m.toUpperCase(); });
  }

  var FIXED = [
    { key:"owner_name_raw", label:"Owner", type:"str" },
    { key:"situs_address",  label:"Situs Address", type:"str" },
    { key:"parcel_id",      label:"Parcel", type:"str" },
    { key:"zoning",         label:"Zoning", type:"str" },
    { key:"constraints",    label:"Constraints", type:"str" },
    { key:"appraised_total",label:"Appraised", type:"money" },
    { key:"sale_date",      label:"Sale Date", type:"date" }
  ];

  // ---- external links (VERIFY county formats) ------------------------------
  function kgisLink(p)     { return "https://www.kgis.org/kgismaps/map.htm?parcel=" + encodeURIComponent(p.parcel_id || ""); }
  function assessorLink(p) { return "https://propertyinfo.knoxcountytn.gov/Datalets/Datalet.aspx?mode=parcel&UseSearch=no&pin=" + encodeURIComponent(p.parcel_id || ""); }
  function zillowLink(p)   { return "https://www.zillow.com/homes/" + encodeURIComponent((p.situs_address || "") + ", Knoxville TN") + "_rb/"; }

  var data = [], scoreKeys = [], colorKey = null;
  var COLS = [], sortCol = null, sortDir = -1;
  var map, markers = {}, cMin = 0, cMax = 1;

  function esc(s) {
    s = (s == null ? "" : String(s));
    return s.replace(/[&<>"']/g, function (c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function money(v) { return v == null ? "" : "$" + Number(v).toLocaleString(); }
  function num(v) { return v == null ? null : Number(v); }

  function cellValue(row, col) {
    if (col.type === "score") return row.scores ? row.scores[col.key] : null;
    return row[col.key];
  }

  function colorFor(score) {
    if (score == null) return "#888";
    var t = cMax > cMin ? (Number(score) - cMin) / (cMax - cMin) : 0.5;
    return "hsl(" + Math.round(t * 120) + ", 72%, 46%)";
  }
  function recomputeColorRange() {
    var vals = data.map(function (p) { return p.scores ? num(p.scores[colorKey]) : null; })
                   .filter(function (v) { return v != null && !isNaN(v); });
    if (vals.length) { cMin = Math.min.apply(null, vals); cMax = Math.max.apply(null, vals); }
    else { cMin = 0; cMax = 1; }
  }

  function compare(a, b, col) {
    var x = cellValue(a, col), y = cellValue(b, col);
    if (col.type === "score" || col.type === "money") { x = num(x); y = num(y); }
    if (col.type === "date") { x = x ? Date.parse(x) : 0; y = y ? Date.parse(y) : 0; }
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (col.type === "str") { x = String(x).toLowerCase(); y = String(y).toLowerCase(); }
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function buildCols() {
    var scoreCols = scoreKeys.map(function (k) { return { key:k, label:scoreLabel(k), type:"score" }; });
    COLS = FIXED.concat(scoreCols).concat([{ key:"_links", label:"Links", type:"links" }]);
    sortCol = scoreCols.filter(function (c) { return c.key === colorKey; })[0]
           || scoreCols[0] || FIXED[0];
    sortDir = -1;
  }

  function renderHead() {
    var tr = document.getElementById("head");
    tr.innerHTML = "";
    COLS.forEach(function (c) {
      var th = document.createElement("th");
      var arr = sortCol && sortCol.key === c.key ? (sortDir === 1 ? " ▲" : " ▼") : "";
      th.innerHTML = esc(c.label) + '<span class="arr">' + arr + "</span>";
      if (c.type !== "links") {
        th.onclick = function () {
          if (sortCol && sortCol.key === c.key) sortDir = -sortDir;
          else { sortCol = c; sortDir = (c.type === "str") ? 1 : -1; }
          renderHead(); renderBody();
        };
      }
      tr.appendChild(th);
    });
  }

  function renderBody() {
    var sorted = data.slice().sort(function (a, b) { return compare(a, b, sortCol) * sortDir; });
    var rows = sorted.map(function (p) {
      var cells = COLS.map(function (c) {
        if (c.type === "links") {
          return '<td class="links">'
            + '<a target="_blank" rel="noopener" href="' + esc(kgisLink(p)) + '">KGIS</a>'
            + '<a target="_blank" rel="noopener" href="' + esc(assessorLink(p)) + '">Assr</a>'
            + '<a target="_blank" rel="noopener" href="' + esc(zillowLink(p)) + '">Zillow</a>'
            + "</td>";
        }
        if (c.type === "score") {
          var v = cellValue(p, c);
          var chip = v == null ? "—"
            : '<span class="score" style="background:' + colorFor(v) + '">' + esc(v) + "</span>";
          return '<td class="num">' + chip + "</td>";
        }
        if (c.type === "money") return '<td class="num">' + esc(money(cellValue(p, c))) + "</td>";
        return "<td>" + esc(cellValue(p, c)) + "</td>";
      });
      return '<tr data-pid="' + esc(p.parcel_id) + '">' + cells.join("") + "</tr>";
    });
    var body = document.getElementById("body");
    body.innerHTML = rows.join("");
    Array.prototype.forEach.call(body.querySelectorAll("tr"), function (tr) {
      tr.onclick = function () {
        var m = markers[tr.getAttribute("data-pid")];
        if (m) { map.setView(m.getLatLng(), 16); m.openPopup(); }
      };
    });
  }

  function popupHtml(p) {
    var s = scoreKeys.map(function (k) {
      return esc(scoreLabel(k)) + " " + esc(p.scores ? p.scores[k] : "");
    }).join(" &middot; ");
    return "<b>" + esc(p.situs_address || "(no address)") + "</b><br>"
      + esc(p.owner_name_raw || "") + "<br>"
      + "Parcel " + esc(p.parcel_id) + " &middot; " + esc(p.zoning || "?") + "<br>"
      + s + "<br>"
      + '<a target="_blank" rel="noopener" href="' + esc(kgisLink(p)) + '">KGIS</a> &middot; '
      + '<a target="_blank" rel="noopener" href="' + esc(assessorLink(p)) + '">Assessor</a> &middot; '
      + '<a target="_blank" rel="noopener" href="' + esc(zillowLink(p)) + '">Zillow</a>';
  }

  function rebuildPins() {
    Object.keys(markers).forEach(function (k) { map.removeLayer(markers[k]); });
    markers = {};
    var pts = [];
    data.forEach(function (p) {
      if (p.lat == null || p.lng == null) return;
      var cv = p.scores ? p.scores[colorKey] : null;
      var m = L.circleMarker([p.lat, p.lng], {
        radius: 7, color: "#0b0d11", weight: 1, fillColor: colorFor(cv), fillOpacity: 0.9
      }).addTo(map);
      m.bindPopup(popupHtml(p));
      markers[p.parcel_id] = m;
      pts.push([p.lat, p.lng]);
    });
    return pts;
  }

  function buildColorSelect() {
    var sel = document.getElementById("colorSel");
    sel.innerHTML = "";
    scoreKeys.forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = scoreLabel(k);
      if (k === colorKey) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () {
      colorKey = sel.value;
      recomputeColorRange();
      renderBody();
      rebuildPins();
    };
  }

  function init(resp) {
    data      = resp.rows || [];
    scoreKeys = resp.score_keys || [];
    colorKey  = resp.color_key || scoreKeys[0] || null;
    document.getElementById("count").textContent = data.length + " leads";

    buildCols();
    buildColorSelect();
    recomputeColorRange();
    renderHead();
    renderBody();

    map = L.map("map", { scrollWheelZoom: true }).setView(KNOX, 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap"
    }).addTo(map);
    var pts = rebuildPins();
    if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
  }

  document.getElementById("pdfBtn").onclick = function () { window.print(); };
  document.getElementById("digestBtn").onclick = function () {
    alert("Phase 2: POST this board to your Resend digest worker.");
  };

  fetch("/api/board" + window.location.search)
    .then(function (r) { if (!r.ok) throw new Error("API " + r.status); return r.json(); })
    .then(init)
    .catch(function (e) {
      document.getElementById("body").innerHTML =
        '<tr><td colspan="12" style="color:#ff6b6b">Failed to load: ' + esc(e.message) + "</td></tr>";
    });
})();
</script>
</body>
</html>`;
