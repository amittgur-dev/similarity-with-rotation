/* Entry point: wires the modules to the page. */

import { tray, items, questions, view, clearSelection, bumpId } from "./state.js";
import { $ } from "./dom.js";
import { initCanvas, renderCanvas, zoomIn, zoomOut, resetView } from "./canvas.js";
import { initConsole, showPanel, createShape, makeVariant, deselect, duplicateSelected, deleteSelected, deleteMulti } from "./console.js";
import { makeQuestion, makeGroupVariation, ungroupQuestion, deleteQuestion, layoutQuestion } from "./questions.js";
import { addTrayItem, clearTrayDOM } from "./tray.js";
import { serializeCanvas, deserializeCanvas, canvasFileName, downloadJSON, readJSONFile } from "./io.js";
import { listCanvases, saveToLibrary, loadFromLibrary, removeFromLibrary } from "./library.js";
import { loadCalibration, readCalibration, calib, writeDistance } from "./calibration.js";
import { initHistory, commit, undo, redo, resetHistory } from "./history.js";
import { initCalibration, openCalibration } from "./calibrate.js";
import { initSplitter } from "./splitter.js";
import { initTour, startTour, tourDone } from "./tour.js";
import { initExperiment, refreshExpBar } from "./run.js";

const storage=(()=>{try{return window.localStorage;}catch{return null;}})();
const WORKING_KEY="stimulus-builder.working";

/* ---- small notice at the bottom of the canvas ---- */
let toastTimer=null;
export function toast(msg){
  const t=$("toast");t.textContent=msg;t.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true;},2200);
}

/* ---- canvas contents ---- */
function currentData(name){
  return serializeCanvas({name,view,tray,items,questions});
}
/* replace the canvas contents; keepView leaves the viewport and name alone (undo/redo) */
function applyState(loaded,{keepView=false}={}){
  tray.length=0;items.length=0;questions.length=0;
  clearSelection();
  clearTrayDOM();
  loaded.tray.forEach(t=>{tray.push(t);addTrayItem(t);});
  items.push(...loaded.items);
  questions.push(...loaded.questions);
  bumpId(loaded.maxId);
  questions.forEach(q=>layoutQuestion(q));
  if(!keepView){
    if(loaded.view)Object.assign(view,loaded.view);
    $("canvasName").value=loaded.name;
  }
  renderCanvas();showPanel("createPanel");
  refreshExpBar();
}
function applyLoaded(loaded){
  applyState(loaded);
  resetHistory();
  setDirty(false);
  writeWorking();
}
function newCanvas(){
  tray.length=0;items.length=0;questions.length=0;
  clearSelection();
  clearTrayDOM();
  Object.assign(view,{tx:0,ty:0,z:1});
  $("canvasName").value="";
  renderCanvas();showPanel("createPanel");
  refreshExpBar();
  refreshLibrary("");
  resetHistory();
  setDirty(false);
  try{storage&&storage.removeItem(WORKING_KEY);}catch{}
  $("shapeInput").focus();
}

/* ---- undo / redo + autosave of the working copy ---- */
function stateSnapshot(){
  const d=serializeCanvas({name:"",view:{tx:0,ty:0,z:1},tray,items,questions});
  delete d.view;delete d.name;
  return JSON.stringify(d);
}
function restoreSnapshot(s){
  applyState(deserializeCanvas(JSON.parse(s)),{keepView:true});
}
let dirty=false;
function setDirty(v){dirty=v;$("saveBtn").classList.toggle("dirty",v);$("saveBtn").title=v?"unsaved changes — save to this browser's canvas library (⌘/ctrl S)":"save to this browser's canvas library (⌘/ctrl S)";}
function writeWorking(){
  try{storage&&storage.setItem(WORKING_KEY,JSON.stringify({name:$("canvasName").value,data:currentData($("canvasName").value)}));}catch{}
}
function restoreWorking(){
  try{
    const w=storage&&JSON.parse(storage.getItem(WORKING_KEY)||"null");
    if(!w||!w.data||!((w.data.items&&w.data.items.length)||(w.data.tray&&w.data.tray.length)))return false;
    applyState(deserializeCanvas(w.data));
    $("canvasName").value=w.name||"";
    const saved=w.name?loadFromLibrary(storage,w.name):null;
    setDirty(!(saved&&JSON.stringify(saved)===JSON.stringify(currentData(w.name))));
    return true;
  }catch{return false;}
}

