/* Right-hand console: the creation panel, the three selection panels and
   the single-object operations they expose. */

import { BASE_R, DEFAULT_RATIO, parseShapeWithRot, shapeMarkup, norm, vertCount } from "./geometry.js";
import { rotateParams, parseVary } from "./variants.js";
import { draft, tray, items, sel, ui, view, nextId, resetDraft, clearSelection, findItem, findQuestion, removeItem } from "./state.js";
import { $ } from "./dom.js";
import { renderCanvas } from "./canvas.js";
import { layoutQuestion, renderQStruct } from "./questions.js";
import { addTrayItem, trayPreviewSVG } from "./tray.js";

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
      `<div class="frow"><span>${cfg.def.name}</span></div>`+
      `<div class="frow"><span>orient</span><input type="number" step="1" value="${norm(target.baseRot)}" data-f="baseRot">°</div>`+
      (cfg.showSize?`<div class="frow"><span>size</span><input type="number" step="5" min="20" max="400" value="${Math.round(target.scale*100)}" data-f="size">%</div>`:"")+
    `</div>`;
  wrap.appendChild(row1);
  if(hasAnchors){
    const row2=document.createElement("div");
    row2.className="spec";
    const orientable=!cfg.anchor.circle;
    row2.innerHTML=
      `<div class="pv">${miniSVG(cfg.anchor,target.anchorRot,true)}</div>`+
      `<div class="fields">`+
        `<div class="frow"><span>${cfg.anchor.name} × ${vertCount(cfg.def)}</span></div>`+
        (orientable?`<div class="frow"><span>orient</span><input type="number" step="1" value="${norm(target.anchorRot)}" data-f="anchorRot">°</div>`:"")+
        (cfg.showRatio===false?"":`<div class="frow"><span>relative size</span><input type="number" step="2" min="5" max="60" value="${Math.round((target.anchorRatio||DEFAULT_RATIO)*100)}" data-f="anchorRatio">%</div>`)+
        `<div class="seg" data-f="frame">`+
          `<button data-v="screen" class="${target.frame==="screen"?"on":""}">screen</button>`+
          `<button data-v="vertex" class="${target.frame==="vertex"?"on":""}">vertex</button>`+
        `</div>`+
      `</div>`;
    wrap.appendChild(row2);
  }
  wrap.querySelectorAll("input[data-f]").forEach(inp=>{
    inp.addEventListener("input",()=>{
      const f=inp.dataset.f;
      const v=parseFloat(inp.value);
      if(isNaN(v))return;
      if(f==="size"){target.scale=Math.max(0.2,Math.min(4,v/100));}
      else if(f==="anchorRatio"){target.anchorRatio=Math.max(0.05,Math.min(0.6,v/100));}
      else{target[f]=norm(v);}
      cfg.onChange();
      const pvs=wrap.querySelectorAll(".pv");
      if(pvs[0])pvs[0].innerHTML=miniSVG(cfg.def,target.baseRot);
      if(pvs[1])pvs[1].innerHTML=miniSVG(cfg.anchor,target.anchorRot,true);
    });
  });
  wrap.querySelectorAll('.seg[data-f="frame"] button').forEach(b=>{
    b.onclick=()=>{
      target.frame=b.dataset.v;
      b.parentElement.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b));
      cfg.onChange();
    };
  });
  container.appendChild(wrap);
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
}
function onAnchorInput(){
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
               baseRot:draft.baseRot,anchorRot:draft.anchorRot,frame:draft.frame,anchorRatio:draft.anchorRatio};
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
  $("shapeSpec").innerHTML="";
  $("anchorSection").style.display="none";$("createRow").style.display="none";
  resetDraft();
  $("shapeInput").focus();
}

/* ================= panels ================= */
export function showPanel(id){
  ["createPanel","selPanel","multiPanel","qPanel"].forEach(p=>$(p).classList.toggle("on",p===id));
}
export function deselect(){
  clearSelection();
  renderCanvas();showPanel("createPanel");
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
        renderCanvas();
      };
    });
    $("varyInput").value="";$("errVary").textContent="";
  }
  showPanel("selPanel");
}
export function openMultiPanel(){
  $("multiInfo").textContent=sel.ids.length+" objects selected";
  const free=sel.ids.filter(id=>{const it=findItem(id);return it&&!it.qId;});
  const ok=sel.ids.length===3&&free.length===3;
  $("makeQBtn").disabled=!ok;
  $("errMulti").textContent=
    sel.ids.length!==3?"a question needs exactly 3 objects":
    free.length!==3?"some objects already belong to a question":"";
  showPanel("multiPanel");
}
export function openQPanel(){
  const q=findQuestion(sel.qId);
  if(!q){showPanel("createPanel");return;}
  $("qTitle").value=q.title;
  $("qSize").value=Math.round(q.s*100);
  $("qRatio").value=Math.round((q.anchorRatio||DEFAULT_RATIO)*100);
  const container=$("qMembers");
  container.innerHTML="";
  [["A",q.a],["B",q.b],["C",q.c]].forEach(([lab,id])=>{
    const it=findItem(id);
    if(!it)return;
    const h=document.createElement("div");
    h.className="memberHead";h.textContent=lab;
    container.appendChild(h);
    buildSpecRows(container,it,{def:it.trayRef.def,anchor:it.trayRef.anchor,showSize:false,showRatio:false,onChange:()=>{renderCanvas();renderQStruct(q);}});
  });
  renderQStruct(q);
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
  removeItem(sel.id);
  deselect();
}
export function deleteMulti(){
  sel.ids.forEach(id=>{
    const it=findItem(id);
    if(it&&it.qId)return; // grouped objects are deleted via their question
    removeItem(id);
  });
  deselect();
}
export function duplicateSelected(){
  const it=findItem(sel.id);
  if(!it)return;
  const copy={...it,id:nextId(),x:it.x+30/view.z,y:it.y+30/view.z,label:null,qId:null};
  items.push(copy);
  sel.id=copy.id;
  renderCanvas();openSelPanel();
}
export function makeVariant(){
  const it=findItem(sel.id);
  if(!it)return;
  const d=parseFloat($("rvDeg").value);
  if(isNaN(d))return;
  const v={...rotateParams(it,ui.rvScope,d),id:nextId(),x:it.x+BASE_R*2.6*it.scale,label:null,qId:null};
  items.push(v);
  sel.id=v.id;
  renderCanvas();openSelPanel();
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
  renderCanvas();
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
    if(q){q.title=$("qTitle").value;renderCanvas();}
  });
  $("qSize").addEventListener("input",()=>{
    const q=findQuestion(sel.qId);
    const v=parseFloat($("qSize").value);
    if(!q||isNaN(v))return;
    q.s=Math.max(0.2,Math.min(4,v/100));
    layoutQuestion(q);
    renderCanvas();
  });
  $("qRatio").addEventListener("input",()=>{
    const q=findQuestion(sel.qId);
    const v=parseFloat($("qRatio").value);
    if(!q||isNaN(v))return;
    q.anchorRatio=Math.max(0.05,Math.min(0.6,v/100));
    layoutQuestion(q);
    renderCanvas();
    // sync per-member ratio fields in the panel
    document.querySelectorAll('#qMembers input[data-f="anchorRatio"]').forEach(inp=>{
      if(document.activeElement!==inp)inp.value=Math.round(q.anchorRatio*100);
    });
  });
}
