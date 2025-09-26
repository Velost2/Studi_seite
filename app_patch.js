// === app_patch.js — explicit flags + mobile labels + strict export (exp1..exp16) ===
(function(){
  const SCHEMA_VERSION = "v3-exp1to16-flags";
  const isMobile = (()=>{
    try {
      return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
          || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches)
          || (innerWidth < 640);
    } catch { return false; }
  })();

  // ---------- Position normalization (works for rows and columns) ----------
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
    function info(el){ const it = items.find(i=>i.el===el); return it? { index:it.index, pos:it.pos } : { index:null, pos:null }; }
    const c = clickedEl ? info(clickedEl) : { index:null, pos:null };
    const t = targetEl  ? info(targetEl)  : { index:null, pos:null };
    return { axis, count:items.length, clickedIndex:c.index, clickedPosNorm:c.pos, targetIndex:t.index, targetPosNorm:t.pos };
  }
  window.__UX_normalizePositions = normalizePositions;

  // ---------- Reason token normalization (Links/Rechts <-> Oben/Unten) ----------
  function normalizeReasonTokens(text, axisHint){
    if (!text) return text;
    let out = String(text);
    const axis = axisHint || (isMobile ? "y" : "x");
    const mapPairs = axis === "y"
      ? [["Links","Oben"],["Rechts","Unten"],["links","oben"],["rechts","unten"]]
      : [["Oben","Links"],["Unten","Rechts"],["oben","links"],["unten","rechts"]];
    mapPairs.forEach(([from,to])=>{ out = out.replace(new RegExp(`\\b${from}\\b`, "g"), to); });
    return out;
  }

  // ---------- Export whitelist + meta + normalized reasons ----------
  const EXP_ALLOWED = new Set(Array.from({length: 16}, (_,i)=>`exp${i+1}`));
  function deviceMeta(){
    let vp = {w:0,h:0}, orientation="unknown";
    try { vp = { w: innerWidth||0, h: innerHeight||0 }; orientation = (vp.h>=vp.w) ? "portrait" : "landscape"; } catch {}
    return { schemaVersion: SCHEMA_VERSION, isMobile, viewport: vp, orientation, ua: navigator.userAgent||"", ts: Date.now() };
  }
  function buildPayload(state){
    const allowed = {};
    Object.keys(state||{}).forEach(k=>{
      if (!EXP_ALLOWED.has(k)) return;
      const v = state[k];
      if (!v || typeof v!=="object") return;
      const step = JSON.parse(JSON.stringify(v));
      if (step.extra && step.extra.reason){
        const axisHint = step.extra.axis || null;
        const norm = normalizeReasonTokens(step.extra.reason, axisHint);
        step.extra.reason = norm;
        step.extra.reasonNorm = norm;
        step.extra.posLabelSet = (axisHint==="y" || (axisHint==null && isMobile)) ? "TMB" : "LMR";
      }
      allowed[k] = step;
    });
    return { meta: deviceMeta(), ...allowed, survey: state.survey || {} };
  }
  window.__UX_buildPayload = buildPayload;

  // ---------- Live UI: fix attribution labels on mobile ----------
  function swapTextNodes(root){
    if (!isMobile) return;
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()){
      const t = walker.currentNode;
      if (t.nodeValue && (/\bLinks\b|\bRechts\b/.test(t.nodeValue))) nodes.push(t);
    }
    nodes.forEach(t => { t.nodeValue = normalizeReasonTokens(t.nodeValue, "y"); });
  }
  const mo = new MutationObserver(muts => muts.forEach(m => m.addedNodes && m.addedNodes.forEach(n=>{ if (n.nodeType===1) swapTextNodes(n); })));
  window.addEventListener("load", ()=>{ try { swapTextNodes(document.body); mo.observe(document.body, {childList:true, subtree:true}); } catch {} });

  // =================================================================
  // Explicit flags per experiment (non-invasive; uses delegation/hooks)
  // =================================================================

  // Exp1 – Proximity/Grouping
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp1) return;
      const card = e.target.closest?.(".exp1-card"); if (!card) return;
      const grid = document.getElementById("exp1-grid"); if (!grid) return;
      const target = grid.querySelector?.(".exp1-card.target");
      const pos = normalizePositions(grid.children, card, target);
      const isTarget = !!(target && card === target);
      window.state.exp1.extra = Object.assign({}, window.state.exp1.extra||{}, pos, { isTarget });
    } catch {}
  }, true);

  // Exp2 – CTA Shape
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp2) return;
      const btn = e.target.closest?.(".exp2-btn"); if (!btn) return;
      const clicked = btn.dataset.id; // "round_high"|"square_low"
      window.state.exp2.extra = Object.assign({}, window.state.exp2.extra||{}, {
        clicked, roundChosen: clicked === "round_high"
      });
    } catch {}
  }, true);

  // Exp3 – Social Proof (Badge)
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp3) return;
      const badge = e.target.closest?.(".exp3-badge-card");
      const any = e.target.closest?.(".exp3-card");
      if (!any) return;
      const badgeChosen = !!badge;
      window.state.exp3.extra = Object.assign({}, window.state.exp3.extra||{}, {
        badgeChosen, bannerChoices: badgeChosen ? 1 : 0
      });
    } catch {}
  }, true);

  // Exp4 – Shipping Defaults
  document.addEventListener("change", function(e){
    try {
      if (!window.state?.exp4) return;
      if (!e.target.matches?.('input[name="shipping"]')) return;
      const selectedOption = e.target.value;
      const def = window.state.exp4.extra?.defaultOption || window.state.exp4.defaultOption || null;
      window.state.exp4.extra = Object.assign({}, window.state.exp4.extra||{}, {
        selectedOption, adopted: def ? (selectedOption === def) : null
      });
    } catch {}
  }, true);

  // Exp5 – Shipping Preference + consistency with Exp4
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp5) return;
      const next = e.target.closest?.("#exp5-next"); if (!next) return;
      const sel = document.querySelector('input[name="ship_pref"]:checked');
      const pref = sel ? sel.value : (window.state.exp5.selected || null);
      const exp4 = window.state.exp4;
      const def  = exp4?.extra?.selectedOption || exp4?.extra?.defaultOption || null;
      window.state.exp5.selected = pref;
      window.state.exp5.extra = Object.assign({}, window.state.exp5.extra||{}, {
        defaultFromExp4: def, prefMatchesDefault: (def && pref) ? (def === pref) : null
      });
    } catch {}
  }, true);

  // Exp6 – Left bias equal cards (pos + axis)
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp6) return;
      const card = e.target.closest?.(".exp6-card"); if (!card) return;
      const grid = document.getElementById("exp6-grid"); if (!grid) return;
      const pos = normalizePositions(grid.children, card, null);
      window.state.exp6.extra = Object.assign({}, window.state.exp6.extra||{}, pos, { clickedPos: pos.clickedPosNorm });
    } catch {}
  }, true);

  // Exp7 – CTA Color (black vs white)
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp7) return;
      const left = document.getElementById("exp7-left");
      const right = document.getElementById("exp7-right");
      const target = e.target;
      if (!left || !right) return;
      if (target!==left && target!==right) return;
      const pos = normalizePositions([left,right], target, null);
      const blackLeft = !!window.state.exp7.blackLeft;
      const blackClicked = (blackLeft && pos.clickedPosNorm==="left") || (!blackLeft && pos.clickedPosNorm==="right");
      window.state.exp7.extra = Object.assign({}, window.state.exp7.extra||{}, pos, { blackLeft, blackClicked });
    } catch {}
  }, true);

  // Exp8 – Single Button (Fitts: top vs bottom) — ttf already tracked; add pos
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp8) return;
      const btn = e.target.closest?.(".exp8-btn"); if (!btn) return;
      const all = document.querySelectorAll(".exp8-btn");
      const pos = normalizePositions(all, btn, null);
      window.state.exp8.extra = Object.assign({}, window.state.exp8.extra||{}, { pos: pos.clickedPosNorm, axis: pos.axis });
      if (!window.state.exp8.variant) window.state.exp8.variant = pos.clickedPosNorm; // top|bottom
    } catch {}
  }, true);

  // Exp9 – Confirm + Distance (near/far) — ensure gapPx variant + ttf exist elsewhere
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp9) return;
      const done = e.target.closest?.("#exp9-done"); if (!done) return;
      const gap = window.__EXP9_gapPx || window.state.exp9.extra?.gapPx || null;
      const near = typeof gap==="number" ? (gap < 80) : null; // threshold example
      if (!window.state.exp9.variant) window.state.exp9.variant = near==null ? "generic" : (near ? "near" : "far");
      window.state.exp9.extra = Object.assign({}, window.state.exp9.extra||{}, { gapPx: gap });
    } catch {}
  }, true);

  // Exp10 – Order/Alignment (left vs right target) -> explicit target_clicked
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp10) return;
      const grid = document.getElementById("exp10-grid"); if (!grid) return;
      const card = e.target.closest?.(".exp10-card"); if (!card) return;
      const target = grid.querySelector(".exp10-card.target");
      const pos = normalizePositions(grid.children, card, target);
      const target_clicked = (pos.clickedIndex!=null && pos.clickedIndex===pos.targetIndex);
      window.state.exp10.extra = Object.assign({}, window.state.exp10.extra||{}, pos, { target_clicked });
      if (!window.state.exp10.variant && pos.targetPosNorm) window.state.exp10.variant = "target_"+pos.targetPosNorm;
    } catch {}
  }, true);

  // Exp11 – Social Proof v2 (subtle badge)
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp11) return;
      const badge = e.target.closest?.(".exp11-badge-card");
      const any = e.target.closest?.(".exp11-card");
      if (!any) return;
      const badgeChosen = !!badge;
      window.state.exp11.extra = Object.assign({}, window.state.exp11.extra||{}, { badgeChosen, bannerChoices: badgeChosen?1:0 });
    } catch {}
  }, true);

  // Exp12 – CTA Signifier 2 (icon side)
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp12) return;
      const left = document.getElementById("exp12-left");
      const right = document.getElementById("exp12-right");
      const iconIsLeft = !!window.state.exp12.iconLeft;
      const target = e.target;
      if (!left || !right) return;
      if (target!==left && target!==right) return;
      const pos = normalizePositions([left,right], target, iconIsLeft ? left : right);
      const clicked_icon_side = (iconIsLeft && pos.clickedPosNorm==="left") || (!iconIsLeft && pos.clickedPosNorm==="right");
      window.state.exp12.extra = Object.assign({}, window.state.exp12.extra||{}, pos, { iconPos: iconIsLeft?"left":"right", clicked_icon_side });
      if (!window.state.exp12.variant) window.state.exp12.variant = iconIsLeft ? "icon_left" : "icon_right";
    } catch {}
  }, true);

  // Exp13 – Good Continuation (linear vs scatter) — ensure variant present
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp13) return;
      const done = e.target.closest?.("#exp13-done"); if (!done) return;
      if (!window.state.exp13.variant) window.state.exp13.variant = window.__EXP13_isLinear ? "linear" : "scatter";
    } catch {}
  }, true);

  // Exp14 – Figure–Ground (emphasized chosen)
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp14) return;
      const grid = document.getElementById("exp14-grid"); if (!grid) return;
      const card = e.target.closest?.(".exp14-card"); if (!card) return;
      const emph = grid.querySelector(".exp14-card.emphasized");
      const emphId = emph?.id || null;
      const clickedId = card?.id || null;
      const emphasized_chosen = (emphId!=null && clickedId!=null && String(emphId)===String(clickedId));
      window.state.exp14.extra = Object.assign({}, window.state.exp14.extra||{}, { emphId, clickedId, emphasized_chosen });
    } catch {}
  }, true);

  // Exp15 – Social Proof strong (explicit badgeChosen)
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp15) return;
      const strong = e.target.closest?.(".exp15-strong-card");
      const any = e.target.closest?.(".exp15-card");
      if (!any) return;
      const badgeChosen = !!strong;
      window.state.exp15.extra = Object.assign({}, window.state.exp15.extra||{}, { badgeChosen, bannerChoices: badgeChosen?1:0 });
      if (!window.state.exp15.variant) window.state.exp15.variant = "strong";
    } catch {}
  }, true);

  // Exp16 – 3 equal, one with black "Weiter" (highlighted chosen)
  document.addEventListener("click", function(e){
    try {
      if (!window.state?.exp16) return;
      const grid = document.getElementById("exp16-grid"); if (!grid) return;
      const card = e.target.closest?.(".exp16-card"); if (!card) return;
      const highlighted = grid.querySelector(".exp16-card.highlighted");
      const highlighted_chosen = !!(highlighted && card===highlighted);
      const pos = normalizePositions(grid.children, card, highlighted);
      window.state.exp16.extra = Object.assign({}, window.state.exp16.extra||{}, pos, {
        highlightedId: highlighted?.id||null, clickedId: card?.id||null, highlighted_chosen
      });
      if (!window.state.exp16.variant) window.state.exp16.variant = "highlight_black";
    } catch {}
  }, true);

  // ---------- Submit hook: send strict schema ----------
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