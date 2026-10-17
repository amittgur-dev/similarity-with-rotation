/* Application state. Plain mutable records shared by the UI modules.
   Nothing here touches the DOM. */

import { DEFAULT_RATIO } from "./geometry.js";

export const draft={shape:null,anchor:{none:true},baseRot:0,anchorRot:0,frame:"screen",anchorRatio:DEFAULT_RATIO,texture:0,contour:false};
export const tray=[];        // {id, def, anchor, baseRot, anchorRot, frame, anchorRatio}
export const items=[];       // {id, trayRef, x,y, scale, baseRot, anchorRot, frame, anchorRatio, texture, label, qId, spin?}
                             // spin: {dps, scope} — continuous rotation, degrees per second (+ clockwise) and what turns (src/spin.js)
                             // texture: sub-shapes per row when they tile the shape, 0 = on the vertices; contour: the outline only
export const questions=[];   // {id, title, a,b,c, cx,cy, s, anchorRatio}
export const experiments=[]; // {id, n, name, questions:[qId…], settings:{repeats,shuffle,swapSides,fixation,fullscreen}}
export const texts=[];       // {id, x, y, text, size} — free text on the canvas: titles and notes (annotations, not stimuli)
export const counters={expN:0};   // highest experiment ordinal ever issued on this canvas (codes are never reused)

/* selection: exactly one of these is active at a time
   (single object / multiple objects / a question group) */
export const sel={id:null,ids:[],qIds:[],tIds:[],qId:null,tId:null,expId:null};   // ids/qIds/tIds: several objects, whole questions and texts chosen together
export const view={tx:0,ty:0,z:1};

/* panel toggles that persist across selections */
export const ui={rvScope:"whole",gvMode:"relation",texHold:"fill",spinOpen:false};   // texHold: which of density / size / fill stays put; spinOpen: the rotation box under orient

let uid=1;
export function nextId(){return uid++;}
export function bumpId(id){uid=Math.max(uid,id+1);}

export function resetDraft(){
  Object.assign(draft,{shape:null,anchor:{none:true},baseRot:0,anchorRot:0,frame:"screen",anchorRatio:DEFAULT_RATIO,texture:0,contour:false});
}
export function clearSelection(){sel.id=null;sel.ids=[];sel.qIds=[];sel.tIds=[];sel.qId=null;sel.tId=null;sel.expId=null;}
export const findExperiment=id=>experiments.find(e=>e.id===id);
export const findItem=id=>items.find(i=>i.id===id);
export const findQuestion=id=>questions.find(q=>q.id===id);
export const findText=id=>texts.find(t=>t.id===id);
export function removeText(id){const i=texts.findIndex(t=>t.id===id);if(i>-1)texts.splice(i,1);}
export function removeItem(id){
  const i=items.findIndex(x=>x.id===id);
  if(i>-1)items.splice(i,1);
}
