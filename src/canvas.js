/* The SVG canvas: rendering of items/questions/selection and all pointer,
   wheel and keyboard interaction. */

import { BASE_R, DEFAULT_RATIO, LABEL_GAP, shapeMarkup, norm } from "./geometry.js";
import { items, questions, experiments, texts, sel, view, findItem, findQuestion, findExperiment, findText } from "./state.js";
import { selectText, editText, newTextAt, deleteText } from "./texts.js";
import { spinAngles, spinPhases } from "./spin.js";
import { experimentsOf, experimentCode, isMember } from "./experiment.js";
import { toggleMembership, refreshExpBar } from "./run.js";
import { $, escapeXML } from "./dom.js";
import { openSelPanel, openQPanel, openMultiPanel, deselect, deleteSelected, deleteMulti, duplicateSelected, syncSelPanelNumbers, updateMmReadouts } from "./console.js";
import { calib, pxToMm, formatMm } from "./calibration.js";
import { layoutQuestion, deleteQuestion, questionFrame } from "./questions.js";
import { commit, commitSoon } from "./history.js";


let svg=null;
let rubber=null; // {x0,y0,x1,y1} world coords
let hoverId=null, hoverTimer=null, hoverCandidate=null;   // dwell-to-measure
let hoverQ=null;   // question highlighted from the experiment panel's list
export function setHoverQuestion(id){if(hoverQ!==id){hoverQ=id;renderCanvas();}}

/* Dimension lines for an object, as on a technical drawing: width below,
   height on the right, each a hairline with end ticks and the size in mm.
   Measured from the drawn figure's bounding box (sub-shapes included), in
   world coordinates; strokes and text stay 1:1 on screen. */
function dimensionMarkup(it,bb,hover,boxed){
  const z=view.z, s=it.scale, sel=boxed?BASE_R*1.25*s:-Infinity;   // clear the selection box when there is one
  const x0=it.x+bb.x*s, x1=x0+bb.width*s, y0=it.y+bb.y*s, y1=y0+bb.height*s;
  const tick=5/z, w=1/z, f=12/z;
  const wy=Math.max(y1,it.y+sel)+9/z;          // width line: below the figure (and the selection box)
  const hx=Math.max(x1,it.x+sel)+9/z;          // height line: right of them
  const mmW=(calib.calibrated?"":"≈ ")+formatMm(pxToMm(bb.width*s*z));
  const mmH=(calib.calibrated?"":"≈ ")+formatMm(pxToMm(bb.height*s*z));
  const ln=(a,b,c,d)=>`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#9a9a9a" stroke-width="${w}"/>`;
  return `<g class="dim${hover?" dimHover":""}" pointer-events="none">`+
    ln(x0,wy,x1,wy)+ln(x0,wy-tick,x0,wy+tick)+ln(x1,wy-tick,x1,wy+tick)+
    `<text x="${(x0+x1)/2}" y="${wy+14/z}" text-anchor="middle" font-family="monospace" font-size="${f}" fill="#555">${mmW}</text>`+
    ln(hx,y0,hx,y1)+ln(hx-tick,y0,hx+tick,y0)+ln(hx-tick,y1,hx+tick,y1)+
    `<text x="${hx+7/z}" y="${(y0+y1)/2+f*0.35}" text-anchor="start" font-family="monospace" font-size="${f}" fill="#555">${mmH}</text>`+
    `</g>`;
}

/* The object under a pointer event. A texture has gaps between its
   elements; a press inside the extent of a textured object counts as a
   press on it (topmost first), so it can be picked up anywhere. */
function itemElementAt(e){
  const g=e.target.closest&&e.target.closest("g.item");
  if(g||!svg||(e.target.closest&&e.target.closest("text")))return g;
  const rect=svg.getBoundingClientRect();
  const pt=toWorld(e.clientX-rect.left,e.clientY-rect.top);
  for(let i=items.length-1;i>=0;i--){
    const it=items[i];
    if(!it.texture)continue;
    const el=svg.querySelector(`g.item[data-id="${it.id}"]`);
    if(!el)continue;
    const bb=el.getBBox(), s=it.scale;
    if(pt.x>=it.x+bb.x*s&&pt.x<=it.x+(bb.x+bb.width)*s&&pt.y>=it.y+bb.y*s&&pt.y<=it.y+(bb.y+bb.height)*s)return el;
  }
  return null;
}

