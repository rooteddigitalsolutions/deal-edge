/**
 * DealEdge probate-worker
 * ------------------------------------------------------------
 * Weekly pipeline:
 *   1. Find the newest "Legal and public notices" post on knoxfocus.com
 *   2. Fetch it, strip to text, split into individual notice blocks
 *   3. Haiku extracts structured JSON per block
 *   4. Store raw extractions in probate_notices (idempotent)
 *   5. Promote to signals:
 *        - foreclosure w/ parcel ID  -> direct signal (conf 1.0)
 *        - petition_to_sell w/ addr  -> match by address
 *        - creditor_notice           -> fuzzy name match vs parcels.owner_name_raw
 *
 * Manual run:  GET https://<worker>/run
 * Review:      GET https://<worker>/pending   (unmatched notices)
 */

const FOCUS_CATEGORY_URL =
  "https://www.knoxfocus.com/category/archives/public-notice/";
const POST_URL_RE =
  /https:\/\/www\.knoxfocus\.com\/archives\/public-notice\/legal-and-public-notices-for-the-week-of-[a-z0-9-]+\//g;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runPipeline(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/run") {
      const result = await runPipeline(env);
      return json(result);
    }
    if (url.pathname === "/pending") {
      const rows = await env.DB.prepare(
        "SELECT id, notice_type, decedent_name, property_address, parcel_id, published_week FROM probate_notices WHERE matched = 0 ORDER BY id DESC LIMIT 100"
      ).all();
      return json(rows.results);
    }
    return new Response("dealedge-probate-worker: /run /pending", { status: 200 });
  },
};

// ------------------------------------------------------------
// Pipeline
// ------------------------------------------------------------
async function runPipeline(env) {
  const postUrl = await findLatestPostUrl();
  if (!postUrl) return { ok: false, error: "no post url found on category page" };

  const already = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM probate_notices WHERE source_url = ?"
  ).bind(postUrl).first();
  // Re-running the same issue is safe (UNIQUE constraint) but skip the LLM spend.
  if (already && already.n > 0) {
    const matched = await matchPending(env);
    return { ok: true, skipped: "issue already ingested", url: postUrl, ...matched };
  }

  const text = await fetchPostText(postUrl);
  const blocks = splitNotices(text);
  const week = weekFromUrl(postUrl);

  let inserted = 0;
  for (const block of blocks) {
    const extracted = await extractNotices(env, block);
    for (const n of extracted) {
      const ok = await insertNotice(env, n, postUrl, week, block);
      if (ok) inserted++;
    }
  }

  const matched = await matchPending(env);
  return { ok: true, url: postUrl, blocks: blocks.length, inserted, ...matched };
}

// ------------------------------------------------------------
// 1. Discover newest post (category page lists most recent first)
// ------------------------------------------------------------
async function findLatestPostUrl() {
  const res = await fetch(FOCUS_CATEGORY_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (DealEdge research; contact: adam@dealedge.io)" },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const matches = html.match(POST_URL_RE);
  return matches && matches.length ? matches[0] : null;
}

// ------------------------------------------------------------
// 2. Fetch post, strip HTML to text
// ------------------------------------------------------------
async function fetchPostText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (DealEdge research; contact: adam@dealedge.io)" },
  });
  const html = await res.text();
  // Crude but effective: drop scripts/styles, strip tags, collapse whitespace.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ------------------------------------------------------------
// 3. Split into notice blocks on the headers the Focus uses
// ------------------------------------------------------------
function splitNotices(text) {
  const HEADER_RE =
    /(NOTICE TO CREDITORS|TRUSTEE'?S NOTICE OF FORECLOSURE SALE|NOTICE OF FORECLOSURE|NOTICE OF (SUBSTITUTE )?TRUSTEE'?S SALE|SUBSTITUTE TRUSTEE'?S SALE|NOTICE OF SALE|NOTICE OF SERVICE BY PUBLICATION)/g;
  const indices = [];
  let m;
  while ((m = HEADER_RE.exec(text)) !== null) indices.push(m.index);
  if (!indices.length) return [];

  const blocks = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : Math.min(text.length, start + 8000);
    const block = text.slice(start, end).trim();
    // Skip juvenile/divorce service notices etc. unless they mention real property
    if (
      block.startsWith("NOTICE OF SERVICE BY PUBLICATION") &&
      !/REAL PROPERTY|SELL/i.test(block)
    )
      continue;
    if (block.length > 200) blocks.push(block.slice(0, 8000));
  }
  return blocks;
}

