/* Right-hand console: the creation panel, the three selection panels and
   the single-object operations they expose. */

import { BASE_R, DEFAULT_RATIO, parseShapeWithRot, shapeMarkup, norm, subCount, minTexture, defaultTexture, clampTexture, textureRatio, relinkTexture, textureSpan, TEXTURE_FILL, FILL_MIN, FILL_MAX } from "./geometry.js";
import { rotateParams, parseVary } from "./variants.js";
import { draft, tray, items, sel, ui, view, nextId, resetDraft, clearSelection, findItem, findQuestion, removeItem } from "./state.js";
import { $, escapeXML } from "./dom.js";
import { calib, pxToMm, visualAngleDeg, formatDeg } from "./calibration.js";
import { commit, commitSoon } from "./history.js";
import { renderCanvas } from "./canvas.js";
import { layoutQuestion, renderQStruct, regenerateTitle, memberIds, LABELS } from "./questions.js";
import { addTrayItem, trayPreviewSVG } from "./tray.js";
import { syncExpChips, refreshExpBar } from "./run.js";

/* ================= spec rows ================= */
export function miniSVG(def,rot,isAnchor){
  const r=isAnchor?13:16;
  return `<svg width="40" height="40" viewBox="-22 -22 44 44">${shapeMarkup(def,r,{none:true},"screen",rot,0)}</svg>`;
}
export function buildSpecRows(container, target, cfg){
  const wrap=document.createElement("div");
  const hasAnchors=cfg.anchor&&!cfg.anchor.none;
  const row1=document.createElement("div");
  row1.className="spec";
  row1.innerHTML=
    `<div class="pv">${miniSVG(cfg.def,target.baseRot)}</div>`+
    `<div class="fields">`+
      `<div class="frow"><span>${escapeXML(cfg.def.name)}</span></div>`+
      `<div class="frow"><span>orient</span><input type="number" step="1" value="${norm(target.baseRot)}" data-f="baseRot">°</div>`+
      (cfg.showSize?`<div class="frow"><span>size</span><input type="number" step="5" min="20" max="400" value="${Math.round(target.scale*100)}" data-f="size">%</div>`+
                    `<div class="frow mmRow"><span>on screen</span><span class="mmReadout" data-item="${target.id}"></span></div>`:"")+
      (target.id!=null?`<label class="check mini mmRow"><input type="checkbox" data-f="showMm" ${target.showMm?"checked":""}> show absolute size</label>`:"")+
    `</div>`;
  wrap.appendChild(row1);
  if(hasAnchors){
    const row2=document.createElement("div");
    row2.className="spec";
    const orientable=!cfg.anchor.circle;
    const tex=target.texture||0, minTex=minTexture(cfg.def);
    row2.innerHTML=
      `<div class="pv">${miniSVG(cfg.anchor,target.anchorRot,true)}</div>`+
      `<div class="fields">`+
        `<div class="frow"><span>${subLabel(cfg,tex)}</span></div>`+
        (orientable?`<div class="frow"><span>orient</span><input type="number" step="1" value="${norm(target.anchorRot)}" data-f="anchorRot">°</div>`:"")+
        (cfg.showRatio===false?"":`<div class="frow"><span>relative size</span><input type="number" step="1" min="2" max="60" value="${pctText(target.anchorRatio||DEFAULT_RATIO)}" data-f="anchorRatio">%${holdBtn("size",tex)}</div>`)+
        `<div class="seg" data-f="frame" title="frame of the sub-shapes">`+
          `<button data-v="screen" class="${target.frame==="screen"?"on":""}" title="screen frame: sub-shapes keep their absolute orientation when the base rotates">screen</button>`+
          `<button data-v="vertex" class="${target.frame==="vertex"?"on":""}" title="vertex frame: sub-shapes point outward from the center and co-rotate with the base">vertex</button>`+
        `</div>`+
        `<div class="seg" data-f="arrange" title="where the sub-shapes go">`+
          `<button data-v="vertices" class="${tex?"":"on"}" title="on the corners of the base shape">on vertices</button>`+
          `<button data-v="texture" class="${tex?"on":""}" title="filling the base shape as a texture; the density sets how many and how large">texture</button>`+
        `</div>`+
        `<div class="texBox"${tex?"":' style="display:none"'}>`+
          `<div class="frow" title="${cfg.def.circle?"elements across the circle":"elements along each side"}; at least ${minTex} so the elements carry the contour of the ${escapeXML(cfg.def.name)}">`+
            `<span>density · ${cfg.def.circle?"across":"per side"}</span><input type="number" step="1" min="${minTex}" max="16" value="${tex||defaultTexture(cfg.def)}" data-f="texture">${cfg.showRatio===false?"":holdBtn("density",tex)}</div>`+
          (cfg.showRatio===false?"":
          `<div class="frow" title="element size relative to the spacing between elements: 100% and they touch">`+
            `<span>fill</span><input type="number" step="5" min="${Math.round(FILL_MIN*200)}" max="${Math.round(FILL_MAX*200)}" value="${fillPct(cfg.def,target)}" data-f="fill">%${holdBtn("fill",tex)}</div>`+
          `<div class="note texNote"></div>`)+
        `</div>`+
      `</div>`;
    wrap.appendChild(row2);
  }
  wrap.querySelectorAll("input[data-f]:not([type=checkbox])").forEach(inp=>{
    inp.addEventListener("input",()=>{
      const f=inp.dataset.f;
      const v=parseFloat(inp.value);
      if(isNaN(v))return;
      if(f==="texture"||f==="fill")return;   // applied on change (see below), so typing "12" does not pass through "1"
      if(f==="anchorRatio"&&target.texture&&cfg.showRatio!==false)return;   // linked: applied on change
      if(f==="size"){target.scale=Math.max(0.2,Math.min(4,v/100));}
      else if(f==="anchorRatio"){target.anchorRatio=Math.max(0.02,Math.min(0.6,v/100));}
      else{target[f]=norm(v);}
      cfg.onChange();
      commitSoon();
      const pvs=wrap.querySelectorAll(".pv");
      if(pvs[0])pvs[0].innerHTML=miniSVG(cfg.def,target.baseRot);
      if(pvs[1])pvs[1].innerHTML=miniSVG(cfg.anchor,target.anchorRot,true);
    });
  });
  wrap.querySelectorAll('input[data-f="showMm"]').forEach(cb=>{
    cb.addEventListener("change",()=>{target.showMm=cb.checked;cfg.onChange();commit();});
  });
  // arrangement, density, size and fill: one of the last three is held, editing another moves the third
  const texInput=wrap.querySelector('input[data-f="texture"]');
  const fillInput=wrap.querySelector('input[data-f="fill"]');
  const LIMIT={contour:()=>cfg.def.circle?`at least ${texInput.min} across, so the rim is a clear circle`:`at least ${texInput.min} per side — it takes three elements to read as a straight edge`,
               overlap:()=>"limited so the elements do not overlap",sparse:()=>"limited: the elements would be too sparse to form a texture",
               max:()=>"limited to the highest density (16 per row)"};
  // what the app last wrote into a field: a change event that still carries it is not an edit
  const show=(inp,v)=>{inp.value=v;shown.set(inp,inp.value);};
  const edited=inp=>inp.value!==shown.get(inp);
  function showTexture(except){
    const n=target.texture||0;
    if(texInput&&texInput!==except&&n)show(texInput,n);
    const ri=wrap.querySelector('input[data-f="anchorRatio"]');
    if(ri&&ri!==except)show(ri,pctText(target.anchorRatio));
    if(fillInput&&fillInput!==except&&n)show(fillInput,fillPct(cfg.def,target));
    const lbl=wrap.querySelectorAll(".spec")[1].querySelector(".frow span");
    if(lbl)lbl.innerHTML=subLabel(cfg,n);
    syncHolds();
  }
  function syncHolds(){
    const sizeInput=wrap.querySelector('input[data-f="anchorRatio"]');
  if(sizeInput)sizeInput.addEventListener("change",()=>{
    if(!target.texture||cfg.showRatio===false||!edited(sizeInput))return;
    const v=parseFloat(sizeInput.value);
    if(isNaN(v)){showTexture(null);return;}
    relink("size",v/100,null);
  });
  wrap.querySelectorAll("button.hold").forEach(b=>{
      const on=b.dataset.hold===ui.texHold;
      b.classList.toggle("on",on);b.textContent=on?"held":"hold";
      b.style.display=target.texture?"":"none";
    });
    const held={density:texInput,size:wrap.querySelector('input[data-f="anchorRatio"]'),fill:fillInput}[ui.texHold];
    [texInput,fillInput,wrap.querySelector('input[data-f="anchorRatio"]')].forEach(i=>{if(i&&cfg.showRatio!==false)i.disabled=!!target.texture&&i===held;});
  }
  function relink(edited,value,inp){
    if(cfg.showRatio===false){                            // a question member: density only, the group holds the size
      target.texture=Math.max(+texInput.min,clampTexture(value));
    }else{
      const r=relinkTexture(cfg.def,{n:target.texture,size:target.anchorRatio},ui.texHold,edited,value);
      target.texture=r.n;target.anchorRatio=r.size;
      const note=wrap.querySelector(".texNote");
      if(note)note.textContent=r.limited?LIMIT[r.limited]():"";
    }
    showTexture(inp);
    if(cfg.onTexture)cfg.onTexture(target);
    cfg.onChange();
    commitSoon();
  }
  function setTexture(n){
    target.texture=n;
    if(cfg.showRatio!==false){
      target.anchorRatio=n?textureRatio(cfg.def,n):DEFAULT_RATIO;
      const ri=wrap.querySelector('input[data-f="anchorRatio"]');
      if(ri)ri.value=Math.round(target.anchorRatio*100);
    }
    showTexture(null);
    if(cfg.onTexture)cfg.onTexture(target);
    cfg.onChange();
    commitSoon();
  }
  if(texInput)texInput.addEventListener("change",()=>{
    if(!edited(texInput))return;
    const v=parseFloat(texInput.value);
    if(isNaN(v)){showTexture(null);return;}
    relink("density",v,null);
  });
  if(fillInput)fillInput.addEventListener("change",()=>{
    if(!edited(fillInput))return;
    const v=parseFloat(fillInput.value);
    if(isNaN(v)){showTexture(null);return;}
    relink("fill",v/200,null);
  });
  const sizeInput=wrap.querySelector('input[data-f="anchorRatio"]');
  if(sizeInput)sizeInput.addEventListener("change",()=>{
    if(!target.texture||cfg.showRatio===false)return;
    const v=parseFloat(sizeInput.value);
    if(isNaN(v)){showTexture(null);return;}
    relink("size",v/100,null);
  });
  wrap.querySelectorAll("button.hold").forEach(b=>{
    b.onclick=()=>{ui.texHold=b.dataset.hold;syncHolds();};
  });
  syncHolds();
  [texInput,fillInput,sizeInput].forEach(i=>{if(i)shown.set(i,i.value);});
  wrap.querySelectorAll('.seg[data-f="arrange"] button').forEach(b=>{
    b.onclick=()=>{
      const on=b.dataset.v==="texture";
      b.parentElement.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));
      wrap.querySelector(".texBox").style.display=on?"":"none";
      setTexture(on?Math.max(+texInput.min,clampTexture(texInput.value)):0);
      commit();
    };
  });
  wrap.querySelectorAll('.seg[data-f="frame"] button').forEach(b=>{
    b.onclick=()=>{
      target.frame=b.dataset.v;
      b.parentElement.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));
      cfg.onChange();
      commit();
    };
  });
  container.appendChild(wrap);
  updateMmReadouts();
}

