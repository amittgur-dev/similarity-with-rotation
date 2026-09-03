/* Entry point: wires the modules to the page. */

import { tray, items, questions, view, clearSelection, bumpId } from "./state.js";
import { $ } from "./dom.js";
import { initCanvas, renderCanvas, zoomIn, zoomOut, resetView } from "./canvas.js";
import { initConsole, showPanel, createShape, makeVariant, deselect, duplicateSelected, deleteSelected, deleteMulti } from "./console.js";
import { makeQuestion, makeGroupVariation, ungroupQuestion, deleteQuestion, layoutQuestion } from "./questions.js";
import { addTrayItem, clearTrayDOM } from "./tray.js";
import { serializeCanvas, deserializeCanvas, canvasFileName, downloadJSON, readJSONFile } from "./io.js";
import { listCanvases, saveToLibrary, loadFromLibrary, removeFromLibrary } from "./library.js";
import { loadCalibration, readCalibration, calib } from "./calibration.js";
import { initCalibration, openCalibration } from "./calibrate.js";
import { initSplitter } from "./splitter.js";
import { initTour, startTour, tourDone } from "./tour.js";
import { initExperiment, refreshExpBar } from "./run.js";

const storage=(()=>{try{return window.localStorage;}catch{return null;}})();

/* ---- canvas contents ---- */
function currentData(name){
  return serializeCanvas({name,view,tray,items,questions});
}
function applyLoaded(loaded){
  tray.length=0;items.length=0;questions.length=0;
  clearSelection();
  clearTrayDOM();
  loaded.tray.forEach(t=>{tray.push(t);addTrayItem(t);});
  items.push(...loaded.items);
  questions.push(...loaded.questions);
  bumpId(loaded.maxId);
  questions.forEach(q=>layoutQuestion(q));
  if(loaded.view)Object.assign(view,loaded.view);
  $("canvasName").value=loaded.name;
  renderCanvas();showPanel("createPanel");
  refreshExpBar();
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
  $("shapeInput").focus();
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
  $("settingsMenu").hidden=false;$("settingsBtn").classList.add("on");
}
function closeSettings(){$("settingsMenu").hidden=true;$("settingsBtn").classList.remove("on");}
function toggleSettings(){($("settingsMenu").hidden?openSettings:closeSettings)();}

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
$("settingsBtn").addEventListener("click",e=>{e.stopPropagation();toggleSettings();});
document.addEventListener("pointerdown",e=>{if(!$("settingsMenu").hidden&&!e.target.closest("#settings"))closeSettings();});
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("settingsMenu").hidden)closeSettings();});

initSplitter({storage});
initConsole();
initCanvas();
initExperiment();
refreshLibrary("");
loadCalibration(storage);
initTour({storage});
const firstRun=!tourDone();
initCalibration({storage,onDone:()=>{renderCanvas();$("shapeInput").focus();if(firstRun&&!tourDone())startTour();}});
if(!calib.calibrated)openCalibration();   // first visit on this screen: calibrate, then the walkthrough
else{$("shapeInput").focus();if(firstRun)startTour();}