export function toWorld(px,py){return {x:(px-view.tx)/view.z, y:(py-view.ty)/view.z};}

export function renderCanvas(){
  if(!svg)return;
  $("emptyHint").style.display=items.length?"none":"block";
  $("emptyHint").textContent=document.querySelector(".trayItem")?"drag a shape here":"name a shape in the console to begin →";
  $("zoomBadge").textContent=Math.round(view.z*100)+"%";
  const dimItems=[];
  // lens: while an experiment panel is open, non-member questions fade and titles get a toggle box
  const lens=sel.expId!=null?findExperiment(sel.expId):null;
  const faded=new Set(lens?questions.filter(q=>!isMember(lens,q.id)).map(q=>q.id):[]);
  const now=performance.now();
  let out=`<g transform="translate(${view.tx},${view.ty}) scale(${view.z})">`;
  // free texts first, so a title never covers a stimulus
  texts.forEach(t=>{
    const lines=t.text.split("\n"), chosen=t.id===sel.tId||sel.tIds.includes(t.id);
    out+=`<text data-tid="${t.id}" x="${t.x}" y="${t.y}" font-family="monospace" font-size="${t.size}" fill="#111" style="cursor:move;user-select:none">`+
      lines.map((l,i)=>`<tspan x="${t.x}" dy="${i?1.25*t.size:0}">${escapeXML(l)||"\u00a0"}</tspan>`).join("")+`</text>`;
    if(chosen){
      const w=Math.max(1,...lines.map(l=>l.length))*0.6*t.size+10, h=(lines.length-1)*1.25*t.size+t.size*1.3+6;
      out+=`<rect x="${t.x-5}" y="${t.y-t.size-3}" width="${w}" height="${h}" fill="none" stroke="#4a90d9" stroke-width="${1/view.z}" stroke-dasharray="${4/view.z} ${3/view.z}" pointer-events="none"/>`;
    }
  });
  questions.forEach(q=>{
    const A=findItem(q.a);
    if(!A)return;
    const ty=A.y-BASE_R*1.25*A.scale-26;
    const selQ=q.id===sel.qId;
    const codes=experimentsOf(q.id,experiments).map(experimentCode).join(" ");
    const box=lens?`<tspan data-toggle-q="${q.id}" font-size="16">${isMember(lens,q.id)?"■":"□"}</tspan> `:"";
    out+=`<text data-qid="${q.id}" x="${q.cx}" y="${ty}" text-anchor="middle" font-family="monospace" font-size="14" fill="#111"`+
         `${faded.has(q.id)?' class="lensOut"':""} style="cursor:pointer;text-decoration:${selQ?"underline":"none"}">${box}${escapeXML(q.title)}`+
         (codes?`<tspan fill="#6b6b6b" font-size="12"> ${codes}</tspan>`:"")+`</text>`;
    if(selQ||q.id===hoverQ||sel.qIds.includes(q.id)){
      // frame: the members' extent (shared presentation layout) with the title above and the labels below
      const f=questionFrame(q);
      if(f)out+=`<rect x="${f.x0}" y="${f.y0}" width="${f.x1-f.x0}" height="${f.y1-f.y0}" fill="none" stroke="#4a90d9" stroke-width="${1/view.z}" stroke-dasharray="${5/view.z} ${4/view.z}"/>`;
    }
  });
  items.forEach(it=>{
    const e=it.trayRef;
    const fade=it.qId!=null&&faded.has(it.qId)?' class="lensOut"':"";
    out+=`<g class="item${fade?" lensOut":""}" data-id="${it.id}" transform="translate(${it.x},${it.y}) scale(${it.scale})">`+itemMarkup(it,now)+`</g>`;
    if(it.label){
      const ly=it.y+BASE_R*LABEL_GAP*it.scale+24; // A/B/C sit clear of the sub-shapes
      out+=`<text${fade} x="${it.x}" y="${ly}" text-anchor="middle" font-family="monospace" font-size="17" font-weight="700" fill="#111">${escapeXML(it.label)}</text>`;
    }
    const inMulti=sel.ids.includes(it.id);
    // measurement: pinned, or the selected object (or a member of the selected question), or after dwelling on one
    const chosen=it.id===sel.id||(sel.qId!=null&&it.qId===sel.qId);
    if(it.showMm||chosen||it.id===hoverId)dimItems.push({it,hover:!it.showMm&&!chosen,boxed:it.id===sel.id||inMulti});
    if(it.id===sel.id||inMulti){
      const b=BASE_R*1.25*it.scale, hs=7/view.z;
      out+=`<g transform="translate(${it.x},${it.y})">`+
        `<rect x="${-b}" y="${-b}" width="${2*b}" height="${2*b}" fill="none" stroke="#4a90d9" stroke-width="${1/view.z}" stroke-dasharray="${4/view.z} ${3/view.z}"/>`;
      if(it.id===sel.id&&!it.qId){
        out+=`<rect data-h="scale" x="${b-hs}" y="${b-hs}" width="${2*hs}" height="${2*hs}" fill="#fff" stroke="#4a90d9" stroke-width="${1/view.z}" style="cursor:nwse-resize"/>`+
             `<line x1="0" y1="${-b}" x2="0" y2="${-b-22/view.z}" stroke="#4a90d9" stroke-width="${1/view.z}"/>`+
             `<circle data-h="rot" cx="0" cy="${-b-28/view.z}" r="${6.5/view.z}" fill="#fff" stroke="#4a90d9" stroke-width="${1.25/view.z}" style="cursor:crosshair"/>`;
      }
      out+=`</g>`;
    }
  });
  if(rubber){
    const x=Math.min(rubber.x0,rubber.x1), y=Math.min(rubber.y0,rubber.y1);
    const w=Math.abs(rubber.x1-rubber.x0), h=Math.abs(rubber.y1-rubber.y0);
    out+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(74,144,217,0.06)" stroke="#4a90d9" stroke-width="${1/view.z}" stroke-dasharray="${3/view.z} ${3/view.z}"/>`;
  }
  out+="</g>";
  svg.innerHTML=out;
  syncSpin();
  // dimension lines need the drawn figure's bounding box, so they are added after the render
  if(dimItems.length){
    const root=svg.firstElementChild;
    dimItems.forEach(({it,hover,boxed})=>{
      const g=svg.querySelector(`g.item[data-id="${it.id}"]`);
      if(g)root.insertAdjacentHTML("beforeend",dimensionMarkup(it,g.getBBox(),hover,boxed));
    });
  }
  updateMmReadouts();
}

