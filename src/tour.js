/* First-run walkthrough: a centered pop-up over the page with one short
   step at a time. The element being described gets a light dashed outline
   behind the pop-up; the page itself is untouched. Runs once (remembered
   per browser); replay from settings. */

import { $ } from "./dom.js";

export const TOUR_KEY="stimulus-builder.tour";

const STEPS=[
  {target:"#shapeInput",title:"Name a base shape",
   text:"In the console on the right, type a shape — square, hexagon, 5 star, circle, or 7 for a heptagon. Add a rotation if you like: “square 45”. Press Enter."},
  {target:"#createPanel",title:"Then its sub-shape",
   text:"The vertices of the base shape are occupied by sub-shapes: diamond, triangle, circle… or none for a solid shape. Enter creates the shape."},
  {target:"#tray",title:"Your shapes land in the tray",
   text:"Drag a shape from the tray at the bottom right onto the canvas, as many times as you need. Each copy can be rotated and sized on its own."},
  {target:"#canvas",title:"Build a similarity question",
   text:"Place three objects, click one and shift-click the other two, then press “make similarity question”: A goes on top, B and C below. Drag empty space to move around; scroll to pan; ctrl+scroll or +/− to zoom."},
  {target:"#saveRow",title:"Keep your work",
   text:"Save stores the canvas in this browser; the dropdown at the top left of the canvas reopens it. Export and import move canvases as files."},
  {target:"#expBar",title:"Run it as an experiment",
   text:"Mark questions with “☆ include in experiment”, then open the experiment bar under the console to pilot them: “Is A more similar to B or C?”, with answers and reaction times exported as CSV."},
  {target:"#settingsBtn",title:"Settings",
   text:"The ⚙ button at the bottom left re-calibrates the screen with a bank card, so sizes are shown in millimetres, and replays this walkthrough."}
];

let storage=null, i=-1;

function highlight(on){
  document.querySelectorAll(".tourTarget").forEach(e=>e.classList.remove("tourTarget"));
  if(on&&i>=0){const e=document.querySelector(STEPS[i].target);if(e&&STEPS[i].target!=="#canvas")e.classList.add("tourTarget");}
}
function show(n){
  i=n;
  const step=STEPS[i];
  $("tourTitle").textContent=step.title;
  $("tourText").textContent=step.text;
  $("tourCount").textContent=`${i+1} of ${STEPS.length}`;
  $("tourDots").innerHTML=STEPS.map((_,k)=>`<span class="${k===i?"on":""}"></span>`).join("");
  $("tourNext").textContent=i===STEPS.length-1?"done":"next";
  $("tourBack").disabled=i===0;
  highlight(true);
  $("tour").hidden=false;
  $("tourNext").focus();
}
export function startTour(){show(0);}
export function endTour(){
  highlight(false);
  $("tour").hidden=true;i=-1;
  try{storage&&storage.setItem(TOUR_KEY,JSON.stringify({done:true,when:new Date().toISOString()}));}catch{}
}
export function tourDone(){
  try{return !!(storage&&JSON.parse(storage.getItem(TOUR_KEY)||"null")?.done);}catch{return false;}
}
export function initTour(opts){
  storage=opts.storage;
  $("tourNext").addEventListener("click",()=>{i<STEPS.length-1?show(i+1):endTour();});
  $("tourBack").addEventListener("click",()=>{if(i>0)show(i-1);});
  $("tourSkip").addEventListener("click",endTour);
  $("tour").addEventListener("pointerdown",e=>{if(e.target===$("tour"))endTour();});   // click outside closes
  window.addEventListener("keydown",e=>{
    if($("tour").hidden)return;
    if(e.key==="Escape")endTour();
    else if(e.key==="ArrowRight"||e.key==="Enter"){e.preventDefault();i<STEPS.length-1?show(i+1):endTour();}
    else if(e.key==="ArrowLeft"&&i>0)show(i-1);
  });
}
