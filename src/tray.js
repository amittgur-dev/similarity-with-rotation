/* The tray of created shapes and drag-to-canvas placement. */

import { DEFAULT_RATIO, shapeMarkup } from "./geometry.js";
import { items, sel, tray, nextId } from "./state.js";
import { commit } from "./history.js";
import { $ } from "./dom.js";
import { renderCanvas, toWorld } from "./canvas.js";
import { openSelPanel } from "./console.js";

export function trayPreviewSVG(entry,size){
  return `<svg width="${size}" height="${size}" viewBox="-60 -60 120 120">${shapeMarkup(entry.def,42,entry.anchor,entry.frame,entry.baseRot,entry.anchorRot,entry.anchorRatio||DEFAULT_RATIO)}</svg>`;
}
export function addTrayItem(entry){
  const d=document.createElement("div");
  d.className="trayItem";d.dataset.id=entry.id;
  d.innerHTML=trayPreviewSVG(entry,74)+`<span class="x" title="remove">×</span>`;
  // remove the shape from the tray — unless objects on the canvas still use it
  d.querySelector(".x").onclick=e=>{
    e.stopPropagation();
    const used=items.filter(i=>i.trayRef===entry).length;
    if(used){
      d.classList.add("inUse");
      d.title=`used by ${used} object${used===1?"":"s"} on the canvas — delete those first`;
      setTimeout(()=>{d.classList.remove("inUse");d.title="";},1600);
      return;
    }
    const i=tray.indexOf(entry);
    if(i>-1)tray.splice(i,1);
    d.remove();
    commit();
  };
  d.addEventListener("pointerdown",e=>startTrayDrag(e,entry));
  $("tray").appendChild(d);
}
export function clearTrayDOM(){
  document.querySelectorAll(".trayItem").forEach(el=>el.remove());
}

let dragEntry=null;
function ghost(){return $("ghost");}
function startTrayDrag(e,entry){
  e.preventDefault();
  dragEntry=entry;
  ghost().innerHTML=trayPreviewSVG(entry,70);
  ghost().style.display="block";
  moveGhost(e);
  window.addEventListener("pointermove",moveGhost);
  window.addEventListener("pointerup",dropGhost,{once:true});
}
function moveGhost(e){
  ghost().style.left=(e.clientX-35)+"px";
  ghost().style.top=(e.clientY-35)+"px";
}
function dropGhost(e){
  window.removeEventListener("pointermove",moveGhost);
  ghost().style.display="none";
  const wrap=$("canvasWrap").getBoundingClientRect();
  if(e.clientX>=wrap.left&&e.clientX<=wrap.right&&e.clientY>=wrap.top&&e.clientY<=wrap.bottom&&dragEntry){
    const w=toWorld(e.clientX-wrap.left,e.clientY-wrap.top);
    const it={id:nextId(),trayRef:dragEntry,x:w.x,y:w.y,
              scale:1,baseRot:dragEntry.baseRot,anchorRot:dragEntry.anchorRot,frame:dragEntry.frame,
              anchorRatio:dragEntry.anchorRatio||DEFAULT_RATIO,label:null,qId:null};
    items.push(it);
    sel.id=it.id;sel.ids=[];sel.qId=null;sel.expId=null;
    renderCanvas();openSelPanel();commit();
  }
  dragEntry=null;
}