/* ================= interaction ================= */
let mode=null, dragIt=null, dragQ=null, dragT=null, start={};
let spaceHeld=false;

/* ---- continuous rotation on the canvas ----
   every object is drawn at the phase its spin has reached on one shared
   clock, so a re-render never makes it jump; while anything turns, a frame
   loop redraws just those objects */
const SPIN_T0=performance.now();
function itemMarkup(it,now=performance.now()){
  const e=it.trayRef, ph=spinPhases(it.spin,now-SPIN_T0), a=spinAngles(it,ph.phase,ph.sub);
  return shapeMarkup(e.def,BASE_R,e.anchor,it.frame,a.baseRot,a.anchorRot,it.anchorRatio||DEFAULT_RATIO,it.texture||0,!!it.contour);
}
let spinRaf=0;
function spinTick(now){
  spinRaf=0;
  items.forEach(it=>{
    if(!(it.spin&&(it.spin.dps||it.spin.sub)))return;
    const el=svg.querySelector(`g.item[data-id="${it.id}"]`);
    if(el)el.innerHTML=itemMarkup(it,now);
  });
  syncSpin();
}
function syncSpin(){
  const any=svg&&items.some(it=>it.spin&&(it.spin.dps||it.spin.sub));
  if(any&&!spinRaf)spinRaf=requestAnimationFrame(spinTick);
  if(!any&&spinRaf){cancelAnimationFrame(spinRaf);spinRaf=0;}
}
const TEXT_BASELINE=12;   // a new text's baseline sits a little below the double-clicked point, so the text starts there
function selectQuestion(q,pt,pointerId){
  sel.qId=q.id;sel.id=null;sel.ids=[];sel.qIds=[];sel.expId=null;
  mode="moveQ";dragQ=q;
  start={dx:pt.x-q.cx,dy:pt.y-q.cy};
  renderCanvas();openQPanel();
  svg.setPointerCapture(pointerId);
}
/* ---- choosing several: free objects and whole questions ----
   shift-click adds the pressed object or question to the selection, or takes
   it out again; what was singly selected joins it. */