// ------------------------------------------------------------
// 4. Haiku extraction -> JSON
// ------------------------------------------------------------
async function extractNotices(env, block) {
  const prompt = `Extract structured data from this Knox County legal notice. Respond with ONLY a JSON array (no markdown, no prose). Each object:
{
  "notice_type": "creditor_notice" | "petition_to_sell" | "foreclosure",
  "decedent_name": string|null,        // decedent for estates; borrower for foreclosures
  "docket_number": string|null,        // estate docket no, case no, or instrument number
  "date_of_death": "YYYY-MM-DD"|null,
  "letters_date": "YYYY-MM-DD"|null,   // letters issued date; for foreclosures use the SALE date
  "pr_name": string|null,              // personal representative / substitute trustee
  "pr_address": string|null,           // PR mailing address if printed
  "property_address": string|null,     // street address of real property if printed
  "parcel_id": string|null             // e.g. from "Property Tax ID#093FC-028.01" -> "093FC02801" style: strip "Property Tax ID#", keep as printed minus spaces
}
Rules:
- "NOTICE TO CREDITORS" -> creditor_notice
- "Petition to Sell Real Property" -> petition_to_sell
- Trustee/foreclosure sale -> foreclosure
- If the block contains no estate or foreclosure data, return []
- Dates must be ISO. Names UPPERCASE as printed.

NOTICE TEXT:
${block}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error("anthropic error", res.status, await res.text());
    return [];
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const arr = JSON.parse(clean);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error("json parse failed", text.slice(0, 200));
    return [];
  }
}

// ------------------------------------------------------------
// 5a. Insert raw notice (idempotent via UNIQUE constraint)
// ------------------------------------------------------------
async function insertNotice(env, n, sourceUrl, week, rawBlock) {
  if (!n.notice_type || (!n.decedent_name && !n.parcel_id)) return false;
  try {
    await env.DB.prepare(
      `INSERT INTO probate_notices
        (notice_type, decedent_name, docket_number, date_of_death, letters_date,
         pr_name, pr_address, property_address, parcel_id, source_url, published_week, raw_text)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
      .bind(
        n.notice_type,
        n.decedent_name || null,
        n.docket_number || null,
        n.date_of_death || null,
        n.letters_date || null,
        n.pr_name || null,
        n.pr_address || null,
        n.property_address || null,
        n.parcel_id ? n.parcel_id.replace(/[\s#.-]/g, "").toUpperCase() : null,
        sourceUrl,
        week,
        rawBlock.slice(0, 4000)
      )
      .run();
    return true;
  } catch (e) {
    if (String(e).includes("UNIQUE")) return false; // already ingested
    console.error("insert failed", e);
    return false;
  }
}

// ------------------------------------------------------------
// 5b. Promote pending notices into signals
// ------------------------------------------------------------
async function matchPending(env) {
  const pending = await env.DB.prepare(
    "SELECT * FROM probate_notices WHERE matched = 0 LIMIT 200"
  ).all();

  let promoted = 0;
  let unmatched = 0;

  for (const n of pending.results) {
    let parcelId = null;
    let conf = 1.0;
    let sigType = null;

    if (n.notice_type === "foreclosure" && n.parcel_id) {
      parcelId = n.parcel_id;
      sigType = "preforeclosure";
      await ensureParcelStub(env, parcelId, n.property_address, n.decedent_name);
    } else if (n.notice_type === "petition_to_sell" && n.property_address) {
      parcelId = await matchByAddress(env, n.property_address);
      sigType = "petition_to_sell";
      conf = 0.95;
    } else if (n.decedent_name) {
      const hit = await matchByOwnerName(env, n.decedent_name);
      if (hit) {
        parcelId = hit.parcel_id;
        conf = hit.conf;
      }
      sigType = n.notice_type === "creditor_notice" ? "probate" : "probate";
    }

    if (parcelId && sigType) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO signals
           (parcel_id, signal_type, observed_at, source_url, source_doc_id, match_conf, raw_json)
         VALUES (?,?,?,?,?,?,?)`
      )
        .bind(
          parcelId,
          sigType,
          n.letters_date || n.published_week || new Date().toISOString().slice(0, 10),
          n.source_url,
          n.docket_number || `pn-${n.id}`,
          conf,
          JSON.stringify({ probate_notice_id: n.id, decedent: n.decedent_name, pr: n.pr_name, pr_address: n.pr_address })
        )
        .run();
      await env.DB.prepare("UPDATE probate_notices SET matched = 1 WHERE id = ?")
        .bind(n.id).run();
      promoted++;
    } else {
      // leave matched=0 until parcels table is populated; flip to -1 after 60 days
      const stale =
        n.created_at &&
        Date.now() - new Date(n.created_at).getTime() > 60 * 86400 * 1000;
      if (stale) {
        await env.DB.prepare("UPDATE probate_notices SET matched = -1 WHERE id = ?")
          .bind(n.id).run();
      }
      unmatched++;
    }
  }
  return { promoted, unmatched };
}

// Create a stub parcel row so the FK holds before KGIS enrichment runs.
async function ensureParcelStub(env, parcelId, address, ownerName) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO parcels (parcel_id, situs_address, owner_name_raw)
     VALUES (?,?,?)`
  ).bind(parcelId, address || null, ownerName || null).run();
}

// Address match: normalize house number + first street token.
async function matchByAddress(env, address) {
  const m = address.toUpperCase().match(/(\d+)\s+([A-Z]+)/);
  if (!m) return null;
  const row = await env.DB.prepare(
    `SELECT parcel_id FROM parcels
     WHERE UPPER(situs_address) LIKE ? LIMIT 1`
  ).bind(`${m[1]} ${m[2]}%`).first();
  return row ? row.parcel_id : null;
}

// Name match: deeds usually read "LAST FIRST [MIDDLE]" or "LAST, FIRST".
// Require BOTH last and first name tokens to appear in owner_name_raw.
async function matchByOwnerName(env, decedent) {
  const tokens = decedent
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !["JR", "SR", "II", "III", "IV"].includes(t));
  if (tokens.length < 2) return null;
  const first = tokens[0];
  const last = tokens[tokens.length - 1];

  const rows = await env.DB.prepare(
    `SELECT parcel_id, owner_name_raw FROM parcels
     WHERE UPPER(owner_name_raw) LIKE ? AND UPPER(owner_name_raw) LIKE ?
     LIMIT 5`
  ).bind(`%${last}%`, `%${first}%`).all();

  if (!rows.results.length) return null;
  // Single hit with middle-name corroboration -> higher confidence
  const conf = rows.results.length === 1 ? 0.85 : 0.6;
  return { parcel_id: rows.results[0].parcel_id, conf };
}

// ------------------------------------------------------------
function weekFromUrl(url) {
  const m = url.match(/week-of-([a-z]+)-(\d{1,2})-(\d{4})/);
  if (!m) return null;
  const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const mi = months.indexOf(m[1]);
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
}

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
