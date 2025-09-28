// netlify/functions/collect.js
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const cors = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
  };

  // CORS-Preflight
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: cors });
  }

  // Lightweight reset/cleanup via GET on the known endpoint
  // Examples:
  //   Preview: /.netlify/functions/collect
  //   Delete all: /.netlify/functions/collect?delete=1
  //   Options: &prefix=runs/,runs-v2/&contains=tested&dry=1
  if (req.method === "GET") {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    const adminToken = process.env.ADMIN_TOKEN || "";
    if (adminToken && token !== adminToken) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: cors,
      });
    }

    const storeName = process.env.BLOBS_STORE_NAME || "ux-experiment-v2";
    const store = getStore(storeName);
    const prefixParam = url.searchParams.get("prefix");
    const envPref = ((process.env.BLOBS_KEY_PREFIX || "runs-v3").replace(/^\/+|\/+$/g, "")) + "/";
    const prefixes = (prefixParam && prefixParam.trim().length > 0)
      ? prefixParam.split(",").map((p) => p.trim())
      : Array.from(new Set(["runs/", "runs-v2/", envPref]));
    const contains = url.searchParams.get("contains") || "";
    const dryRun = ["1", "true", "yes"].includes((url.searchParams.get("dry") || "").toLowerCase());
    const doDelete = ["1", "true", "yes"].includes((url.searchParams.get("delete") || url.searchParams.get("reset") || "").toLowerCase());

    const summary = [];
    let totalMatched = 0;
    let totalDeleted = 0;
    const errors = [];

    for (const prefix of prefixes) {
      const keys = [];
      try {
        let cursor;
        do {
          const res = await store.list({ prefix, cursor });
          for (const b of res.blobs || []) {
            if (!contains || (b.key || "").includes(contains)) {
              keys.push(b.key);
            }
          }
          cursor = res.cursor;
        } while (cursor);
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: "List failed", details: String(err), prefix }), {
          status: 500,
          headers: cors,
        });
      }

      totalMatched += keys.length;

      if (!doDelete || dryRun) {
        summary.push({ prefix, matches: keys.length, sample: keys.slice(0, 50) });
        continue;
      }

      let deleted = 0;
      for (const key of keys) {
        try {
          await store.delete(key);
          deleted++;
        } catch (err) {
          errors.push({ key, error: String(err) });
        }
      }
      totalDeleted += deleted;
      summary.push({ prefix, deleted });
    }

    const result = doDelete && !dryRun
      ? { ok: errors.length === 0, action: "delete", store: storeName, totalMatched, totalDeleted, failed: errors.length, details: summary }
      : { ok: true, action: dryRun ? "dry-run" : "preview", store: storeName, totalMatched, details: summary };

    return new Response(JSON.stringify(result), { status: 200, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: cors,
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: cors,
    });
  }

  // Minimal-Validierung: gerne erweitern
  if (!body || !body.exp1 || !body.exp5) {
    return new Response(JSON.stringify({ ok: false, error: "invalid payload" }), {
      status: 400,
      headers: cors,
    });
  }

  // Site-weiter Blob-Store (konfigurierbar per ENV)
  // Standard: gleicher Store wie bisher, aber neuer Ordner (runs-v2/)
  // Optional via ENV: BLOBS_STORE_NAME, BLOBS_KEY_PREFIX
  const storeName = process.env.BLOBS_STORE_NAME || "ux-experiment-final";
  const keyPrefix = process.env.BLOBS_KEY_PREFIX || "runs-v1";
  const store = getStore(storeName);

  // Build a more readable, structured key using European date order:
  // prefix/DD-MM-YYYY/nNNNN_device_condition[_label]_id.json
  try {
    // IMPORTANT: Use server time, not client performance.now() (which would be ~1970)
    const dt = new Date();
    const y = String(dt.getFullYear());
    const m = String(dt.getMonth()+1).padStart(2,'0');
    const d = String(dt.getDate()).padStart(2,'0');
    const folder = `${d}-${m}-${y}`; // European order DD-MM-YYYY
    const device = (body && body.client && body.client.isMobile) ? 'mobile' : 'desktop';
    const condition = String(body && body.condition || 'na').replace(/[^a-zA-Z0-9_-]/g,'').toLowerCase() || 'na';
    const labelRaw = String(body && body.sessionLabel || '').trim();
    const label = labelRaw ? ('_' + labelRaw.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)) : '';
    const id = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    // Determine the global sequential number (across all days)
    let nStr = 'n00001';
    try {
      const prefixAll = `${keyPrefix}/`;
      let total = 0; let cursor;
      do {
        const res = await store.list({ prefix: prefixAll, cursor });
        total += Array.isArray(res.blobs) ? res.blobs.length : 0;
        cursor = res.cursor;
      } while (cursor);
      const n = total + 1;
      nStr = 'n' + String(n).padStart(5,'0');
    } catch {}
    // File name also includes the date for clarity
    const fname = `${folder}_${nStr}_${device}_${condition}${label}_${id}.json`;
    const key = `${keyPrefix}/${fname}`;

    await store.set(key, JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true, key }), { status: 200, headers: cors });
  } catch (e) {
    // Fallback to old scheme if something goes wrong
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const id = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    const key = `${keyPrefix}/${ts}_${id}.json`;
    await store.set(key, JSON.stringify(body));
    return new Response(JSON.stringify({ ok: true, key, fallback: true }), { status: 200, headers: cors });
  }
};
