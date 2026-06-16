// board.js — DealEdge probate lead-board (data-driven, schema-guarded)
// Routes: GET /board (HTML)  +  GET /api/board (JSON)
//
// DESIGN
//  - Every column below is checked against the live table schema before it goes
//    into the SQL. A column that doesn't exist (yet) is silently skipped, never
//    a 500. So you can list aspirational columns and they light up when enrichment
//    populates them.
//  - Strategy scores (any `*_score` column in `scores`) are auto-discovered and
//    rendered as colored chips. Add `lending_score` later -> appears automatically.
//  - Geometry is optional: if the centroid columns don't exist, the map collapses
//    to a note and the table still renders.
//
// TO TRIM: delete a line from COLUMNS. It drops from the query AND the table.
//
// SETUP:  npm i proj4   (in THIS folder)   then   npx wrangler deploy
// INTEGRATION (src/index.js):
//   import { handleBoard, handleApiBoard } from "./board.js";
//   ...inside fetch(), before the final return:
//     if (url.pathname === "/api/board") return handleApiBoard(request, env);
//     if (url.pathname === "/board")     return handleBoard(request, env);

import proj4 from "proj4";

// ---- CONFIRM ----------------------------------------------------------------
const DB_BINDING  = "DB";           // matches your wrangler.toml
const GEOM_X      = "centroid_x";   // parcels column for State Plane easting  (doesn't exist yet)
const GEOM_Y      = "centroid_y";   // parcels column for State Plane northing (doesn't exist yet)
const COLOR_SCORE = "hold_score";   // which score colors map pins (falls back to 1st score)
const SCORE_ORDER = ["flip_score", "brrrr_score", "hold_score", "lending_score"];
const SCORE_FALLBACK = ["flip_score", "brrrr_score", "hold_score"];

// Explicit display columns. src "p"=parcels, "sc"=scores. Delete lines to trim.
// NOTE — duplicate-looking pairs; check which is populated and cut the empty one:
//   appraised_total / assessed_total | sale_date / last_sale_date
//   purchase_price / last_sale_price | mail_address / mailing_address
//   motivation_norm (normalized) — raw `motivation` omitted; add back if wanted.
const COLUMNS = [
  // --- parcels ---
  { key: "owner_name_raw", src: "p",  label: "Owner",      type: "str"   },
  { key: "situs_address",  src: "p",  label: "Situs",      type: "str"   },
  { key: "situs_city",     src: "p",  label: "City",       type: "str"   },
  { key: "situs_zip",      src: "p",  label: "Zip",        type: "str"   },
  { key: "parcel_id",      src: "p",  label: "Parcel",     type: "str"   },
  { key: "zoning",         src: "p",  label: "Zoning",     type: "str"   },
  { key: "overlay",        src: "p",  label: "Overlay",    type: "str"   },
  { key: "land_use",       src: "p",  label: "Land Use",   type: "str"   },
  { key: "acreage",        src: "p",  label: "Acres",      type: "num"   },
  { key: "sqft_improved",  src: "p",  label: "SqFt",       type: "int"   },
  { key: "year_built",     src: "p",  label: "Built",      type: "int"   },
  { key: "appraised_total",src: "p",  label: "Appraised",  type: "money" },
  { key: "assessed_total", src: "p",  label: "Assessed",   type: "money" },
  { key: "est_equity",     src: "p",  label: "Est Equity", type: "money" },
  { key: "est_open_liens", src: "p",  label: "Est Liens",  type: "money" },
  { key: "sale_date",      src: "p",  label: "Sale Date",  type: "date"  },
  { key: "purchase_price", src: "p",  label: "Sale $",     type: "money" },
  { key: "mail_address",   src: "p",  label: "Mail Addr",  type: "str"   },
  { key: "mailing_state",  src: "p",  label: "Mail St",    type: "str"   },
  { key: "constraints",    src: "p",  label: "Constraints",type: "str"   },
  // --- scores (non-strategy analytics; strategy *_score are auto-chips) ---
  { key: "tier",           src: "sc", label: "Tier",       type: "badge" },
  { key: "equity_pct",     src: "sc", label: "Equity %",   type: "pct"   },
  { key: "motivation_norm",src: "sc", label: "Motiv",      type: "num"   },
  { key: "signal_count",   src: "sc", label: "Signals",    type: "int"   },
  { key: "property_type",  src: "sc", label: "Type",       type: "str"   },
  { key: "flags",          src: "sc", label: "Flags",      type: "flags" },
  { key: "scored_at",      src: "sc", label: "Scored",     type: "date"  },
];
// -----------------------------------------------------------------------------

