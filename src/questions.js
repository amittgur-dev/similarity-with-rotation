/* Similarity questions: grouping three objects, the rigid layout, and the
   two group variations. */

import { BASE_R, Q_DX, Q_DY, DEFAULT_RATIO } from "./geometry.js";
import { assignABC, relationOf, describeRel, applyRelation, turnWhole, questionTitle } from "./variants.js";
import { items, questions, sel, ui, nextId, findItem, findQuestion, removeItem } from "./state.js";
import { $ } from "./dom.js";
import { renderCanvas } from "./canvas.js";
import { openQPanel, deselect } from "./console.js";

/* Invariants: fixed triangle (A top-center, B bottom-left, C bottom-right),
   one scale and one sub-shape relative size for all members, labels A/B/C.
   Re-applied on every layout pass, so the group always wins. */
export function layoutQuestion(q,list=items){
  const A=list.find(i=>i.id===q.a);
  const B=list.find(i=>i.id===q.b);
  const C=list.find(i=>i.id===q.c);
  if(!A||!B||!C)return;
  const dx=BASE_R*Q_DX*q.s, dy=BASE_R*Q_DY*q.s;
  A.scale=B.scale=C.scale=q.s;
  if(q.anchorRatio)A.anchorRatio=B.anchorRatio=C.anchorRatio=q.anchorRatio;
  A.x=q.cx;      A.y=q.cy-dy;
  B.x=q.cx-dx;   B.y=q.cy+dy;
  C.x=q.cx+dx;   C.y=q.cy+dy;
  A.label="A";B.label="B";C.label="C";
}

export function qDefaultTitle(A,B,C){
  return questionTitle(questions.length+1,A,B,C);
}

export function makeQuestion(){
  const selected=sel.ids.map(findItem).filter(Boolean);
  if(selected.length!==3||selected.some(it=>it.qId))return;
  const [A,B,C]=assignABC(selected);
  const q={
    id:nextId(),
    title:qDefaultTitle(A,B,C),
    a:A.id,b:B.id,c:C.id,
    cx:(A.x+B.x+C.x)/3,
    cy:(A.y+B.y+C.y)/3,
    s:(A.scale+B.scale+C.scale)/3,
    anchorRatio:((A.anchorRatio||DEFAULT_RATIO)+(B.anchorRatio||DEFAULT_RATIO)+(C.anchorRatio||DEFAULT_RATIO))/3
  };
  [A,B,C].forEach(it=>it.qId=q.id);
  questions.push(q);
  layoutQuestion(q);
  sel.ids=[];sel.id=null;sel.qId=q.id;
  renderCanvas();
  openQPanel();
}
export function ungroupQuestion(){
  const q=findQuestion(sel.qId);
  if(q){
    [q.a,q.b,q.c].forEach(id=>{
      const it=findItem(id);
      if(it)it.qId=null;
    });
    questions.splice(questions.indexOf(q),1);
  }
  deselect();
}
export function deleteQuestion(){
  const q=findQuestion(sel.qId);
  if(q){
    [q.a,q.b,q.c].forEach(removeItem);
    questions.splice(questions.indexOf(q),1);
  }
  deselect();
}

export function structureOf(q){
  const A=findItem(q.a), B=findItem(q.b), C=findItem(q.c);
  if(!A||!B||!C)return null;
  return {A,B,C,relB:relationOf(A,B),relC:relationOf(A,C)};
}
export function renderQStruct(q){
  const s=structureOf(q);
  if(!s){$("qStruct").textContent="";return;}
  $("qStruct").innerHTML=describeRel("B",s.relB)+"<br>"+describeRel("C",s.relC);
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
  let nA,nB,nC;
  if(ui.gvMode==="relation"){
    nA=fresh(s.A);
    nB=fresh(applyRelation(s.A,s.relB,d));
    nC=fresh(applyRelation(s.A,s.relC,d));
  }else{
    nA=fresh(turnWhole(s.A,d));
    nB=fresh(turnWhole(s.B,d));
    nC=fresh(turnWhole(s.C,d));
  }
  items.push(nA,nB,nC);
  const gapX=2*(BASE_R*Q_DX*q.s)+BASE_R*2.4*q.s;
  const nq={
    id:nextId(),
    title:"",
    a:nA.id,b:nB.id,c:nC.id,
    cx:q.cx+gapX,
    cy:q.cy,
    s:q.s,
    anchorRatio:q.anchorRatio
  };
  [nA,nB,nC].forEach(it=>it.qId=nq.id);
  questions.push(nq);
  nq.title=qDefaultTitle(nA,nB,nC);
  layoutQuestion(nq);
  sel.qId=nq.id;
  renderCanvas();
  openQPanel();
}
