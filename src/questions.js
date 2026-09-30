/* Similarity questions: grouping three or four objects, the rigid layout, and the
   two group variations. */

import { BASE_R, Q_DX, Q_DY, DEFAULT_RATIO } from "./geometry.js";
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

/* Invariants: A top-center, the comparisons on one row below it (B left,
   C right; with three comparisons B left, C centre, D right), one scale
   and one sub-shape relative size for all members, labels A/B/C(/D).
   Re-applied on every layout pass, so the group always wins. */
export function layoutQuestion(q,list=items){
  const ms=members(q,list);
  if(ms.some(m=>!m))return;
  const dx=BASE_R*Q_DX*q.s, dy=BASE_R*Q_DY*q.s;
  const xs=ms.length===4?[0,-dx,0,dx]:[0,-dx,dx];
  ms.forEach((m,i)=>{
    m.scale=q.s;
    if(q.anchorRatio)m.anchorRatio=q.anchorRatio;
    m.x=q.cx+xs[i];m.y=i?q.cy+dy:q.cy-dy;
    m.label=LABELS[i];
  });
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
  const gapX=2*(BASE_R*Q_DX*q.s)+BASE_R*2.4*q.s;
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
