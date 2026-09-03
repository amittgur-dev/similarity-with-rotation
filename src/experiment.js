/* Experiment model: which questions are trials, trial order, the stimulus
   drawn in a trial (from the same objects as the canvas — no duplicate
   model) and the CSV record. Pure; no DOM. */

import { BASE_R, Q_DX, Q_DY, DEFAULT_RATIO, shapeMarkup } from "./geometry.js";

export const PROMPT="Is A more similar to B or C?";
export const LABEL_GAP=1.55;   // same as the canvas

export function experimentQuestions(questions){return questions.filter(q=>q.inExp);}

/* a self-contained snapshot of one object's stimulus parameters */
export function paramRecord(it){
  return {
    def:it.trayRef.def, anchor:it.trayRef.anchor,
    defName:it.trayRef.def.name,
    subName:it.trayRef.anchor&&!it.trayRef.anchor.none?it.trayRef.anchor.name:"none",
    baseRot:it.baseRot, anchorRot:it.anchorRot, frame:it.frame,
    anchorRatio:it.anchorRatio||DEFAULT_RATIO, scale:it.scale
  };
}

export function shuffled(arr,rng=Math.random){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

/* trials in presentation order; each carries everything needed to draw
   and to report, independent of later canvas edits */
export function buildTrials(questions,findItem,{shuffle=false,rng=Math.random}={}){
  const list=experimentQuestions(questions).map(q=>{
    const A=findItem(q.a),B=findItem(q.b),C=findItem(q.c);
    if(!A||!B||!C)return null;
    return {qId:q.id,title:q.title,s:q.s,A:paramRecord(A),B:paramRecord(B),C:paramRecord(C)};
  }).filter(Boolean);
  return (shuffle?shuffled(list,rng):list).map((t,i)=>({...t,trial:i+1}));
}

/* geometry of one trial at 1:1 canvas pixels (zoom 100%), so the calibrated
   on-screen size is exactly what the panels report */
export function trialGeometry(t){
  const s=t.s, dx=BASE_R*Q_DX*s, dy=BASE_R*Q_DY*s;
  const padX=BASE_R*1.4*s, top=BASE_R*1.3*s, labelY=BASE_R*LABEL_GAP*s+24;
  return {
    dx,dy,
    positions:{A:[0,-dy],B:[-dx,dy],C:[dx,dy]},
    viewBox:[-(dx+padX),-(dy+top),2*(dx+padX),2*dy+top+labelY+10],
    labelY
  };
}
export function stimulusMarkup(t){
  const g=trialGeometry(t);
  let out="";
  for(const k of ["A","B","C"]){
    const p=t[k],[x,y]=g.positions[k];
    out+=`<g transform="translate(${x},${y}) scale(${p.scale})">`+
         shapeMarkup(p.def,BASE_R,p.anchor,p.frame,p.baseRot,p.anchorRot,p.anchorRatio)+`</g>`+
         `<text x="${x}" y="${y+g.labelY}" text-anchor="middle" font-family="monospace" font-size="15" font-weight="700" fill="#111">${k}</text>`;
  }
  return out;
}

/* ---- results ---- */
export const CSV_COLUMNS=["participant","trial","question_id","question_title","response","rt_ms",
  ...["A","B","C"].flatMap(k=>[`${k}_shape`,`${k}_sub`,`${k}_baseRot`,`${k}_subRot`,`${k}_frame`,`${k}_subRatio`,`${k}_scale`]),
  "px_per_mm","calibrated","timestamp"];

export function resultRow(t,{participant,response,rt,pxPerMm,calibrated,timestamp}){
  const row={participant,trial:t.trial,question_id:t.qId,question_title:t.title,response,rt_ms:Math.round(rt),
             px_per_mm:pxPerMm,calibrated:calibrated?1:0,timestamp};
  for(const k of ["A","B","C"]){
    const p=t[k];
    Object.assign(row,{[`${k}_shape`]:p.defName,[`${k}_sub`]:p.subName,[`${k}_baseRot`]:p.baseRot,[`${k}_subRot`]:p.anchorRot,
                       [`${k}_frame`]:p.frame,[`${k}_subRatio`]:+p.anchorRatio.toFixed(4),[`${k}_scale`]:+p.scale.toFixed(4)});
  }
  return row;
}
function csvCell(v){
  const s=v==null?"":String(v);
  return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
export function toCSV(rows,columns=CSV_COLUMNS){
  return [columns.join(","),...rows.map(r=>columns.map(c=>csvCell(r[c])).join(","))].join("\n")+"\n";
}
