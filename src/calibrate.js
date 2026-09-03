/* The calibration overlay: resize a card outline until it matches a real
   bank card held against the screen. */

import { $ } from "./dom.js";
import { CARD_MM, CARD_RATIO, calib, pxPerMmFromCardWidth, cardWidthPxFor, writeCalibration, loadCalibration } from "./calibration.js";

let storage=null, onDone=()=>{};
let widthPx=0;

function setWidth(w){
  const stage=$("calibStage").getBoundingClientRect();
  const max=Math.max(150,Math.min(stage.width-40,1400));
  widthPx=Math.max(150,Math.min(max,w));
  const card=$("calibCard");
  card.style.width=widthPx+"px";
  card.style.height=(widthPx*CARD_RATIO)+"px";
  const r=$("calibRange");
  r.max=String(Math.round(max));
  r.value=String(Math.round(widthPx));
  const ppm=pxPerMmFromCardWidth(widthPx);
  $("calibRead").textContent=`${Math.round(widthPx)} px = ${CARD_MM.w} mm → ${ppm.toFixed(2)} px/mm`;
}

export function openCalibration(){
  $("calib").hidden=false;
  setWidth(cardWidthPxFor(calib.pxPerMm));
  $("calibRange").focus();
}
function closeCalibration(){
  $("calib").hidden=true;
  onDone();
}
function confirm(){
  const ppm=pxPerMmFromCardWidth(widthPx);
  if(storage){
    writeCalibration(storage,ppm,{dpr:window.devicePixelRatio||1,screen:[screen.width,screen.height]});
    loadCalibration(storage);
  }else{
    calib.pxPerMm=ppm;calib.calibrated=true;
  }
  closeCalibration();
}

export function initCalibration(opts){
  storage=opts.storage;onDone=opts.onDone||(()=>{});
  $("calibRange").addEventListener("input",()=>setWidth(parseFloat($("calibRange").value)));
  // drag the card's right edge
  const handle=$("calibHandle");
  handle.addEventListener("pointerdown",e=>{
    e.preventDefault();
    const x0=e.clientX, w0=widthPx;
    const move=ev=>setWidth(w0+(ev.clientX-x0));
    const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);};
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerup",up);
  });
  // arrow keys nudge by 1 px when the slider has focus (fine adjustment)
  $("calib").addEventListener("keydown",e=>{
    if(e.key==="Enter"){e.preventDefault();confirm();}
    if(e.key==="Escape"){e.preventDefault();closeCalibration();}
  });
  $("calibConfirm").addEventListener("click",confirm);
  $("calibSkip").addEventListener("click",closeCalibration);
  window.addEventListener("resize",()=>{if(!$("calib").hidden)setWidth(widthPx);});
}