function holdBtn(k,tex){
  const on=ui.texHold===k;
  return `<button type="button" class="hold${on?" on":""}" data-hold="${k}" title="hold the ${k}: changing another of density / size / fill moves the third"${tex?"":' style="display:none"'}>${on?"held":"hold"}</button>`;
}
const shown=new WeakMap();   // field → the value the app last wrote into it
/* sizes below 10% keep one decimal, so what is shown is what is used */
const pctText=r=>{const v=r*100;return v<10?+v.toFixed(1):Math.round(v);};
const fillPct=(def,t)=>t.texture?Math.round(200*(t.anchorRatio||DEFAULT_RATIO)*(t.texture-1)/textureSpan(def)):Math.round(TEXTURE_FILL*200);
function subLabel(cfg,tex){
  return `${escapeXML(cfg.anchor.name)} × ${subCount(cfg.def,tex)}`+(tex?` · texture ${tex}`:"");
}

/* ================= creation ================= */
function rebuildDraftRows(){
  $("shapeSpec").innerHTML="";
  if(!draft.shape)return;
  buildSpecRows($("shapeSpec"),draft,{def:draft.shape,anchor:draft.anchor,showSize:false,onChange:()=>{}});
}
function onShapeInput(){
  const pr=parseShapeWithRot($("shapeInput").value);
  const p=pr&&pr.shape;
  if(pr&&pr.rot!==null)draft.baseRot=pr.rot;
  if(!p||p.none){
    $("shapeSpec").innerHTML="";$("anchorSection").style.display="none";$("createRow").style.display="none";
    $("err1").textContent=$("shapeInput").value.trim()?"unrecognized shape name":"";
    draft.shape=null;
    return;
  }
  $("err1").textContent="";
  draft.shape=p;
  rebuildDraftRows();
  $("anchorSection").style.display="block";
  $("createRow").style.display="flex";
  // the next stage is the sub-shape: make it blink until something is typed there
  $("anchorInput").classList.toggle("nudge",!$("anchorInput").value.trim());
}
function onAnchorInput(){
  $("anchorInput").classList.remove("nudge");
  const raw=$("anchorInput").value.trim();
  if(raw===""||raw.toLowerCase()==="none"){
    draft.anchor={none:true};$("err2").textContent="";rebuildDraftRows();return;
  }
  const pr=parseShapeWithRot(raw);
  if(!pr){$("err2").textContent="unrecognized sub-shape name";draft.anchor={none:true};rebuildDraftRows();return;}
  $("err2").textContent="";
  if(pr.rot!==null)draft.anchorRot=pr.rot;
  draft.anchor=pr.shape;
  rebuildDraftRows();
}
export function createShape(){
  if(!draft.shape)return;
  const entry={id:nextId(),def:draft.shape,anchor:draft.anchor,
               baseRot:draft.baseRot,anchorRot:draft.anchorRot,frame:draft.frame,anchorRatio:draft.anchorRatio,
               ...(draft.texture&&!draft.anchor.none?{texture:draft.texture}:{})};
  tray.push(entry);
  // where the flight starts: the preview in the creation spec row
  const srcPv=document.querySelector("#shapeSpec .pv");
  const srcRect=srcPv?srcPv.getBoundingClientRect():null;
  addTrayItem(entry);
  const trayEl=$("tray").lastElementChild;
  if(srcRect&&trayEl){
    trayEl.classList.add("arriving");
    const dstRect=trayEl.getBoundingClientRect();
    const fly=document.createElement("div");
    fly.id="flyGhost";
    fly.innerHTML=trayPreviewSVG(entry,74);
    Object.assign(fly.style,{left:srcRect.left+"px",top:srcRect.top+"px",
                             width:srcRect.width+"px",height:srcRect.height+"px"});
    document.body.appendChild(fly);
    requestAnimationFrame(()=>{
      Object.assign(fly.style,{left:dstRect.left+"px",top:dstRect.top+"px",
                               width:dstRect.width+"px",height:dstRect.height+"px"});
    });
    fly.addEventListener("transitionend",()=>{
      fly.remove();
      trayEl.classList.remove("arriving");
      trayEl.classList.add("landed");
      setTimeout(()=>trayEl.classList.remove("landed"),320);
    },{once:true});
  }
  $("shapeInput").value="";$("anchorInput").value="";
  $("anchorInput").classList.remove("nudge");
  $("shapeSpec").innerHTML="";
  $("anchorSection").style.display="none";$("createRow").style.display="none";
  resetDraft();
  $("shapeInput").focus();
  commit();
}

