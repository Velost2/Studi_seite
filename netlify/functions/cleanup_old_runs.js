// netlify/functions/cleanup_old_runs.js
// Admin-Utility zum Aufräumen alter Blobs in einem Store
// Aufruf (POST): /.netlify/functions/cleanup_old_runs?token=...&store=ux-experiment-v2&prefix=runs/&contains=tested&dry=1
// Setze eine Umgebungsvariable ADMIN_TOKEN in Netlify, um Zugriff zu schützen.
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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: cors,
    });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const adminToken = process.env.ADMIN_TOKEN || "";
  if (!adminToken || token !== adminToken) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: cors,
    });
  }

  const storeName = url.searchParams.get("store") || "ux-experiment-v2";
  const prefix = url.searchParams.get("prefix") || "runs/";
  const contains = url.searchParams.get("contains") || ""; // optional Filter-Substring
  const dryRun = ["1", "true", "yes"].includes((url.searchParams.get("dry") || "").toLowerCase());

  const store = getStore(storeName);

  // Auflisten aller Keys mit Prefix (paginiert)
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
    return new Response(JSON.stringify({ ok: false, error: "List failed", details: String(err) }), {
      status: 500,
      headers: cors,
    });
  }

  if (dryRun) {
    return new Response(
      JSON.stringify({ ok: true, mode: "dry-run", store: storeName, prefix, contains, matchCount: keys.length, sample: keys.slice(0, 50) }),
      { status: 200, headers: cors }
    );
  }

  // Löschen
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

  return new Response(
    JSON.stringify({ ok: errors.length === 0, deleted, failed: errors.length, errors: errors.slice(0, 10) }),
    { status: 200, headers: cors }
  );
};

