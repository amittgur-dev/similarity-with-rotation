/* The SVG canvas: rendering of items/questions/selection and all pointer,
   wheel and keyboard interaction. */

import { BASE_R, Q_DX, Q_DY, DEFAULT_RATIO, shapeMarkup, norm } from "./geometry.js";
import { items, questions, sel, view, findItem, findQuestion } from "./state.js";
import { $, escapeXML } from "./dom.js";
import { openSelPanel, openQPanel, openMultiPanel, deselect, deleteSelected, deleteMulti, duplicateSelected, syncSelPanelNumbers, updateMmReadouts } from "./console.js";
import { calib, pxToMm, formatMm } from "./calibration.js";
import { layoutQuestion, deleteQuestion } from "./questions.js";

const LABEL_GAP=1.55;   // label distance below an object center, × BASE_R × scale

let svg=null;
let rubber=null; // {x0,y0,x1,y1} world coords
let hoverId=null, hoverTimer=null, hoverCandidate=null;   // dwell-to-measure

/* Dimension lines for an object, as on a technical drawing: width below,
   height on the right, each a hairline with end ticks and the size in mm.
   Measured from the drawn figure's bounding box (sub-shapes included), in
   world coordinates; strokes and text stay 1:1 on screen. */
function dimensionMarkup(it,bb,hover,boxed){
  const z=view.z, s=it.scale, sel=boxed?BASE_R*1.25*s:-Infinity;   // clear the selection box when there is one
  const x0=it.x+bb.x*s, x1=x0+bb.width*s, y0=it.y+bb.y*s, y1=y0+bb.height*s;
  const tick=5/z, w=1/z, f=10.5/z;
  const wy=Math.max(y1,it.y+sel)+9/z;          // width line: below the figure (and the selection box)
  const hx=Math.max(x1,it.x+sel)+9/z;          // height line: right of them
  const mmW=(calib.calibrated?"":"≈ ")+formatMm(pxToMm(bb.width*s*z));
  const mmH=(calib.calibrated?"":"≈ ")+formatMm(pxToMm(bb.height*s*z));
  const ln=(a,b,c,d)=>`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#9a9a9a" stroke-width="${w}"/>`;
  return `<g class="dim${hover?" dimHover":""}" pointer-events="none">`+
    ln(x0,wy,x1,wy)+ln(x0,wy-tick,x0,wy+tick)+ln(x1,wy-tick,x1,wy+tick)+
    `<text x="${(x0+x1)/2}" y="${wy+13/z}" text-anchor="middle" font-family="monospace" font-size="${f}" fill="#7a7a7a">${mmW}</text>`+
    ln(hx,y0,hx,y1)+ln(hx-tick,y0,hx+tick,y0)+ln(hx-tick,y1,hx+tick,y1)+
    `<text x="${hx+7/z}" y="${(y0+y1)/2+f*0.35}" text-anchor="start" font-family="monospace" font-size="${f}" fill="#7a7a7a">${mmH}</text>`+
    `</g>`;
}

export function toWorld(px,py){return {x:(px-view.tx)/view.z, y:(py-view.ty)/view.z};}