/* ================= panels ================= */
export function showPanel(id){
  ["createPanel","selPanel","multiPanel","qPanel","expPanel"].forEach(p=>$(p).classList.toggle("on",p===id));
}
export function deselect(){
  const hadExp=sel.expId!=null;
  clearSelection();
  renderCanvas();showPanel("createPanel");
  if(hadExp)refreshExpBar();   // the strip shows which experiment is open
}
export function openSelPanel(){
  const it=findItem(sel.id);
  if(!it){showPanel("createPanel");return;}
  const grouped=!!it.qId;
  const e=it.trayRef;
  $("selSpecs").innerHTML="";
  buildSpecRows($("selSpecs"),it,{def:e.def,anchor:e.anchor,showSize:!grouped,showRatio:!grouped,onChange:()=>renderCanvas()});
  $("labelSeg").style.display=grouped?"none":"flex";
  $("rvFn").style.display=grouped?"none":"block";
  $("varyFn").style.display=grouped?"none":"block";
  $("dupBtn").style.display=grouped?"none":"block";
  $("delBtn").style.display=grouped?"none":"block";
  $("groupedNote").style.display=grouped?"block":"none";
  if(!grouped){
    document.querySelectorAll("#labelSeg button").forEach(b=>{
      b.classList.toggle("on",b.dataset.v===(it.label||""));
      b.onclick=()=>{
        it.label=b.dataset.v||null;
        document.querySelectorAll("#labelSeg button").forEach(x=>x.classList.toggle("on",x===b));
        renderCanvas();commit();
      };
    });
    $("varyInput").value="";$("errVary").textContent="";
  }
  showPanel("selPanel");
}
export function openMultiPanel(){
  $("multiInfo").textContent=sel.ids.length+" objects selected";
  const free=sel.ids.filter(id=>{const it=findItem(id);return it&&!it.qId;});
  const n=sel.ids.length, ok=(n===3||n===4)&&free.length===n;
  $("makeQBtn").disabled=!ok;
  $("errMulti").textContent=
    n!==3&&n!==4?"a question needs 3 objects (4 for three comparisons)":
    free.length!==n?"some objects already belong to a question":"";
  showPanel("multiPanel");
}
export function openQPanel(){
  const q=findQuestion(sel.qId);
  if(!q){showPanel("createPanel");return;}
  $("qTitle").value=q.title;
  syncExpChips(q);
  $("qSize").value=Math.round(q.s*100);
  $("qRatio").value=Math.round((q.anchorRatio||DEFAULT_RATIO)*100);
  const container=$("qMembers");
  container.innerHTML="";
  memberIds(q).map((id,i)=>[LABELS[i],id]).forEach(([lab,id])=>{
    const it=findItem(id);
    if(!it)return;
    const h=document.createElement("div");
    h.className="memberHead";h.textContent=lab;
    container.appendChild(h);
    buildSpecRows(container,it,{def:it.trayRef.def,anchor:it.trayRef.anchor,showSize:false,showRatio:false,onChange:()=>{renderCanvas();renderQStruct(q);},
      onTexture:()=>{
        const ms=memberIds(q).map(findItem).filter(Boolean), n=ms[0].texture||0;
        if(!ms.every(m=>(m.texture||0)===n)||(n&&ui.texHold==="size"))return;   // holding size: density packs the same elements tighter
        q.anchorRatio=n?textureRatio(it.trayRef.def,n):DEFAULT_RATIO;
        layoutQuestion(q);$("qRatio").value=Math.round(q.anchorRatio*100);
      }});
  });
  renderQStruct(q);
  updateMmReadouts();
  showPanel("qPanel");
}
export function syncSelPanelNumbers(){
  const it=findItem(sel.id);
  if(!it)return;
  const rotIn=document.querySelector('#selSpecs input[data-f="baseRot"]');
  if(rotIn&&document.activeElement!==rotIn)rotIn.value=norm(it.baseRot);
  const sizeIn=document.querySelector('#selSpecs input[data-f="size"]');
  if(sizeIn&&document.activeElement!==sizeIn)sizeIn.value=Math.round(it.scale*100);
}

