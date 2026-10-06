/* Similarity questions: grouping three or four objects, the rigid layout, and the
   two group variations. */

import { BASE_R, DEFAULT_RATIO, LABEL_GAP, questionLayout, questionStep } from "./geometry.js";
import { assignABC, relationOf, describeRel, applyRelation, turnWhole, questionTitle } from "./variants.js";
import { items, questions, experiments, sel, ui, nextId, findItem, findQuestion, removeItem } from "./state.js";
import { removeQuestionEverywhere } from "./experiment.js";
import { $ } from "./dom.js";
import { renderCanvas } from "./canvas.js";
import { openQPanel, deselect } from "./console.js";
import { commit } from "./history.js";

/* A question is a reference A and two or three comparisons: B, C and
   optionally D. memberIds/labels are the one place that knows which. */
export const LABELS=["A","B","C","D"];
export function memberIds(q){return [q.a,q.b,q.c,...(q.d!=null?[q.d]:[])];}
export function members(q,list=items){return memberIds(q).map(id=>list.find(i=>i.id===id));}

/* Invariants: the presentation layout of geometry.questionLayout (A on top,
   every comparison the same distance from A, gaps scaled to the figures),
   one scale and one sub-shape relative size for all members, labels
   A/B/C(/D). Re-applied on every layout pass, so the group always wins. */
export function memberSpec(m){
  return {def:m.trayRef.def,anchor:m.trayRef.anchor,ratio:m.anchorRatio||DEFAULT_RATIO,texture:m.texture||0};
}
export function questionGeometry(q,list=items){
  const ms=members(q,list);
  if(ms.some(m=>!m))return null;
  return questionLayout(ms.map(m=>({...memberSpec(m),ratio:q.anchorRatio||m.anchorRatio||DEFAULT_RATIO})),q.s);
}
export function layoutQuestion(q,list=items){
  const ms=members(q,list);
  if(ms.some(m=>!m))return;
  ms.forEach(m=>{m.scale=q.s;if(q.anchorRatio)m.anchorRatio=q.anchorRatio;});
  const L=questionLayout(ms.map(memberSpec),q.s);
  ms.forEach((m,i)=>{
    m.x=q.cx+L.positions[i][0];m.y=q.cy+L.positions[i][1];
    m.label=LABELS[i];
  });
}
/* The space a question takes on the canvas — its members, the title above
   and the labels below — in canvas coordinates (the selection frame). */
export function questionFrame(q,list=items){
  const L=questionGeometry(q,list);
  if(!L)return null;
  const pad=BASE_R*0.2*q.s, titleY=q.cy+L.positions[0][1]-BASE_R*1.25*q.s-26;
  return {x0:q.cx+L.bounds.x0-pad,x1:q.cx+L.bounds.x1+pad,
          y0:titleY-18,y1:q.cy+L.bounds.y1-L.radius+BASE_R*LABEL_GAP*q.s+34};
}
/* When a canvas is opened, questions whose frames overlap (three-comparison
   questions placed for the earlier, narrower row, say) are moved apart: left
   to right, each moves right just far enough to clear the ones before it,
   plus a figure radius of space. Questions that do not overlap stay put.
   Returns how many moved. */
export function separateQuestions(qs=questions,list=items){
  const placed=[];let moved=0;
  for(const q of [...qs].sort((a,b)=>a.cx-b.cx||a.cy-b.cy)){
    let f=questionFrame(q,list);
    if(!f)continue;
    let shift=0, hit;
    while((hit=placed.find(p=>f.x0+shift<p.x1&&f.x1+shift>p.x0&&f.y0<p.y1&&f.y1>p.y0)))shift=hit.x1+BASE_R*q.s-f.x0;
    if(shift>0){q.cx+=shift;layoutQuestion(q,list);f=questionFrame(q,list);moved++;}
    placed.push(f);
  }
  return moved;
}

export function qDefaultTitle(A,B,C,D=null){
  return questionTitle(questions.length+1,A,B,C,D);
}
/* rebuild the systematic title from the current rotations (titles never regenerate on their own) */
export function regenerateTitle(q){
  const ms=members(q);
  if(ms.some(m=>!m))return;
  q.title=questionTitle(questions.indexOf(q)+1,...ms);
}

