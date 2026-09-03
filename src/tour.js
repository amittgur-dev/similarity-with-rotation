/* First-run walkthrough: a card plus an arrow that draws itself toward the
   element being explained. Non-modal — people can try each step as they go.
   Runs once (remembered per browser); replay from settings. */

import { $ } from "./dom.js";

export const TOUR_KEY="stimulus-builder.tour";

const STEPS=[
  {target:"#shapeInput",title:"1 · name a base shape",
   text:"Type a shape — square, hexagon, 5 star, circle, or 7 for a heptagon. Add a rotation if you like: “square 45”. Press Enter."},
  {target:"#anchorSection",title:"2 · then its sub-shape",
   text:"The vertices of the base shape are occupied by sub-shapes: diamond, triangle, circle… or none for a solid shape. Enter creates it.",
   reveal:"#anchorSection"},
  {target:"#tray",title:"3 · your shapes land here",
   text:"Drag a shape from the tray onto the canvas as many times as you need. Each copy can be rotated and sized on its own."},
  {target:"#canvas",title:"4 · build a similarity question",
   text:"Place three objects, click one and shift-click the other two, then “make similarity question”: A on top, B and C below. Drag empty space to move around; scroll to pan, ctrl+scroll or +/− to zoom.",
   at:"center"},
  {target:"#saveRow",title:"5 · keep your work",
   text:"Save stores the canvas in this browser; the dropdown at the top-left of the canvas reopens it. Export and import move canvases as files."},
  {target:"#expBar",title:"6 · run it as an experiment",
   text:"Mark questions with “☆ include in experiment”, then open this bar to pilot them: “Is A more similar to B or C?”, answers and reaction times exported as CSV."},
  {target:"#settingsBtn",title:"7 · settings",
   text:"Re-calibrate the screen with a bank card so sizes are shown in millimetres, or replay this walkthrough."}
];

let storage=null, i=-1, revealed=null;

function el(){return $("tour");}
function rectOf(sel){return document.querySelector(sel).getBoundingClientRect();}

function place(){
  const step=STEPS[i];
  const card=$("tourCard"), svg=$("tourArrow");
  const t=rectOf(step.target);
  const W=window.innerWidth,H=window.innerHeight;
  const cw=Math.min(300,W-40);
  card.style.width=cw+"px";
  const ch=card.offsetHeight||140;
  let cx,cy,ax,ay,bx,by,side;      // card pos, arrow start (card edge), arrow end (target edge)
  if(step.at==="center"){
    ax=cx=Math.round(t.left+t.width/2-cw/2);cy=Math.round(t.top+t.height/2-ch-70);
    ax=cx+cw/2;ay=cy+ch;bx=t.left+t.width/2;by=t.top+t.height/2-10;side="down";
  }else if(t.left>cw+80){           // room on the left → card left of the target
    side="right";
    cx=Math.round(t.left-cw-70);cy=Math.round(Math.min(Math.max(12,t.top+t.height/2-ch/2),H-ch-12));
    ax=cx+cw;ay=cy+ch/2;bx=t.left-6;by=Math.min(Math.max(t.top+8,ay),t.bottom-8);
  }else{                            // card to the right of the target
    side="left";
    cx=Math.round(t.right+70);cy=Math.round(Math.min(Math.max(12,t.top+t.height/2-ch/2),H-ch-12));
    ax=cx;ay=cy+ch/2;bx=t.right+6;by=Math.min(Math.max(t.top+8,ay),t.bottom-8);
  }
  card.style.left=cx+"px";card.style.top=cy+"px";
  // a gently curved arrow from the card to the target, drawn on entry
  const mx=(ax+bx)/2,my=(ay+by)/2;
  const bend=side==="down"?40:(by>ay?-30:30);
  const qx=side==="down"?mx+bend:mx, qy=side==="down"?my:my+bend;
  const path=$("tourPath");
  path.setAttribute("d",`M${ax},${ay} Q${qx},${qy} ${bx},${by}`);
  const len=path.getTotalLength();
  path.style.strokeDasharray=len;path.style.strokeDashoffset=len;
  path.getBoundingClientRect();     // restart the draw animation
  path.style.transition="stroke-dashoffset .55s ease-out";
  path.style.strokeDashoffset=0;
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
}

function highlight(on){
  document.querySelectorAll(".tourTarget").forEach(e=>e.classList.remove("tourTarget"));
  if(on&&i>=0){const e=document.querySelector(STEPS[i].target);if(e&&STEPS[i].at!=="center")e.classList.add("tourTarget");}
}
function leaveStep(){
  if(revealed){const e=document.querySelector(revealed);if(e&&!$("shapeInput").value.trim())e.style.display="none";revealed=null;}
}
function show(n){
  leaveStep();
  i=n;
  const step=STEPS[i];
  if(step.reveal){const e=document.querySelector(step.reveal);if(e&&e.style.display==="none"){e.style.display="block";revealed=step.reveal;}}
  $("tourTitle").textContent=step.title;
  $("tourText").textContent=step.text;
  $("tourCount").textContent=`${i+1} / ${STEPS.length}`;
  $("tourNext").textContent=i===STEPS.length-1?"done":"next";
  highlight(true);
  el().hidden=false;
  place();
}
export function startTour(){show(0);}
export function endTour(){
  leaveStep();highlight(false);
  el().hidden=true;i=-1;
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
  window.addEventListener("resize",()=>{if(!el().hidden)place();});
  window.addEventListener("keydown",e=>{if(el().hidden)return;if(e.key==="Escape")endTour();});
}
