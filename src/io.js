/* Save / load. The (de)serializers are pure so the file format is testable;
   the DOM glue at the bottom wires them to the save button and file input.

   Save format (version 4): {version, name, view, tray[], items[], questions[], experiments[]}.
   Saved canvases are research artifacts — older files keep loading:
     · `sub*` keys → `anchor*`
     · v2 `trials` → `questions` (center/scale derived from member positions)
     · v3 `inExp` stars → one experiment "experiment 1" */

import { DEFAULT_RATIO } from "./geometry.js";
import { loadExperiments, normalizeSettings } from "./experiment.js";

export const SAVE_VERSION=4;

export function serializeCanvas({name,view,tray,items,questions,experiments=[],nextExperimentN=0}){
  return {
    version:SAVE_VERSION,
    name,
    view:{...view},
    tray:tray.map(t=>({id:t.id,def:t.def,anchor:t.anchor,baseRot:t.baseRot,anchorRot:t.anchorRot,frame:t.frame,anchorRatio:t.anchorRatio||DEFAULT_RATIO})),
    items:items.map(i=>({id:i.id,trayId:i.trayRef.id,x:i.x,y:i.y,scale:i.scale,
                         baseRot:i.baseRot,anchorRot:i.anchorRot,frame:i.frame,anchorRatio:i.anchorRatio||DEFAULT_RATIO,
                         label:i.label||null,qId:i.qId||null,...(i.showMm?{showMm:true}:{})})),
    questions:questions.map(q=>({id:q.id,title:q.title,a:q.a,b:q.b,c:q.c,cx:q.cx,cy:q.cy,s:q.s,anchorRatio:q.anchorRatio||DEFAULT_RATIO})),
    experiments:experiments.map(e=>({id:e.id,n:e.n,name:e.name,questions:[...e.questions],settings:normalizeSettings(e.settings),...(e.online?{online:{...e.online}}:{})})),
    ...(nextExperimentN>0?{nextExperimentN}:{})
  };
}

/* Returns fresh {tray, items, questions, view, name, maxId} with live
   trayRef links and qId membership resolved. Throws on a non-canvas file.
   Questions are NOT laid out here — the caller runs layoutQuestion. */
export function deserializeCanvas(data){
  if(!data||!data.tray||!data.items)throw new Error("not a canvas file");
  let maxId=0;
  const tray=data.tray.map(t=>{
    maxId=Math.max(maxId,t.id);
    return {id:t.id,def:t.def,anchor:t.anchor||t.sub,baseRot:t.baseRot||0,
            anchorRot:(t.anchorRot!=null?t.anchorRot:t.subRot)||0,frame:t.frame||"screen",
            anchorRatio:t.anchorRatio||t.subRatio||DEFAULT_RATIO};
  });
  const items=[];
  data.items.forEach(i=>{
    const ref=tray.find(t=>t.id===i.trayId);
    if(!ref)return;
    maxId=Math.max(maxId,i.id);
    items.push({id:i.id,trayRef:ref,x:i.x,y:i.y,scale:i.scale,
                baseRot:i.baseRot,anchorRot:(i.anchorRot!=null?i.anchorRot:i.subRot)||0,frame:i.frame,
                anchorRatio:i.anchorRatio||i.subRatio||DEFAULT_RATIO,
                label:i.label||null,qId:i.qId||null,...(i.showMm?{showMm:true}:{})});
  });
  const qs=data.questions||(data.trials||[]).map(t=>{
    const A=data.items.find(i=>i.id===t.a),B=data.items.find(i=>i.id===t.b),C=data.items.find(i=>i.id===t.c);
    if(!A||!B||!C)return null;
    return {id:t.id,title:String(t.title??""),a:t.a,b:t.b,c:t.c,
            cx:(A.x+B.x+C.x)/3,cy:(A.y+B.y+C.y)/3,s:A.scale||1};
  }).filter(Boolean);
  // a question whose members are missing cannot be drawn or run: dropped (its remaining members stay as free objects)
  const questions=qs.filter(q=>q&&[q.a,q.b,q.c].every(id=>items.some(i=>i.id===id))).map(q=>{
    maxId=Math.max(maxId,q.id);
    [q.a,q.b,q.c].forEach(id=>{items.find(i=>i.id===id).qId=q.id;});
    return {...q,title:String(q.title??""),anchorRatio:q.anchorRatio||q.subRatio||DEFAULT_RATIO};
  });
  items.forEach(i=>{if(i.qId&&!questions.some(q=>q.id===i.qId))i.qId=null;});
  // experiments (v4), or one synthesised from v3 "include in experiment" stars
  const experiments=loadExperiments(data,questions);
  experiments.forEach(e=>{if(e.id==null)e.id=++maxId;else maxId=Math.max(maxId,e.id);});
  return {tray,items,questions,experiments,view:data.view?{...data.view}:null,name:data.name||"",maxId,nextExperimentN:parseInt(data.nextExperimentN)||0};
}

export function canvasFileName(rawName){
  return (rawName.trim()||"untitled-canvas").replace(/\s+/g,"-");
}

export function downloadJSON(data,filename){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function readJSONFile(file){
  return new Promise((resolve,reject)=>{
    const rd=new FileReader();
    rd.onload=()=>{
      try{resolve(JSON.parse(rd.result));}catch(err){reject(err);}
    };
    rd.onerror=()=>reject(rd.error);
    rd.readAsText(file);
  });
}