/* ================= single-object ops ================= */
export function deleteSelected(){
  const it=findItem(sel.id);
  if(!it||it.qId)return;   // grouped objects are deleted via their question
  removeItem(sel.id);
  deselect();commit();
}
export function deleteMulti(){
  sel.ids.forEach(id=>{
    const it=findItem(id);
    if(it&&it.qId)return; // grouped objects are deleted via their question
    removeItem(id);
  });
  deselect();commit();
}
export function duplicateSelected(){
  const it=findItem(sel.id);
  if(!it)return;
  const copy={...it,id:nextId(),x:it.x+30/view.z,y:it.y+30/view.z,label:null,qId:null};
  items.push(copy);
  sel.id=copy.id;
  renderCanvas();openSelPanel();commit();
}
export function makeVariant(){
  const it=findItem(sel.id);
  if(!it)return;
  const d=parseFloat($("rvDeg").value);
  if(isNaN(d))return;
  const v={...rotateParams(it,ui.rvScope,d),id:nextId(),x:it.x+BASE_R*2.6*it.scale,label:null,qId:null};
  items.push(v);
  sel.id=v.id;
  renderCanvas();openSelPanel();commit();
}
export function applyVary(){
  const it=findItem(sel.id);
  if(!it)return;
  const v=parseVary($("varyInput").value);
  if(!v){$("errVary").textContent="can't parse — e.g. shape 0,45,90 sub 0:30:180";return;}
  $("errVary").textContent="";
  const shapes=v.shape||[it.baseRot];
  const anchors=v.anchor||[it.anchorRot];
  const gap=BASE_R*2.6*it.scale;
  shapes.forEach((sr,ci)=>{
    anchors.forEach((ss,ri)=>{
      items.push({...it,id:nextId(),baseRot:sr,anchorRot:ss,
                  x:it.x+gap*(ci+1),y:it.y+gap*ri,label:null,qId:null});
    });
  });
  renderCanvas();commit();
}