proj4.defs(
  "EPSG:2915",
  "+proj=lcc +lat_1=35.25 +lat_2=36.41666666666666 +lat_0=34.33333333333334 " +
  "+lon_0=-86 +x_0=600000.0000000001 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 " +
  "+units=us-ft +no_defs"
);
const toWGS84 = (x, y) => proj4("EPSG:2915", "WGS84", [Number(x), Number(y)]);

async function tableCols(db, table) {
  try {
    const { results } = await db.prepare("PRAGMA table_info(" + table + ")").all();
    return new Set((results || []).map((r) => r.name));
  } catch (_) { return new Set(); }
}
function orderScores(cols) {
  const known = SCORE_ORDER.filter((k) => cols.indexOf(k) !== -1);
  const rest = cols.filter((k) => SCORE_ORDER.indexOf(k) === -1).sort();
  return known.concat(rest);
}

function buildSql(cols, scoreCols, hasGeom, colorKey) {
  const sel = cols.map((c) => c.src + '."' + c.key + '" AS "' + c.key + '"');
  scoreCols.forEach((k) => sel.push('sc."' + k + '" AS "' + k + '"'));
  if (hasGeom) {
    sel.push('p."' + GEOM_X + '" AS gx');
    sel.push('p."' + GEOM_Y + '" AS gy');
  }
  const orderCol = scoreCols.indexOf(colorKey) !== -1 ? colorKey : (scoreCols[0] || null);
  const order = orderCol ? ' ORDER BY sc."' + orderCol + '" DESC' : "";
  return "SELECT " + sel.join(", ") +
         " FROM scores sc JOIN parcels p USING(parcel_id)" + order;
}

function gate(request, env) {
  if (!env.BOARD_KEY) return null;
  const key = new URL(request.url).searchParams.get("key");
  return key === env.BOARD_KEY ? null : new Response("Unauthorized", { status: 401 });
}

