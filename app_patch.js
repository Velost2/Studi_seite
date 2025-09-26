
// === app_patch.js (non-invasive helpers) ===============================
(function(){
  const SCHEMA_VERSION = "v2-exp1to16";
  const isMobile = (function(){
    try {
      return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
             || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches)
             || (window.innerWidth < 640);
    } catch { return false; }
  })();

  function normalizePositions(els, clickedEl, targetEl){
    const items = Array.from(els || []).map(el => {
      const r = el.getBoundingClientRect();
      return { el, cx: r.left + r.width/2, cy: r.top + r.height/2 };
    });
    if (!items.length) return { axis:null, count:0, clickedIndex:null, clickedPosNorm:null, targetIndex:null, targetPosNorm:null };
    const xs = items.map(i => i.cx), ys = items.map(i => i.cy);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const axis = spanY > spanX ? "y" : "x";
    const posNamesX = ["left","middle","right"];
    const posNamesY = ["top","middle","bottom"];
    items.sort((a,b)=> axis==="x" ? (a.cx-b.cx) : (a.cy-b.cy));
    items.forEach((it, idx)=>{ it.index=idx; it.pos=(axis==="x"?posNamesX:posNamesY)[Math.min(idx,2)] || "middle"; });
    function find(el){ const it = items.find(i=>i.el===el); return it? { index:it.index, pos:it.pos } : { index:null, pos:null }; }
    const c = clickedEl ? find(clickedEl) : { index:null, pos:null };
    const t = targetEl  ? find(targetEl)  : { index:null, pos:null };
    return { axis, count:items.length, clickedIndex:c.index, clickedPosNorm:c.pos, targetIndex:t.index, targetPosNorm:t.pos };
  }
  window.__UX_normalizePositions = normalizePositions;

  const EXP_ALLOWED = new Set(Array.from({length: 16}, (_,i)=>`exp${i+1}`));
  function deviceMeta(){
    let vp = {w:0,h:0}, orientation="unknown";
    try { vp = { w: window.innerWidth||0, h: window.innerHeight||0 }; orientation = (vp.h>=vp.w) ? "portrait" : "landscape"; } catch {}
    return {
      schemaVersion: SCHEMA_VERSION,
      isMobile,
      viewport: vp,
      orientation,
      ua: navigator.userAgent || "",
      ts: Date.now()
    };
  }
  function buildPayload(state){
    const allowed = {};
    Object.keys(state||{}).forEach(k=>{
      if (EXP_ALLOWED.has(k) && state[k] && typeof state[k]==="object") allowed[k] = state[k];
    });
    return { meta: deviceMeta(), ...allowed, survey: state.survey || {} };
  }
  window.__UX_buildPayload = buildPayload;

  document.addEventListener("click", function(e){
    try {
      if (!window.state || !window.state.exp6) return;
      const btn = e.target.closest?.(".exp6-choose");
      if (!btn) return;
      const grid = document.getElementById("exp6-grid");
      const card = btn.closest(".card");
      if (!grid || !card) return;
      const pos = normalizePositions(grid.children, card, null);
      window.state.exp6.extra = Object.assign({}, window.state.exp6.extra||{}, {
        axis: pos.axis,
        clickedIndex: pos.clickedIndex,
        clickedPosNorm: pos.clickedPosNorm,
        clickedPos: window.state.exp6?.extra?.clickedPos || pos.clickedPosNorm
      });
    } catch {}
  }, true);

  document.addEventListener("click", function(e){
    try {
      if (!window.state || !window.state.exp7) return;
      const left = document.getElementById("exp7-left");
      const right = document.getElementById("exp7-right");
      const target = e.target;
      if (!left || !right) return;
      if (target!==left && target!==right) return;
      const blackLeft = !!window.state.exp7.blackLeft;
      const clickedPos = (target===left) ? "left" : "right";
      const blackClicked = (blackLeft && clickedPos==="left") || (!blackLeft && clickedPos==="right");
      window.state.exp7.extra = Object.assign({}, window.state.exp7.extra||{}, { blackLeft, clickedPos, blackClicked });
    } catch {}
  }, true);

  document.addEventListener("click", function(e){
    try {
      if (!window.state || !window.state.exp5) return;
      const next = document.getElementById("exp5-next");
      if (!next || e.target!==next) return;
      const selInput = document.querySelector('input[name="ship_pref"]:checked');
      const pref = selInput ? selInput.value : (window.state.exp5.selected || null);
      const exp4 = window.state.exp4;
      const def = exp4?.extra?.selectedOption || (exp4?.extra?.defaultOption) || null;
      window.state.exp5.selected = pref;
      window.state.exp5.extra = Object.assign({}, window.state.exp5.extra||{}, {
        defaultFromExp4: def,
        prefMatchesDefault: (def && pref) ? (def===pref) : null
      });
    } catch {}
  }, true);

  window.addEventListener("load", function(){
    const btn = document.getElementById("btn-submit");
    if (!btn) return;
    const statusEl = document.getElementById("submit-status");
    btn.addEventListener("click", async function(ev){
      try {
        ev.preventDefault();
        const payload = buildPayload(window.state || {});
        const url = window.COLLECT_URL || "/.netlify/functions/collect";
        if (statusEl) statusEl.textContent = "Sende…";
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type":"application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Upload fehlgeschlagen: " + res.status);
        if (statusEl) statusEl.textContent = "Gesendet – vielen Dank!";
      } catch (err){
        console.error(err);
        if (statusEl) statusEl.textContent = "Fehler beim Senden: " + (err && err.message || err);
      }
    }, {capture:true});
  });
})();