/* ---- library (this browser) ---- */
function refreshLibrary(selected){
  const sel=$("libSelect");
  const list=listCanvases(storage);
  sel.innerHTML="";
  const head=document.createElement("option");
  head.value="";
  head.textContent=list.length?"canvases ▾":"no saved canvases";
  sel.appendChild(head);
  list.forEach(c=>{
    const o=document.createElement("option");
    o.value=c.name;o.textContent=c.name;
    sel.appendChild(o);
  });
  sel.value=list.some(c=>c.name===selected)?selected:"";
  $("removeCanvasBtn").disabled=!sel.value;
}
function saveCanvas(){
  const name=$("canvasName").value.trim();
  if(!name){
    $("canvasName").placeholder="name the canvas first";
    $("canvasName").focus();
    return;
  }
  if(!storage){
    alert("This browser blocks local storage, so the library is unavailable. Use export to keep a file.");
    return;
  }
  saveToLibrary(storage,name,currentData(name));
  refreshLibrary(name);
  setDirty(false);writeWorking();
  const b=$("saveBtn");
  b.textContent="saved";b.classList.add("saved");
  setTimeout(()=>{b.textContent="save";b.classList.remove("saved");},1200);
}
function openFromLibrary(){
  const name=$("libSelect").value;
  if(!name)return;
  const data=loadFromLibrary(storage,name);
  if(!data){refreshLibrary("");return;}
  try{
    applyLoaded(deserializeCanvas(data));
    refreshLibrary(name);
  }catch(err){
    alert("Could not open canvas: "+err.message);
  }
}
function removeCanvas(){
  const name=$("libSelect").value;
  if(!name)return;
  if(!confirm(`Remove “${name}” from this browser's library? (The canvas stays on screen.)`))return;
  removeFromLibrary(storage,name);
  refreshLibrary("");
}

/* ---- settings menu (bottom-left) ---- */
function calibStatusText(){
  if(!calib.calibrated)return "screen not calibrated · sizes assume 96 dpi";
  const rec=readCalibration(storage);
  const when=rec&&rec.when?new Date(rec.when).toLocaleDateString():"";
  return `${calib.pxPerMm.toFixed(2)} px/mm${when?" · measured "+when:""}`;
}
function openSettings(){
  $("calibStatus").textContent=calibStatusText();
  $("viewDist").value=calib.distanceCm;
  $("settingsMenu").hidden=false;$("settingsBtn").classList.add("on");
}
function closeSettings(){$("settingsMenu").hidden=true;$("settingsBtn").classList.remove("on");}
function toggleSettings(){($("settingsMenu").hidden?openSettings:closeSettings)();}

/* ---- newer build published? ----
   GitHub Pages caches the page itself for 10 minutes, so a bookmark or a link
   can bring back an older build. version.txt is written at deploy time; when
   it no longer matches the build this page was stamped with, offer a reload.
   (The working copy is autosaved, so nothing is lost by reloading.) */
const BUILD=($("buildId").textContent.match(/build (\S+)/)||[])[1];
async function checkForNewerBuild(){
  if(!BUILD||BUILD==="__BUILD__")return;            // local / unstamped copy
  try{
    const r=await fetch(`version.txt?t=${Date.now()}`,{cache:"no-store"});
    if(!r.ok)return;
    const live=(await r.text()).trim();
    if(live&&live!==BUILD)$("updateNote").hidden=false;
  }catch{}
}
$("updateNote").addEventListener("click",()=>{writeWorking();location.reload();});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")checkForNewerBuild();});
checkForNewerBuild();