function toggleSelection(id,qid,tid){
  const ids=new Set(sel.ids), qids=new Set(sel.qIds), tids=new Set(sel.tIds);
  if(sel.id!=null)ids.add(sel.id);
  if(sel.qId!=null)qids.add(sel.qId);
  if(sel.tId!=null)tids.add(sel.tId);
  if(id!=null){if(ids.has(id))ids.delete(id);else ids.add(id);}
  if(qid!=null){if(qids.has(qid))qids.delete(qid);else qids.add(qid);}
  if(tid!=null){if(tids.has(tid))tids.delete(tid);else tids.add(tid);}
  sel.id=null;sel.qId=null;sel.tId=null;sel.ids=[...ids];sel.qIds=[...qids];sel.tIds=[...tids];
  settleSelection();
}
/* a selection of one thing is that thing's own selection */
function settleSelection(){
  const n=sel.ids.length, m=sel.qIds.length, k=sel.tIds.length;
  if(n===1&&!m&&!k){sel.id=sel.ids[0];sel.ids=[];renderCanvas();openSelPanel();}
  else if(m===1&&!n&&!k){sel.qId=sel.qIds[0];sel.qIds=[];renderCanvas();openQPanel();}
  else if(k===1&&!n&&!m){const id=sel.tIds[0];sel.tIds=[];selectText(id);}
  else if(!n&&!m&&!k)deselect();
  else{renderCanvas();openMultiPanel();}
}
/* dragging one of the chosen things moves them all; a press that does not travel picks just that one */
let multi=null;
function beginMoveMulti(pt,pointerId,pick){
  multi={x0:pt.x,y0:pt.y,moved:false,pick,
         its:sel.ids.map(findItem).filter(Boolean).map(it=>({it,x:it.x,y:it.y})),
         qs:sel.qIds.map(findQuestion).filter(Boolean).map(q=>({q,cx:q.cx,cy:q.cy})),
         ts:sel.tIds.map(findText).filter(Boolean).map(t=>({t,x:t.x,y:t.y}))};
  mode="moveMulti";
  svg.setPointerCapture(pointerId);
}

/* A double-click is detected here, from two presses within 400 ms and a few
   pixels: a press re-renders the canvas, after which the browser sees a
   different element under the pointer and reports no double-click on it. */
