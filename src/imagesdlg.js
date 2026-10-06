/* "images" (next to save / export / import / pdf): every stimulus on the
   canvas as its own image of one fixed size, in a zip (src/stimimages.js). */

import { $ } from "./dom.js";
import { items, questions } from "./state.js";
import { calib } from "./calibration.js";
import { IMAGES_KEY, IMAGE_DEFAULTS, IMAGE_SIZE_MIN, IMAGE_SIZE_MAX, planImages, buildImagesZip } from "./stimimages.js";
import { svgToPng } from "./stimexport.js";
import { downloadBlob } from "./run.js";

let storage=null, toast=()=>{}, busy=false;

function readOpts(){
  return {size:parseInt($("imgSize").value)||IMAGE_DEFAULTS.size,
          mode:document.querySelector('input[name=imgMode]:checked')?.value||"fit",
          pxPerUnit:parseFloat($("imgScale").value)||IMAGE_DEFAULTS.pxPerUnit,
          unique:$("imgUnique").checked,svg:$("imgSvg").checked,margin:IMAGE_DEFAULTS.margin};
}
function saved(){try{return {...IMAGE_DEFAULTS,...JSON.parse(storage&&storage.getItem(IMAGES_KEY)||"{}")};}catch{return {...IMAGE_DEFAULTS};}}
function refresh(){
  const o=readOpts(), plan=planImages(items,questions,o);
  const n=items.length, m=plan.entries.length;
  const big=plan.maxRadius*2*plan.k;
  $("imgSummary").textContent=n?`${n} object${n===1?"":"s"} on the canvas → ${m} image${m===1?"":"s"}, each exactly ${plan.size} × ${plan.size} px. `+
    `Scale ${plan.k.toFixed(3)} image px per canvas px for every image; the largest stimulus spans up to ${Math.round(big)} px (${Math.round(100*big/plan.size)}% of the image) at any rotation.`
    :"There are no objects on the canvas yet.";
  if(o.mode!=="fixed")$("imgScale").value=+plan.k.toFixed(3);
  $("imgScale").disabled=o.mode!=="fixed";
  $("imgWarn").textContent=plan.clipped.length?`${plan.clipped.length} stimul${plan.clipped.length===1?"us":"i"} would be cut off at this scale — enlarge the image or lower the scale.`:"";
  $("imgGo").disabled=busy||!m||plan.clipped.length>0;
  return plan;
}
export function openImages(){
  const o=saved();
  $("imgSize").value=o.size;$("imgScale").value=o.pxPerUnit;
  document.querySelectorAll("input[name=imgMode]").forEach(r=>{r.checked=r.value===o.mode;});
  $("imgUnique").checked=o.unique;$("imgSvg").checked=o.svg;
  $("imgStatus").textContent="";
  refresh();
  $("imagesDlg").hidden=false;$("imgSize").focus();
}
function close(){if(!busy)$("imagesDlg").hidden=true;}
async function go(){
  const o=readOpts(), plan=refresh();
  if(!plan.entries.length||plan.clipped.length)return;
  try{storage&&storage.setItem(IMAGES_KEY,JSON.stringify({size:plan.size,mode:o.mode,pxPerUnit:o.pxPerUnit,unique:o.unique,svg:o.svg}));}catch{}
  busy=true;$("imgGo").disabled=true;
  try{
    const canvas=$("canvasName").value.trim();
    const bytes=await buildImagesZip(plan,{rasterize:svg=>svgToPng(svg,1),canvas,pxPerMm:calib.pxPerMm,calibrated:calib.calibrated,
      onProgress:(i,t)=>{$("imgStatus").textContent=`rendering ${i} / ${t}…`;}});
    downloadBlob(`${(canvas||"canvas").replace(/\s+/g,"-")}-stimuli-${plan.size}px.zip`,new Blob([bytes],{type:"application/zip"}));
    busy=false;close();
    toast(`${plan.entries.length} image${plan.entries.length===1?"":"s"} · ${plan.size} × ${plan.size} px`);
  }catch(err){
    $("imgStatus").textContent="could not export: "+err.message;
  }finally{busy=false;refresh();}
}
export function initImages(opts){
  storage=opts.storage;toast=opts.toast||(()=>{});
  $("imgSize").min=IMAGE_SIZE_MIN;$("imgSize").max=IMAGE_SIZE_MAX;
  ["imgSize","imgScale"].forEach(id=>$(id).addEventListener("input",refresh));
  ["imgUnique","imgSvg"].forEach(id=>$(id).addEventListener("change",refresh));
  document.querySelectorAll("input[name=imgMode]").forEach(r=>r.addEventListener("change",refresh));
  $("imgCancel").addEventListener("click",close);
  $("imgGo").addEventListener("click",go);
  $("imagesDlg").addEventListener("pointerdown",e=>{if(e.target===$("imagesDlg"))close();});
  window.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("imagesDlg").hidden)close();});
}
