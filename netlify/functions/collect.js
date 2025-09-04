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

  // Site-weiter Blob-Store (zero-config)
  const store = getStore("ux-experiment-v2");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const id = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const key = `runs/${ts}_${id}.json`;

  await store.set(key, JSON.stringify(body));

  return new Response(JSON.stringify({ ok: true, key }), { status: 200, headers: cors });
};