export async function handleApiBoard(request, env) {
  const blocked = gate(request, env);
  if (blocked) return blocked;

  const db = env[DB_BINDING];
  if (!db) return new Response("D1 binding '" + DB_BINDING + "' not found", { status: 500 });

  const pCols = await tableCols(db, "parcels");
  const sCols = await tableCols(db, "scores");

  // keep only declared columns that actually exist in their table
  const cols = COLUMNS.filter((c) =>
    c.src === "p" ? pCols.has(c.key) : c.src === "sc" ? sCols.has(c.key) : true
  );

  // discover strategy score columns
  let scoreCols = [];
  sCols.forEach((n) => { if (/_score$/.test(n)) scoreCols.push(n); });
  scoreCols = scoreCols.length ? orderScores(scoreCols) : orderScores(SCORE_FALLBACK.filter((k) => sCols.has(k)));

  const hasGeom = pCols.has(GEOM_X) && pCols.has(GEOM_Y);
  const colorKey = scoreCols.indexOf(COLOR_SCORE) !== -1 ? COLOR_SCORE : (scoreCols[0] || null);

  let results;
  try {
    const out = await db.prepare(buildSql(cols, scoreCols, hasGeom, colorKey)).all();
    results = out.results || [];
  } catch (e) {
    return Response.json({ error: String(e), columns: cols, score_keys: scoreCols }, { status: 500 });
  }

  const rows = results.map((r) => {
    const row = {};
    cols.forEach((c) => { row[c.key] = r[c.key]; });
    const scores = {};
    scoreCols.forEach((k) => { scores[k] = r[k]; });
    row.scores = scores;
    let lat = null, lng = null;
    if (hasGeom && r.gx != null && r.gy != null) {
      try { const c = toWGS84(r.gx, r.gy); lng = c[0]; lat = c[1]; } catch (_) {}
    }
    row.lat = lat; row.lng = lng;
    return row;
  });

  return Response.json(
    { columns: cols.map((c) => ({ key: c.key, label: c.label, type: c.type })),
      score_keys: scoreCols, color_key: colorKey, has_geometry: hasGeom, rows },
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
    background:var(--bg); z-index:600; }
  header h1 { font-size:16px; margin:0; margin-right:auto; }
  button, select { background:var(--panel); color:var(--txt); border:1px solid var(--line);
    border-radius:8px; padding:7px 12px; cursor:pointer; font-size:13px; }
  button:hover { border-color:var(--accent); }
  #map { height:42vh; min-height:240px; width:100%; border-bottom:1px solid var(--line); }
  #mapnote { padding:14px 16px; color:var(--mut); border-bottom:1px solid var(--line);
    font-size:13px; background:var(--panel); }
  .scroll { overflow-x:auto; padding:0 12px 40px; }
  .meta { color:var(--mut); padding:8px 4px; font-size:12px; }
  table { border-collapse:collapse; min-width:100%; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); white-space:nowrap; }
  th { position:sticky; top:0; background:var(--panel); cursor:pointer; user-select:none;
    font-size:12px; color:var(--mut); }
  th .arr { color:var(--accent); }
  tbody tr:hover { background:#1b1f28; cursor:pointer; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  .score { display:inline-block; min-width:30px; text-align:center; border-radius:5px;
    padding:2px 6px; color:#0b0d11; font-weight:600; }
  .badge { display:inline-block; border-radius:5px; padding:2px 8px; color:#0b0d11; font-weight:600; }
  .links a { color:var(--accent); text-decoration:none; margin-right:8px; }
  .links a:hover { text-decoration:underline; }
  .pill { font-size:11px; color:var(--mut); border:1px solid var(--line); padding:1px 6px; border-radius:999px; }
  @media print {
    header, #map, #mapnote, .links, .meta { display:none !important; }
    body { background:#fff; color:#000; } .scroll { overflow:visible; }
    th, td { border-color:#ccc; }
  }
</style>
</head>
<body>
<header>
  <h1>Probate Lead Board</h1>
  <span id="count" class="pill">…</span>
  <label id="colorWrap" class="pill">Color: <select id="colorSel"></select></label>
  <button id="pdfBtn" title="Opens print dialog; choose Save as PDF">Export PDF</button>
  <button id="digestBtn" title="Phase 2 — wire to your Resend digest">Email digest</button>
</header>
<div id="map"></div>
<div id="mapnote" style="display:none"></div>
<div class="scroll">
  <div class="meta">Score chips colored per-column (red→green). Click a row to fly to its pin.</div>
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
  var SCORE_LABELS = { flip_score:"Flip", brrrr_score:"BRRRR", hold_score:"Hold", lending_score:"Lending" };
  function scoreLabel(k){ if(SCORE_LABELS[k]) return SCORE_LABELS[k];
    return k.replace(/_score$/,"").replace(/_/g," ").replace(/\\b\\w/g,function(m){return m.toUpperCase();}); }

  function kgisLink(p){ return "https://www.kgis.org/kgismaps/map.htm?parcel="+encodeURIComponent(p.parcel_id||""); }
  function assessorLink(p){ return "https://propertyinfo.knoxcountytn.gov/Datalets/Datalet.aspx?mode=parcel&UseSearch=no&pin="+encodeURIComponent(p.parcel_id||""); }
  function zillowLink(p){ return "https://www.zillow.com/homes/"+encodeURIComponent((p.situs_address||"")+", Knoxville TN")+"_rb/"; }

  var data=[], serverCols=[], scoreKeys=[], colorKey=null, hasGeom=false;
  var COLS=[], sortCol=null, sortDir=-1, ranges={}, map, markers={};

  function esc(s){ s=(s==null?"":String(s)); return s.replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function num(v){ return v==null?null:Number(v); }
  function money(v){ return v==null||v===""?"":"$"+Number(v).toLocaleString(); }
  function fmtNum(v){ if(v==null||v==="")return""; var n=Number(v); return isNaN(n)?esc(String(v)):String(Math.round(n*100)/100); }
  function fmtPct(v){ if(v==null||v==="")return""; var n=Number(v); if(isNaN(n))return""; if(Math.abs(n)<=1)n=n*100; return n.toFixed(0)+"%"; }
  function tierColor(t){ t=(t==null?"":String(t)).toUpperCase().replace(/[^A-Z]/g,"");
    if(t.indexOf("A")===0)return"#2faa5e"; if(t.indexOf("B")===0)return"#5a9bf0";
    if(t.indexOf("C")===0)return"#d39a2f"; return"#6b7280"; }

  function cellValue(row,col){ return col.type==="score" ? (row.scores?row.scores[col.key]:null) : row[col.key]; }

  function computeRanges(){
    ranges={};
    scoreKeys.forEach(function(k){
      var vs=data.map(function(p){return p.scores?num(p.scores[k]):null;}).filter(function(v){return v!=null&&!isNaN(v);});
      ranges[k]= vs.length?{min:Math.min.apply(null,vs),max:Math.max.apply(null,vs)}:{min:0,max:1};
    });
  }
  function chipColor(k,v){ if(v==null)return"#888"; var r=ranges[k]||{min:0,max:1};
    var t=r.max>r.min?(Number(v)-r.min)/(r.max-r.min):0.5; return "hsl("+Math.round(t*120)+",72%,46%)"; }

  function compare(a,b,col){
    var x=cellValue(a,col), y=cellValue(b,col);
    if(col.type==="score"||col.type==="money"||col.type==="num"||col.type==="int"||col.type==="pct"){x=num(x);y=num(y);}
    if(col.type==="date"){x=x?Date.parse(x):0;y=y?Date.parse(y):0;}
    if(x==null&&y==null)return 0; if(x==null)return 1; if(y==null)return -1;
    if(col.type==="str"||col.type==="badge"||col.type==="flags"){x=String(x).toLowerCase();y=String(y).toLowerCase();}
    return x<y?-1:x>y?1:0;
  }

  function buildCols(){
    var chips=scoreKeys.map(function(k){return{key:k,label:scoreLabel(k),type:"score"};});
    var explicit=serverCols.map(function(c){return{key:c.key,label:c.label,type:c.type};});
    COLS=explicit.concat(chips).concat([{key:"_links",label:"Links",type:"links"}]);
    sortCol=chips.filter(function(c){return c.key===colorKey;})[0]||chips[0]||explicit[0];
    sortDir=-1;
  }

  function renderHead(){
    var tr=document.getElementById("head"); tr.innerHTML="";
    COLS.forEach(function(c){
      var th=document.createElement("th");
      var arr=sortCol&&sortCol.key===c.key?(sortDir===1?" ▲":" ▼"):"";
      th.innerHTML=esc(c.label)+'<span class="arr">'+arr+"</span>";
      if(c.type!=="links"){ th.onclick=function(){
        if(sortCol&&sortCol.key===c.key)sortDir=-sortDir; else{sortCol=c;sortDir=(c.type==="str"||c.type==="badge"||c.type==="flags")?1:-1;}
        renderHead(); renderBody(); }; }
      tr.appendChild(th);
    });
  }

  function renderCell(p,c){
    if(c.type==="links"){
      return '<td class="links">'
        +'<a target="_blank" rel="noopener" href="'+esc(kgisLink(p))+'">KGIS</a>'
        +'<a target="_blank" rel="noopener" href="'+esc(assessorLink(p))+'">Assr</a>'
        +'<a target="_blank" rel="noopener" href="'+esc(zillowLink(p))+'">Zillow</a></td>';
    }
    var v=cellValue(p,c);
    if(c.type==="score"){ var chip=v==null?"—":'<span class="score" style="background:'+chipColor(c.key,v)+'">'+esc(v)+"</span>"; return '<td class="num">'+chip+"</td>"; }
    if(c.type==="money") return '<td class="num">'+esc(money(v))+"</td>";
    if(c.type==="num")   return '<td class="num">'+esc(fmtNum(v))+"</td>";
    if(c.type==="int")   return '<td class="num">'+esc(v==null?"":v)+"</td>";
    if(c.type==="pct")   return '<td class="num">'+esc(fmtPct(v))+"</td>";
    if(c.type==="badge") return "<td>"+(v==null||v===""?"":'<span class="badge" style="background:'+tierColor(v)+'">'+esc(v)+"</span>")+"</td>";
    if(c.type==="flags"){ var s=v==null?"":String(v); if(s.length>40)s=s.slice(0,40)+"…"; return "<td>"+esc(s)+"</td>"; }
    if(c.type==="date"){ var d=v==null?"":String(v); if(d.length>10)d=d.slice(0,10); return "<td>"+esc(d)+"</td>"; }
    return "<td>"+esc(v)+"</td>";
  }

  function renderBody(){
    var sorted=data.slice().sort(function(a,b){return compare(a,b,sortCol)*sortDir;});
    var rows=sorted.map(function(p){
      return '<tr data-pid="'+esc(p.parcel_id)+'">'+COLS.map(function(c){return renderCell(p,c);}).join("")+"</tr>";
    });
    var body=document.getElementById("body"); body.innerHTML=rows.join("");
    Array.prototype.forEach.call(body.querySelectorAll("tr"),function(tr){
      tr.onclick=function(){ var m=markers[tr.getAttribute("data-pid")]; if(m){map.setView(m.getLatLng(),16);m.openPopup();} };
    });
  }

  function popupHtml(p){
    var s=scoreKeys.map(function(k){return esc(scoreLabel(k))+" "+esc(p.scores?p.scores[k]:"");}).join(" &middot; ");
    return "<b>"+esc(p.situs_address||"(no address)")+"</b><br>"+esc(p.owner_name_raw||"")+"<br>"
      +"Parcel "+esc(p.parcel_id)+" &middot; "+esc(p.zoning||"?")+"<br>"+s+"<br>"
      +'<a target="_blank" rel="noopener" href="'+esc(kgisLink(p))+'">KGIS</a> &middot; '
      +'<a target="_blank" rel="noopener" href="'+esc(assessorLink(p))+'">Assessor</a> &middot; '
      +'<a target="_blank" rel="noopener" href="'+esc(zillowLink(p))+'">Zillow</a>';
  }
  function rebuildPins(){
    Object.keys(markers).forEach(function(k){map.removeLayer(markers[k]);}); markers={};
    var pts=[];
    data.forEach(function(p){
      if(p.lat==null||p.lng==null)return;
      var cv=p.scores?p.scores[colorKey]:null;
      var m=L.circleMarker([p.lat,p.lng],{radius:7,color:"#0b0d11",weight:1,fillColor:chipColor(colorKey,cv),fillOpacity:0.9}).addTo(map);
      m.bindPopup(popupHtml(p)); markers[p.parcel_id]=m; pts.push([p.lat,p.lng]);
    });
    return pts;
  }
  function buildColorSelect(){
    var sel=document.getElementById("colorSel"); sel.innerHTML="";
    scoreKeys.forEach(function(k){ var o=document.createElement("option"); o.value=k; o.textContent=scoreLabel(k);
      if(k===colorKey)o.selected=true; sel.appendChild(o); });
    sel.onchange=function(){ colorKey=sel.value; renderBody(); rebuildPins(); };
  }

  function init(resp){
    if(resp.error){ document.getElementById("body").innerHTML='<tr><td style="color:#ff6b6b">API error: '+esc(resp.error)+"</td></tr>"; return; }
    data=resp.rows||[]; serverCols=resp.columns||[]; scoreKeys=resp.score_keys||[];
    colorKey=resp.color_key||scoreKeys[0]||null; hasGeom=!!resp.has_geometry;
    document.getElementById("count").textContent=data.length+" leads";

    computeRanges(); buildCols(); renderHead(); renderBody();

    if(hasGeom){
      buildColorSelect();
      map=L.map("map",{scrollWheelZoom:true}).setView(KNOX,11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(map);
      var pts=rebuildPins(); if(pts.length)map.fitBounds(pts,{padding:[30,30],maxZoom:14});
    } else {
      document.getElementById("map").style.display="none";
      document.getElementById("colorWrap").style.display="none";
      var note=document.getElementById("mapnote"); note.style.display="block";
      note.textContent="Map disabled — no parcel centroid columns yet. Add "+ "centroid geometry to parcels and pins appear automatically.";
    }
  }

  document.getElementById("pdfBtn").onclick=function(){ window.print(); };
  document.getElementById("digestBtn").onclick=function(){ alert("Phase 2: POST this board to your Resend digest worker."); };

  fetch("/api/board"+window.location.search)
    .then(function(r){ return r.json().then(function(j){ if(!r.ok&&!j.error)throw new Error("API "+r.status); return j; }); })
    .then(init)
    .catch(function(e){ document.getElementById("body").innerHTML='<tr><td style="color:#ff6b6b">Failed to load: '+esc(e.message)+"</td></tr>"; });
})();
</script>
</body>
</html>`;