export function makeQuestion(){
  const selected=sel.ids.map(findItem).filter(Boolean);
  if((selected.length!==3&&selected.length!==4)||selected.some(it=>it.qId))return;
  const ms=assignABC(selected), [A,B,C,D]=ms, k=ms.length;
  const q={
    id:nextId(),
    title:qDefaultTitle(A,B,C,D||null),
    a:A.id,b:B.id,c:C.id,...(D?{d:D.id}:{}),
    cx:ms.reduce((t,m)=>t+m.x,0)/k,
    cy:ms.reduce((t,m)=>t+m.y,0)/k,
    s:ms.reduce((t,m)=>t+m.scale,0)/k,
    anchorRatio:ms.reduce((t,m)=>t+(m.anchorRatio||DEFAULT_RATIO),0)/k
  };
  ms.forEach(it=>it.qId=q.id);
  questions.push(q);
  layoutQuestion(q);
  sel.ids=[];sel.id=null;sel.qId=q.id;
  renderCanvas();
  openQPanel();
  commit();
}
export function ungroupQuestion(){
  const q=findQuestion(sel.qId);
  if(q){
    memberIds(q).forEach(id=>{
      const it=findItem(id);
      if(it)it.qId=null;
    });
    questions.splice(questions.indexOf(q),1);
    removeQuestionEverywhere(q.id,experiments);
  }
  deselect();commit();
}
export function deleteQuestion(){
  const q=findQuestion(sel.qId);
  if(q){
    memberIds(q).forEach(removeItem);
    questions.splice(questions.indexOf(q),1);
    removeQuestionEverywhere(q.id,experiments);
  }
  deselect();commit();
}

export function structureOf(q){
  const ms=members(q);
  if(ms.some(m=>!m))return null;
  const [A,B,C,D]=ms;
  return {A,B,C,D:D||null,relB:relationOf(A,B),relC:relationOf(A,C),relD:D?relationOf(A,D):null};
}
export function renderQStruct(q){
  const s=structureOf(q);
  if(!s){$("qStruct").textContent="";return;}
  $("qStruct").innerHTML=describeRel("B",s.relB)+"<br>"+describeRel("C",s.relC)+(s.D?"<br>"+describeRel("D",s.relD):"");
}

/* Group variations — see HANDOFF.md for the taxonomy.
   "same relation, different rotation": A unchanged; B and C rebuilt from A
     with the new magnitude on the components in which they differed.
   "different reference, same relation": every member turns as a whole. */
export function makeGroupVariation(){
  const q=findQuestion(sel.qId);
  if(!q)return;
  const d=parseFloat($("qRelDeg").value);
  if(isNaN(d))return;
  const s=structureOf(q);
  if(!s)return;
  const fresh=p=>({...p,id:nextId(),qId:null,label:null});
  let nA,nB,nC,nD=null;
  if(ui.gvMode==="relation"){
    nA=fresh(s.A);
    nB=fresh(applyRelation(s.A,s.relB,d));
    nC=fresh(applyRelation(s.A,s.relC,d));
    if(s.D)nD=fresh(applyRelation(s.A,s.relD,d));
  }else{
    nA=fresh(turnWhole(s.A,d));
    nB=fresh(turnWhole(s.B,d));
    nC=fresh(turnWhole(s.C,d));
    if(s.D)nD=fresh(turnWhole(s.D,d));
  }
  const fresh3=[nA,nB,nC,...(nD?[nD]:[])];
  items.push(...fresh3);
  const gapX=questionStep(questionGeometry(q));   // the source question's width plus a figure of clear space
  const nq={
    id:nextId(),
    title:"",
    a:nA.id,b:nB.id,c:nC.id,...(nD?{d:nD.id}:{}),
    cx:q.cx+gapX,
    cy:q.cy,
    s:q.s,
    anchorRatio:q.anchorRatio
  };
  fresh3.forEach(it=>it.qId=nq.id);
  questions.push(nq);
  nq.title=qDefaultTitle(nA,nB,nC,nD);
  layoutQuestion(nq);
  sel.qId=nq.id;
  renderCanvas();
  openQPanel();
  commit();
}