/* ================= absolute size readouts =================
   Width × height of the drawn figure on screen (sub-shapes included),
   converted with the screen calibration. Refreshed on every render. */
export function updateMmReadouts(){
  const figure=id=>{   // drawn figure's size on screen, from the rendered bounding box
    const g=document.querySelector(`g.item[data-id="${id}"]`);
    const it=findItem(id);
    if(!g||!it)return null;
    const bb=g.getBBox();
    return {w:bb.width*it.scale*view.z,h:bb.height*it.scale*view.z};
  };
  document.querySelectorAll(".mmReadout").forEach(el=>{
    let f=null, suffix="";
    if(el.dataset.item)f=figure(parseInt(el.dataset.item));
    else if(el.id==="qMm"){const q=findQuestion(sel.qId);if(q)f=figure(q.a);}
    if(!f){el.textContent="";return;}
    const wmm=pxToMm(f.w), hmm=pxToMm(f.h);
    el.textContent=`${wmm.toFixed(1)} × ${hmm.toFixed(1)} mm · ${formatDeg(visualAngleDeg(wmm))} × ${formatDeg(visualAngleDeg(hmm))}`+suffix+(calib.calibrated?"":" · uncalibrated");
    el.title=`width × height of the drawn figure on screen, in mm and in degrees of visual angle at ${calib.distanceCm} cm`;
    el.classList.toggle("uncal",!calib.calibrated);
  });
}

