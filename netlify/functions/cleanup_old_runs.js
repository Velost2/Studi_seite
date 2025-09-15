// netlify/functions/cleanup_old_runs.js
// Einfache Bereinigung von Blobs in einem Store
// - Unterstützt GET und POST
// - Wenn ADMIN_TOKEN gesetzt ist, wird es geprüft; sonst keine Auth nötig (einfacher Start)
// Beispiele:
//   Vorschau (Standard, GET):
//     /.netlify/functions/cleanup_old_runs
//   Löschen (GET/POST):
//     /.netlify/functions/cleanup_old_runs?delete=1
//   Optional: store, prefix (kommagetrennt), contains, dry, delete
//     /.netlify/functions/cleanup_old_runs?store=ux-experiment-v2&prefix=runs/,runs-v2/&contains=tested&delete=1
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

  // Erlaubt GET und POST (einfacher Aufruf per Browser)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: cors,
    });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "A04312394360";
  const adminToken = process.env.ADMIN_TOKEN || "A04312394360";
  // Wenn ADMIN_TOKEN gesetzt ist, erzwingen wir Auth; sonst erlauben wir einfach (für schnelleren Start)
  if (adminToken && token !== adminToken) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: cors,
    });
  }

  const storeName = url.searchParams.get("store") || process.env.BLOBS_STORE_NAME || "ux-experiment-v2";
  const prefixParam = url.searchParams.get("prefix");
  // Standard: beiden Ordner prüfen (runs/ und runs-v2/)
  const prefixes = (prefixParam && prefixParam.trim().length > 0)
    ? prefixParam.split(",").map((p) => p.trim())
    : ["runs/", "runs-v2/"];
  const contains = url.searchParams.get("contains") || ""; // optional Filter-Substring
  const dryRun = ["1", "true", "yes"].includes((url.searchParams.get("dry") || "").toLowerCase());
  const doDelete = ["1", "true", "yes"].includes((url.searchParams.get("delete") || "").toLowerCase());

  const store = getStore(storeName);

  const summary = [];
  let grandTotal = 0;
  let grandDeleted = 0;
  const grandErrors = [];

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

    grandTotal += keys.length;

    if (!doDelete || dryRun) {
      summary.push({ prefix, matches: keys.length, sample: keys.slice(0, 50) });
      continue;
    }

    let deleted = 0;
    const errors = [];
    for (const key of keys) {
      try {
        await store.delete(key);
        deleted++;
      } catch (err) {
        errors.push({ key, error: String(err) });
      }
    }
    grandDeleted += deleted;
    grandErrors.push(...errors);
    summary.push({ prefix, deleted, failed: errors.length, errors: errors.slice(0, 5) });
  }

  const result = doDelete && !dryRun
    ? { ok: grandErrors.length === 0, action: "delete", store: storeName, totalMatched: grandTotal, totalDeleted: grandDeleted, failed: grandErrors.length, details: summary }
    : { ok: true, action: dryRun ? "dry-run" : "preview", store: storeName, totalMatched: grandTotal, details: summary };

  return new Response(JSON.stringify(result), { status: 200, headers: cors });
};

