// netlify/functions/collect.js
export const config = { path: "/api/collect" };

export async function handler(event) {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Preflight für manche Browser
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ ok: false, error: "Method Not Allowed" }) };
  }

  try {
    const payload = JSON.parse(event.body || "{}");

    // Minimale Prüfung
    if (!payload || !payload.exp1 || !payload.exp5) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ ok: false, error: "invalid payload" }) };
    }

    // Variante A: erstmal nur entgegennehmen (zum Testen)
    // return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };

    // Variante B: in Netlify Blobs speichern
    const { Blobs } = await import("@netlify/blobs");
    const blobs = new Blobs({ siteID: process.env.SITE_ID }); // vom Runtime gesetzt
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const id = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    const key = `runs/${ts}_${id}.json`;

    await blobs.set(key, JSON.stringify(payload), { contentType: "application/json" });

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true, id: key }) };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
}