/* ================= wiring ================= */
function segToggle(containerId,onPick){
  document.querySelectorAll(`#${containerId} button`).forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll(`#${containerId} button`).forEach(x=>x.classList.toggle("on",x===b));
      onPick(b.dataset.v);
    };
  });
}
export function initConsole(){
  $("shapeInput").addEventListener("input",onShapeInput);
  $("anchorInput").addEventListener("input",onAnchorInput);
  $("shapeInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("anchorInput").focus();});
  $("anchorInput").addEventListener("keydown",e=>{if(e.key==="Enter")createShape();});
  $("varyInput").addEventListener("keydown",e=>{if(e.key==="Enter")applyVary();});

  segToggle("rvScope",v=>{ui.rvScope=v;});
  segToggle("gvMode",v=>{
    ui.gvMode=v;
    $("gvDegLabel").textContent=v==="relation"?"rotation A↔B,C":"turn everything";
  });

  $("qTitle").addEventListener("input",()=>{
    const q=findQuestion(sel.qId);
    if(q){q.title=$("qTitle").value;renderCanvas();commitSoon();}
  });
  $("qTitleRegen").addEventListener("click",()=>{
    const q=findQuestion(sel.qId);
    if(!q)return;
    regenerateTitle(q);
    $("qTitle").value=q.title;renderCanvas();commit();
  });
  $("qSize").addEventListener("input",()=>{
    const q=findQuestion(sel.qId);
    const v=parseFloat($("qSize").value);
    if(!q||isNaN(v))return;
    q.s=Math.max(0.2,Math.min(4,v/100));
    layoutQuestion(q);
    renderCanvas();commitSoon();
  });
  $("qRatio").addEventListener("input",()=>{
    const q=findQuestion(sel.qId);
    const v=parseFloat($("qRatio").value);
    if(!q||isNaN(v))return;
    q.anchorRatio=Math.max(0.02,Math.min(0.6,v/100));
    layoutQuestion(q);
    renderCanvas();commitSoon();
    // sync per-member ratio fields in the panel
    document.querySelectorAll('#qMembers input[data-f="anchorRatio"]').forEach(inp=>{
      if(document.activeElement!==inp)inp.value=Math.round(q.anchorRatio*100);
    });
  });
}
