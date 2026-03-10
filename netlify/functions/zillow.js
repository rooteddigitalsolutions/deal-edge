/**
 * Netlify Function: /api/zillow
 * Proxies RapidAPI Zillow56 calls server-side so the API key is never exposed.
 *
 * Endpoints supported:
 *   POST { zpid: "84140576" }           → GET /property?zpid=...
 *   POST { address: "2414 Wilson Ave, Knoxville TN 37915" } → GET /search?location=...
 */

const RAPIDAPI_HOST = "zillow56.p.rapidapi.com";

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "RAPIDAPI_KEY environment variable not set. Add it in Netlify → Site Settings → Environment Variables." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const headers = {
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
    "Content-Type": "application/json",
  };

  try {
    let apiUrl;
    let searchMode = false;

    if (body.zpid) {
      // Direct zpid lookup — most accurate, use whenever URL is from Zillow
      apiUrl = `https://${RAPIDAPI_HOST}/property?zpid=${encodeURIComponent(body.zpid)}`;
    } else if (body.address) {
      // Address search fallback for Redfin / Realtor.com URLs
      // Returns a list of matching properties; we'll pick the first one
      apiUrl = `https://${RAPIDAPI_HOST}/search?location=${encodeURIComponent(body.address)}&output=json&results=3`;
      searchMode = true;
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: "Provide either zpid or address" }) };
    }

    const response = await fetch(apiUrl, { headers });

    if (!response.ok) {
      const errText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Zillow API returned ${response.status}`, detail: errText.slice(0, 300) }),
      };
    }

    const data = await response.json();

    // For search mode, unwrap the first result and fetch full property details
    if (searchMode) {
      const results = data.results || data.props || data;
      const first = Array.isArray(results) ? results[0] : results;
      if (!first || !first.zpid) {
        return { statusCode: 404, body: JSON.stringify({ error: "No matching property found for that address" }) };
      }
      // Fetch full property details for the matched zpid
      const detailRes = await fetch(`https://${RAPIDAPI_HOST}/property?zpid=${first.zpid}`, { headers });
      if (!detailRes.ok) {
        // Fall back to the search result data we have
        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(first) };
      }
      const detail = await detailRes.json();
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(detail) };
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Zillow API request failed" }) };
  }
};