export function renderCanvas(){
  if(!svg)return;
  $("emptyHint").style.display=items.length?"none":"block";
  $("zoomBadge").textContent=Math.round(view.z*100)+"%";
  const dimItems=[];
  let out=`<g transform="translate(${view.tx},${view.ty}) scale(${view.z})">`;
  questions.forEach(q=>{
    const A=findItem(q.a);
    if(!A)return;
    const ty=A.y-BASE_R*1.25*A.scale-26;
    const selQ=q.id===sel.qId;
    out+=`<text data-qid="${q.id}" x="${q.cx}" y="${ty}" text-anchor="middle" font-family="monospace" font-size="13" fill="#111" style="cursor:pointer;text-decoration:${selQ?"underline":"none"}">${q.inExp?"★ ":""}${escapeXML(q.title)}</text>`;
    if(selQ){
      const dx=BASE_R*Q_DX*q.s+BASE_R*1.4*q.s, dy=BASE_R*Q_DY*q.s+BASE_R*LABEL_GAP*q.s+30;
      out+=`<rect x="${q.cx-dx}" y="${q.cy-dy-14}" width="${2*dx}" height="${2*dy+14}" fill="none" stroke="#4a90d9" stroke-width="${1/view.z}" stroke-dasharray="${5/view.z} ${4/view.z}"/>`;
    }
  });
  items.forEach(it=>{
    const e=it.trayRef;
    out+=`<g class="item" data-id="${it.id}" transform="translate(${it.x},${it.y}) scale(${it.scale})">`+
         shapeMarkup(e.def,BASE_R,e.anchor,it.frame,it.baseRot,it.anchorRot,it.anchorRatio||DEFAULT_RATIO)+`</g>`;
    if(it.label){
      const ly=it.y+BASE_R*LABEL_GAP*it.scale+24; // A/B/C sit clear of the sub-shapes
      out+=`<text x="${it.x}" y="${ly}" text-anchor="middle" font-family="monospace" font-size="15" font-weight="700" fill="#111">${it.label}</text>`;
    }
    const inMulti=sel.ids.includes(it.id);
    // measurement: pinned, or the selected object (or a member of the selected question), or after dwelling on one
    const chosen=it.id===sel.id||(sel.qId!=null&&it.qId===sel.qId);
    if(it.showMm||chosen||it.id===hoverId)dimItems.push({it,hover:!it.showMm&&!chosen,boxed:it.id===sel.id||inMulti});
    if(it.id===sel.id||inMulti){
      const b=BASE_R*1.25*it.scale, hs=6/view.z;
      out+=`<g transform="translate(${it.x},${it.y})">`+
        `<rect x="${-b}" y="${-b}" width="${2*b}" height="${2*b}" fill="none" stroke="#4a90d9" stroke-width="${1/view.z}" stroke-dasharray="${4/view.z} ${3/view.z}"/>`;
      if(it.id===sel.id&&!it.qId){
        out+=`<rect data-h="scale" x="${b-hs}" y="${b-hs}" width="${2*hs}" height="${2*hs}" fill="#fff" stroke="#4a90d9" stroke-width="${1/view.z}" style="cursor:nwse-resize"/>`+
             `<line x1="0" y1="${-b}" x2="0" y2="${-b-22/view.z}" stroke="#4a90d9" stroke-width="${1/view.z}"/>`+
             `<circle data-h="rot" cx="0" cy="${-b-27/view.z}" r="${5/view.z}" fill="#fff" stroke="#4a90d9" stroke-width="${1/view.z}" style="cursor:crosshair"/>`;
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
let mode=null, dragIt=null, dragQ=null, start={};
let spaceHeld=false;

function selectQuestion(q,pt,pointerId){
  sel.qId=q.id;sel.id=null;sel.ids=[];
  mode="moveQ";dragQ=q;
  start={dx:pt.x-q.cx,dy:pt.y-q.cy};
  renderCanvas();openQPanel();
  svg.setPointerCapture(pointerId);
}

function onPointerDown(e){
  const t=e.target;
  const h=t.dataset&&t.dataset.h;
  const qid=t.dataset&&t.dataset.qid;
  const gEl=t.closest&&t.closest("g.item");
  const rect=svg.getBoundingClientRect();
  const px=e.clientX-rect.left, py=e.clientY-rect.top;
  const pt=toWorld(px,py);

  if(spaceHeld||e.button===1){
    mode="pan";start={px,py,tx:view.tx,ty:view.ty};
    svg.classList.add("panning");
    svg.setPointerCapture(e.pointerId);
    return;
  }
  if(qid){
    selectQuestion(findQuestion(parseInt(qid)),pt,e.pointerId);
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
      // member of a question → select & drag the whole group
      selectQuestion(findQuestion(it.qId),pt,e.pointerId);
      return;
    }
    if(e.shiftKey){
      // shift-click → add to / remove from a multi-selection (no drag)
      const ids=new Set(sel.ids);
      if(sel.id!=null)ids.add(sel.id);
      if(ids.has(id))ids.delete(id);else ids.add(id);
      sel.id=null;sel.ids=[...ids];sel.qId=null;
      if(sel.ids.length===1){sel.id=sel.ids[0];sel.ids=[];renderCanvas();openSelPanel();}
      else if(sel.ids.length===0){deselect();}
      else{renderCanvas();openMultiPanel();}
      return;
    }
    sel.id=id;sel.ids=[];sel.qId=null;
    dragIt=it;
    mode="move";
    start={dx:pt.x-it.x,dy:pt.y-it.y};
    renderCanvas();openSelPanel();
  }else if(e.shiftKey){
    // shift-drag on empty canvas → rubber band selection
    sel.id=null;sel.ids=[];sel.qId=null;
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
  const gEl=e.target.closest&&e.target.closest("g.item");
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
    // tests object centers only (known rough edge)
    const caught=items.filter(i=>i.x>=x0&&i.x<=x1&&i.y>=y0&&i.y<=y1).map(i=>i.id);
    rubber=null;
    if(caught.length===0){deselect();}
    else if(caught.length===1){
      const it=findItem(caught[0]);
      if(it.qId){sel.qId=it.qId;renderCanvas();openQPanel();}
      else{sel.id=caught[0];renderCanvas();openSelPanel();}
    }
    else{sel.ids=caught;renderCanvas();openMultiPanel();}
  }
  mode=null;dragIt=null;dragQ=null;svg.classList.remove("panning");
}
function onDblClick(e){
  const gEl=e.target.closest&&e.target.closest("g.item");
  if(!gEl)return;
  const id=parseInt(gEl.dataset.id);
  const it=findItem(id);
  if(!it||!it.qId)return; // ungrouped objects already open on single click
  sel.id=id;sel.qId=null;sel.ids=[];
  mode=null;dragQ=null;
  renderCanvas();
  openSelPanel();
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
function onKeyDown(e){
  if(e.code==="Space"&&document.activeElement.tagName!=="INPUT"){spaceHeld=true;}
  if((e.key==="Backspace"||e.key==="Delete")&&document.activeElement.tagName!=="INPUT"){
    if(sel.id!=null)deleteSelected();
    else if(sel.ids.length)deleteMulti();
    else if(sel.qId!=null)deleteQuestion();
  }
  if((e.metaKey||e.ctrlKey)&&e.key==="d"&&sel.id!=null){
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