/* ---- text size ---- */
const TEXT_KEY="stimulus-builder.text";
function applyTextSize(v){
  if(v==="normal")document.documentElement.removeAttribute("data-text");
  else document.documentElement.setAttribute("data-text",v);
  document.querySelectorAll("#textSize button").forEach(b=>b.classList.toggle("on",b.dataset.v===v));
  renderCanvas();
}
document.querySelectorAll("#textSize button").forEach(b=>b.addEventListener("click",()=>{
  applyTextSize(b.dataset.v);
  try{storage&&storage.setItem(TEXT_KEY,b.dataset.v);}catch{}
}));
try{const v=storage&&storage.getItem(TEXT_KEY);if(v&&v!=="normal")applyTextSize(v);}catch{}

/* ---- files ---- */
function exportCanvas(){
  const name=canvasFileName($("canvasName").value);
  downloadJSON(currentData(name),name+".json");
}
async function importCanvasFile(file){
  try{
    applyLoaded(deserializeCanvas(await readJSONFile(file)));
    refreshLibrary("");
  }catch(err){
    alert("Could not load canvas: "+err.message);
  }
}

const actions={
  save:saveCanvas,
  export:exportCanvas,
  import:()=>$("loadFile").click(),
  newCanvas,
  removeCanvas,
  zoomIn,
  zoomOut,
  calibrate:()=>{closeSettings();openCalibration();},
  resetView:()=>{closeSettings();resetView();},
  tour:()=>{closeSettings();startTour();},
  create:createShape,
  makeVariant,
  deselect,
  duplicate:duplicateSelected,
  deleteSelected,
  makeQuestion,
  deleteMulti,
  makeGroupVariation,
  ungroup:ungroupQuestion,
  deleteQuestion
};
document.querySelectorAll("[data-action]").forEach(b=>{
  b.addEventListener("click",()=>actions[b.dataset.action]());
});
$("loadFile").addEventListener("change",e=>{
  const f=e.target.files[0];
  if(f)importCanvasFile(f).then(()=>{e.target.value="";});
});
$("libSelect").addEventListener("change",openFromLibrary);
$("canvasName").addEventListener("input",()=>{setDirty(true);writeWorking();});
$("viewDist").addEventListener("change",()=>{
  const v=parseFloat($("viewDist").value);
  if(v>0){writeDistance(storage,v);renderCanvas();toast(`viewing distance ${v} cm`);}
  else $("viewDist").value=calib.distanceCm;
});
/* keyboard: undo / redo / save (not while typing, not under an overlay) */
window.addEventListener("keydown",e=>{
  const tag=document.activeElement&&document.activeElement.tagName;
  if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT")return;
  if(!$("run").hidden||!$("calib").hidden||!$("tour").hidden)return;
  const mod=e.metaKey||e.ctrlKey;
  if(!mod)return;
  const k=e.key.toLowerCase();
  if(k==="z"&&!e.shiftKey){e.preventDefault();if(!undo())toast("nothing to undo");}
  else if((k==="z"&&e.shiftKey)||k==="y"){e.preventDefault();if(!redo())toast("nothing to redo");}
  else if(k==="s"){e.preventDefault();saveCanvas();}
});
$("settingsBtn").addEventListener("click",e=>{e.stopPropagation();toggleSettings();});
document.addEventListener("pointerdown",e=>{if(!$("settingsMenu").hidden&&!e.target.closest("#settings"))closeSettings();});
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("settingsMenu").hidden)closeSettings();});

initSplitter({storage});
initConsole();
initCanvas();
initExperiment();
refreshLibrary("");
loadCalibration(storage);
initHistory({snap:stateSnapshot,restore:restoreSnapshot,onChange:e=>{if(!e.baseline)setDirty(true);writeWorking();}});
if(restoreWorking()){resetHistory();toast("restored your last session");}
initTour({storage});
const firstRun=!tourDone();
initCalibration({storage,onDone:()=>{renderCanvas();$("shapeInput").focus();if(firstRun&&!tourDone())startTour();}});
if(!calib.calibrated)openCalibration();   // first visit on this screen: calibrate, then the walkthrough
else{$("shapeInput").focus();if(firstRun)startTour();}
