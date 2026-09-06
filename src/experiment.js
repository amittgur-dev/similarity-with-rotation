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
export function questionTrial(q,findItem){
  const A=findItem(q.a),B=findItem(q.b),C=findItem(q.c);
  if(!A||!B||!C)return null;
  return {qId:q.id,title:q.title,s:q.s,A:paramRecord(A),B:paramRecord(B),C:paramRecord(C)};
}
/* options: repeats (each question N times), shuffle, swapSides (B and C
   exchange left/right at random — counterbalances a side bias; labels
   stay with their objects, the record says which side B was on) */
export function buildTrials(questions,findItem,{shuffle=false,rng=Math.random,repeats=1,swapSides=false}={}){
  const base=experimentQuestions(questions).map(q=>questionTrial(q,findItem)).filter(Boolean);
  let list=[];
  for(let r=1;r<=Math.max(1,repeats|0);r++)list.push(...base.map(t=>({...t,repeat:r})));
  if(shuffle)list=shuffled(list,rng);
  return list.map((t,i)=>({...t,trial:i+1,swapped:swapSides?rng()<0.5:false}));
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
    const p=t[k];
    const slot=t.swapped?({A:"A",B:"C",C:"B"})[k]:k;   // swapped: B drawn at C's place and vice versa
    const [x,y]=g.positions[slot];
    out+=`<g data-m="${k}" transform="translate(${x},${y}) scale(${p.scale})">`+
         shapeMarkup(p.def,BASE_R,p.anchor,p.frame,p.baseRot,p.anchorRot,p.anchorRatio)+`</g>`+
         `<text x="${x}" y="${y+g.labelY}" text-anchor="middle" font-family="monospace" font-size="17" font-weight="700" fill="#111">${k}</text>`;
  }
  return out;
}

/* ---- records ---- */
const MEMBER_COLS=["shape","sub","baseRot","subRot","frame","subRatio","scale","width_mm","height_mm","width_deg","height_deg"];
export const CSV_COLUMNS=["participant","trial","repeat","question_id","question_title","response","rt_ms","B_side",
  ...["A","B","C"].flatMap(k=>MEMBER_COLS.map(c=>`${k}_${c}`)),
  "px_per_mm","calibrated","viewing_distance_cm","fixation_ms","timestamp"];

/* flat parameter columns for one trial; sizes = {A:{w,h},B:{...},C:{...}} in mm (optional) */
export function paramColumns(t,sizes={},deg=null){
  const row={};
  for(const k of ["A","B","C"]){
    const p=t[k], z=sizes[k]||{};
    Object.assign(row,{[`${k}_shape`]:p.defName,[`${k}_sub`]:p.subName,[`${k}_baseRot`]:p.baseRot,[`${k}_subRot`]:p.anchorRot,
                       [`${k}_frame`]:p.frame,[`${k}_subRatio`]:+p.anchorRatio.toFixed(4),[`${k}_scale`]:+p.scale.toFixed(4),
                       [`${k}_width_mm`]:z.w!=null?+z.w.toFixed(2):"",[`${k}_height_mm`]:z.h!=null?+z.h.toFixed(2):"",
                       [`${k}_width_deg`]:z.w!=null&&deg?+deg(z.w).toFixed(3):"",[`${k}_height_deg`]:z.h!=null&&deg?+deg(z.h).toFixed(3):""});
  }
  return row;
}
export function resultRow(t,{participant,response,rt,pxPerMm,calibrated,timestamp,sizes,deg,distanceCm,fixationMs}){
  return {participant,trial:t.trial,repeat:t.repeat||1,question_id:t.qId,question_title:t.title,response,rt_ms:Math.round(rt),
          B_side:t.swapped?"right":"left",
          ...paramColumns(t,sizes,deg),
          px_per_mm:pxPerMm,calibrated:calibrated?1:0,viewing_distance_cm:distanceCm??"",fixation_ms:fixationMs??0,timestamp};
}
function csvCell(v){
  const s=v==null?"":String(v);
  return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
export function toCSV(rows,columns=CSV_COLUMNS){
  return [columns.join(","),...rows.map(r=>columns.map(c=>csvCell(r[c])).join(","))].join("\n")+"\n";
}

/* per-question summary of a run: proportion B, median RT */
export function summarize(rows){
  const by=new Map();
  rows.forEach(r=>{
    const e=by.get(r.question_id)||{question_id:r.question_id,title:r.question_title,n:0,b:0,rts:[]};
    e.n++;if(r.response==="B")e.b++;e.rts.push(r.rt_ms);by.set(r.question_id,e);
  });
  const median=a=>{const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
  return [...by.values()].map(e=>({question_id:e.question_id,title:e.title,n:e.n,pB:e.b/e.n,medianRt:median(e.rts)}));
}

/* a self-contained SVG document of one question, at 1:1 canvas pixels */
export function stimulusSVG(t){
  const g=trialGeometry(t);
  const [x,y,w,h]=g.viewBox;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${x} ${y} ${w} ${h}">`+
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>`+stimulusMarkup(t)+`</svg>`;
}
/* deterministic file stem from the systematic title */
export function fileStem(title,n){
  const s=title.replace(/[★☆]/g,"").replace(/\s+/g," ").trim().replace(/[^\w()+,.-]+/g,"_").replace(/^_+|_+$/g,"");
  return s||`Q${n}`;
}