let lastPress={t:0,x:0,y:0};
function editMember(it){
  const hadExp=sel.expId!=null;
  sel.id=it.id;sel.qId=null;sel.ids=[];sel.qIds=[];sel.tIds=[];sel.tId=null;sel.expId=null;
  mode=null;dragQ=null;
  renderCanvas();
  openSelPanel();
  if(hadExp)refreshExpBar();
}
function onPointerDown(e){
  const t=e.target;
  const h=t.dataset&&t.dataset.h;
  const now=performance.now();
  const dbl=!e.shiftKey&&now-lastPress.t<400&&Math.hypot(e.clientX-lastPress.x,e.clientY-lastPress.y)<6;
  lastPress=dbl||e.shiftKey?{t:0,x:0,y:0}:{t:now,x:e.clientX,y:e.clientY};   // a shift-press chooses; it never starts a double-click
  const tEl=t.closest&&t.closest("text[data-qid]");   // the code tspan inside a title counts as the title
  const qid=tEl?tEl.dataset.qid:undefined;
  const gEl=itemElementAt(e);
  const rect=svg.getBoundingClientRect();
  const px=e.clientX-rect.left, py=e.clientY-rect.top;
  const pt=toWorld(px,py);

  if(spaceHeld||e.button===1){
    mode="pan";start={px,py,tx:view.tx,ty:view.ty};
    svg.classList.add("panning");
    svg.setPointerCapture(e.pointerId);
    return;
  }
  // lens toggle box on a title: membership only, no selection change
  const tq=t.dataset&&t.dataset.toggleQ;
  if(tq&&sel.expId!=null){
    e.preventDefault();
    toggleMembership(findExperiment(sel.expId),parseInt(tq));
    return;
  }
  sel.expId=null;   // any other press ends the lens
  const tt=t.closest&&t.closest("text[data-tid]");
  if(tt){
    // a free text: chosen with shift, moved with the selection, or selected and dragged
    const tid=parseInt(tt.dataset.tid);
    if(dbl){e.preventDefault();selectText(tid);editText(findText(tid));return;}   // no mouse events follow, so the editor keeps the focus
    if(e.shiftKey){toggleSelection(null,null,tid);return;}
    if(sel.tIds.includes(tid)){beginMoveMulti(pt,e.pointerId,{tid});return;}
    selectText(tid);
    dragT=findText(tid);mode="moveT";start={dx:pt.x-dragT.x,dy:pt.y-dragT.y};
    svg.setPointerCapture(e.pointerId);
    return;
  }
  if(qid){
    const q=findQuestion(parseInt(qid));
    if(e.shiftKey){toggleSelection(null,q.id);return;}
    if(sel.qIds.includes(q.id)){beginMoveMulti(pt,e.pointerId,{q});return;}
    selectQuestion(q,pt,e.pointerId);
    return;
  }
  if(h&&sel.id!=null){
    dragIt=findItem(sel.id);
    mode=h;
    start={scale:dragIt.scale,rot:dragIt.baseRot,
           d0:Math.hypot(pt.x-dragIt.x,pt.y-dragIt.y),
           a0:Math.atan2(pt.y-dragIt.y,pt.x-dragIt.x)*180/Math.PI};
  }else if(gEl){
    const id=parseInt(gEl.dataset.id);
    const it=findItem(id);
    if(it.qId){
      // member of a question: the whole question — chosen with shift, moved with the selection, or selected and dragged
      const q=findQuestion(it.qId);
      if(dbl){editMember(it);return;}   // double-click: the member on its own, for editing
      if(e.shiftKey){toggleSelection(null,q.id);return;}
      if(sel.qIds.includes(q.id)){beginMoveMulti(pt,e.pointerId,{q});return;}
      selectQuestion(q,pt,e.pointerId);
      return;
    }
    if(e.shiftKey){toggleSelection(id,null);return;}   // shift-click → in or out of the selection (no drag)
    if(sel.ids.includes(id)){beginMoveMulti(pt,e.pointerId,{id});return;}
    sel.id=id;sel.ids=[];sel.qIds=[];sel.qId=null;
    dragIt=it;
    mode="move";
    start={dx:pt.x-it.x,dy:pt.y-it.y};
    renderCanvas();openSelPanel();
  }else if(e.shiftKey){
    // shift-drag on empty canvas → rubber band selection
    sel.id=null;sel.ids=[];sel.qIds=[];sel.qId=null;
    mode="rubber";
    rubber={x0:pt.x,y0:pt.y,x1:pt.x,y1:pt.y};
    renderCanvas();
  }else{
    // drag on empty canvas → pan the view (and drop any selection)
    mode="pan";start={px,py,tx:view.tx,ty:view.ty};
    svg.classList.add("panning");
    deselect();
  }
  svg.setPointerCapture(e.pointerId);
}
/* dwell 1.2 s over an object → show its dimension; any movement elsewhere hides it */
const DWELL_MS=1200;
function trackHover(e){
  const gEl=itemElementAt(e);
  const id=gEl?parseInt(gEl.dataset.id):null;
  if(id!==hoverCandidate){
    hoverCandidate=id;
    clearTimeout(hoverTimer);hoverTimer=null;
    if(hoverId!=null){hoverId=null;renderCanvas();}
  }
  if(id!=null&&hoverId!==id&&!hoverTimer){
    hoverTimer=setTimeout(()=>{hoverTimer=null;if(hoverCandidate===id){hoverId=id;renderCanvas();}},DWELL_MS);
  }
}
function clearHover(){
  hoverCandidate=null;clearTimeout(hoverTimer);hoverTimer=null;
  if(hoverId!=null){hoverId=null;renderCanvas();}
}
function onPointerMove(e){
  if(!mode){trackHover(e);return;}
  if(hoverId!=null||hoverTimer)clearHover();
  const rect=svg.getBoundingClientRect();
  const px=e.clientX-rect.left, py=e.clientY-rect.top;
  if(mode==="pan"){
    view.tx=start.tx+(px-start.px);
    view.ty=start.ty+(py-start.py);
    renderCanvas();return;
  }
  const pt=toWorld(px,py);
  if(mode==="rubber"){
    rubber.x1=pt.x;rubber.y1=pt.y;
    renderCanvas();return;
  }
  if(mode==="moveQ"&&dragQ){
    dragQ.cx=pt.x-start.dx;
    dragQ.cy=pt.y-start.dy;
    layoutQuestion(dragQ);
    renderCanvas();return;
  }
  if(mode==="moveMulti"&&multi){
    const dx=pt.x-multi.x0, dy=pt.y-multi.y0;
    if(!multi.moved&&Math.hypot(dx,dy)*view.z<3)return;   // not travelled yet: still a click
    multi.moved=true;
    multi.its.forEach(o=>{o.it.x=o.x+dx;o.it.y=o.y+dy;});
    multi.qs.forEach(o=>{o.q.cx=o.cx+dx;o.q.cy=o.cy+dy;layoutQuestion(o.q);});
    multi.ts.forEach(o=>{o.t.x=o.x+dx;o.t.y=o.y+dy;});
    renderCanvas();return;
  }
  if(mode==="moveT"&&dragT){
    dragT.x=pt.x-start.dx;dragT.y=pt.y-start.dy;
    renderCanvas();return;
  }
  if(!dragIt)return;
  if(mode==="move"){dragIt.x=pt.x-start.dx;dragIt.y=pt.y-start.dy;}
  else if(mode==="scale"){
    const d=Math.hypot(pt.x-dragIt.x,pt.y-dragIt.y);
    dragIt.scale=Math.max(0.2,Math.min(4,start.scale*d/start.d0));
    syncSelPanelNumbers();
  }
  else if(mode==="rot"){
    const a=Math.atan2(pt.y-dragIt.y,pt.x-dragIt.x)*180/Math.PI;
    let r=start.rot+(a-start.a0);
    if(e.shiftKey)r=Math.round(r/15)*15;
    dragIt.baseRot=norm(r);
    syncSelPanelNumbers();
  }
  renderCanvas();
}
function onPointerUp(){
  if(mode==="rubber"&&rubber){
    const x0=Math.min(rubber.x0,rubber.x1), x1=Math.max(rubber.x0,rubber.x1);
    const y0=Math.min(rubber.y0,rubber.y1), y1=Math.max(rubber.y0,rubber.y1);
    // an object is caught when its box overlaps the band
    const caught=items.filter(i=>{const b=BASE_R*1.25*i.scale;return i.x+b>=x0&&i.x-b<=x1&&i.y+b>=y0&&i.y-b<=y1;});
    rubber=null;
    // free objects are chosen one by one; a question is chosen whole when any member is caught
    sel.ids=caught.filter(i=>!i.qId).map(i=>i.id);
    sel.qIds=[...new Set(caught.filter(i=>i.qId).map(i=>i.qId))];
    sel.tIds=texts.filter(t=>t.x>=x0&&t.x<=x1&&t.y>=y0&&t.y<=y1).map(t=>t.id);   // a text by where it starts
    sel.id=null;sel.qId=null;sel.tId=null;
    settleSelection();
  }
  if(mode==="moveMulti"&&multi){
    if(multi.moved)commit();
    else{   // a plain click on one of the chosen: just that one
      const p=multi.pick;
      sel.ids=[];sel.qIds=[];sel.tIds=[];
      if(p.q){sel.qId=p.q.id;sel.id=null;sel.tId=null;renderCanvas();openQPanel();}
      else if(p.tid!=null)selectText(p.tid);
      else{sel.id=p.id;sel.qId=null;sel.tId=null;renderCanvas();openSelPanel();}
    }
  }
  if(mode==="move"||mode==="moveQ"||mode==="moveT"||mode==="scale"||mode==="rot")commit();
  mode=null;dragIt=null;dragQ=null;dragT=null;multi=null;svg.classList.remove("panning");
}
function onDblClick(e){
  const tt=e.target.closest&&e.target.closest("text[data-tid]");
  if(tt){const t=findText(parseInt(tt.dataset.tid));if(t){selectText(t.id);editText(t);}return;}
  const gEl=itemElementAt(e);
  if(!gEl){
    // empty canvas (not a question title): write a title or note here
    if(e.target.closest&&e.target.closest("text"))return;
    const rect=svg.getBoundingClientRect(), pt=toWorld(e.clientX-rect.left,e.clientY-rect.top);
    newTextAt(pt.x,pt.y+TEXT_BASELINE);
    return;
  }
  const it=findItem(parseInt(gEl.dataset.id));
  if(!it||!it.qId)return; // ungrouped objects already open on single click
  editMember(it);   // a browser that does report the double-click, or a synthetic one
}
function onWheel(e){
  e.preventDefault();
  const rect=svg.getBoundingClientRect();
  const px=e.clientX-rect.left, py=e.clientY-rect.top;
  if(e.ctrlKey||e.metaKey){
    const f=e.deltaY<0?1.08:0.93;
    const z2=Math.max(0.2,Math.min(4,view.z*f));
    view.tx=px-(px-view.tx)*(z2/view.z);
    view.ty=py-(py-view.ty)*(z2/view.z);
    view.z=z2;
  }else{
    view.tx-=e.deltaX;
    view.ty-=e.deltaY;
  }
  renderCanvas();
}
/* text entry gets the keys; checkboxes, radios, sliders and buttons do not */
export function isTyping(){
  const el=document.activeElement;
  if(!el)return false;
  if(el.tagName==="TEXTAREA"||el.tagName==="SELECT"||el.isContentEditable)return true;
  return el.tagName==="INPUT"&&!/^(checkbox|radio|range|button|submit|file|color)$/i.test(el.type||"");
}
function onKeyDown(e){
  const covered=!$("run").hidden||!$("calib").hidden||!$("tour").hidden||document.querySelector(".modal:not([hidden])");
  if(isTyping()||covered)return;
  if(e.code==="Space"){spaceHeld=true;}
  if(e.key==="Escape"&&(sel.id!=null||sel.ids.length||sel.qIds.length||sel.tIds.length||sel.qId!=null||sel.tId!=null||sel.expId!=null)){deselect();return;}
  // arrow keys nudge the selection (shift: ×10); screen pixels, so it feels the same at any zoom
  const arrow={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(arrow){
    const step=(e.shiftKey?10:1)/view.z;
    const it=sel.id!=null?findItem(sel.id):null;
    const q=sel.qId!=null?findQuestion(sel.qId):null;
    const tx=sel.tId!=null?findText(sel.tId):null;
    if(it&&!it.qId){it.x+=arrow[0]*step;it.y+=arrow[1]*step;}
    else if(q){q.cx+=arrow[0]*step;q.cy+=arrow[1]*step;layoutQuestion(q);}
    else if(tx){tx.x+=arrow[0]*step;tx.y+=arrow[1]*step;}
    else return;
    e.preventDefault();renderCanvas();commitSoon();return;
  }
  // a question member (opened by double-click) is edited, never deleted or duplicated on its own
  const grouped=sel.id!=null&&!!(findItem(sel.id)||{}).qId;
  if(e.key==="Backspace"||e.key==="Delete"){
    if(sel.tId!=null)deleteText();
    else if(sel.id!=null){if(!grouped)deleteSelected();}
    else if(sel.ids.length||sel.qIds.length||sel.tIds.length)deleteMulti();
    else if(sel.qId!=null)deleteQuestion();
  }
  if((e.metaKey||e.ctrlKey)&&e.key==="d"&&sel.id!=null&&!grouped){
    e.preventDefault();duplicateSelected();
  }
}
function onKeyUp(e){
  if(e.code==="Space")spaceHeld=false;
}

export function resetView(){view.tx=0;view.ty=0;view.z=1;renderCanvas();}
/* zoom by a factor around the middle of the visible canvas */
export function zoomBy(f){
  const rect=svg.getBoundingClientRect();
  const px=rect.width/2, py=rect.height/2;
  const z2=Math.max(0.2,Math.min(4,view.z*f));
  view.tx=px-(px-view.tx)*(z2/view.z);
  view.ty=py-(py-view.ty)*(z2/view.z);
  view.z=z2;
  renderCanvas();
}
export const zoomIn=()=>zoomBy(1.25);
export const zoomOut=()=>zoomBy(1/1.25);

export function initCanvas(){
  svg=$("canvas");
  svg.addEventListener("pointerdown",onPointerDown);
  svg.addEventListener("pointermove",onPointerMove);
  svg.addEventListener("pointerleave",clearHover);
  svg.addEventListener("pointerup",onPointerUp);
  svg.addEventListener("dblclick",onDblClick);
  svg.addEventListener("wheel",onWheel,{passive:false});
  window.addEventListener("keydown",onKeyDown);
  window.addEventListener("keyup",onKeyUp);
  $("zoomBadge").onclick=resetView;
  new ResizeObserver(()=>renderCanvas()).observe($("canvasWrap"));
  renderCanvas();
}
