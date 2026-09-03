/* Resizable / collapsible right console. Drag the splitter to resize, click
   its tab (or drag it all the way right, or double-click) to collapse and
   expand. The width is remembered per browser. */

import { $ } from "./dom.js";

export const CONSOLE_KEY="stimulus-builder.console";
const DEFAULT_W=270, MIN_OPEN=120, COLLAPSE_BELOW=60;

let storage=null, width=DEFAULT_W, collapsed=false;

function maxWidth(){return Math.max(MIN_OPEN,Math.min(720,window.innerWidth-320));}
function apply(){
  document.body.classList.toggle("consoleCollapsed",collapsed);
  document.documentElement.style.setProperty("--console-w",(collapsed?0:width)+"px");
  $("splitTab").textContent=collapsed?"◂":"▸";
  $("splitter").title=collapsed?"open the console":"drag to resize · click to collapse";
}
function persist(){
  if(!storage)return;
  try{storage.setItem(CONSOLE_KEY,JSON.stringify({width,collapsed}));}catch{}
}
export function setConsole(opts){
  if(opts.width!=null)width=Math.max(MIN_OPEN,Math.min(maxWidth(),opts.width));
  if(opts.collapsed!=null)collapsed=opts.collapsed;
  apply();persist();
}
export function toggleConsole(){setConsole({collapsed:!collapsed});}

export function initSplitter(opts){
  storage=opts.storage;
  try{
    const saved=storage&&JSON.parse(storage.getItem(CONSOLE_KEY)||"null");
    if(saved&&saved.width>0){width=saved.width;collapsed=!!saved.collapsed;}
  }catch{}
  const sp=$("splitter");
  sp.addEventListener("pointerdown",e=>{
    e.preventDefault();
    const x0=e.clientX, w0=collapsed?0:width;
    let moved=false;
    const move=ev=>{
      const dx=ev.clientX-x0;
      if(Math.abs(dx)>3)moved=true;
      if(!moved)return;
      const w=w0-dx;
      if(w<COLLAPSE_BELOW){collapsed=true;}
      else{collapsed=false;width=Math.max(MIN_OPEN,Math.min(maxWidth(),w));}
      apply();
    };
    const up=()=>{
      window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);
      if(!moved)collapsed=!collapsed;   // a plain click toggles
      apply();persist();
    };
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerup",up);
  });
  window.addEventListener("resize",()=>{if(!collapsed&&width>maxWidth()){width=maxWidth();apply();}});
  apply();
}
