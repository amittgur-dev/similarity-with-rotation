/* Application state. Plain mutable records shared by the UI modules.
   Nothing here touches the DOM. */

import { DEFAULT_RATIO } from "./geometry.js";

export const draft={shape:null,anchor:{none:true},baseRot:0,anchorRot:0,frame:"screen",anchorRatio:DEFAULT_RATIO};
export const tray=[];        // {id, def, anchor, baseRot, anchorRot, frame, anchorRatio}
export const items=[];       // {id, trayRef, x,y, scale, baseRot, anchorRot, frame, anchorRatio, label, qId}
export const questions=[];   // {id, title, a,b,c, cx,cy, s, anchorRatio}

/* selection: exactly one of these is active at a time
   (single object / multiple objects / a question group) */
export const sel={id:null,ids:[],qId:null};
export const view={tx:0,ty:0,z:1};

/* panel toggles that persist across selections */
export const ui={rvScope:"whole",gvMode:"relation"};

let uid=1;
export function nextId(){return uid++;}
export function bumpId(id){uid=Math.max(uid,id+1);}

export function resetDraft(){
  Object.assign(draft,{shape:null,anchor:{none:true},baseRot:0,anchorRot:0,frame:"screen",anchorRatio:DEFAULT_RATIO});
}
export function clearSelection(){sel.id=null;sel.ids=[];sel.qId=null;}
export const findItem=id=>items.find(i=>i.id===id);
export const findQuestion=id=>questions.find(q=>q.id===id);
export function removeItem(id){
  const i=items.findIndex(x=>x.id===id);
  if(i>-1)items.splice(i,1);
}
