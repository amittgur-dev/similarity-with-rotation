/* Pure rotation logic: single-object variants, the vary grid parser and
   the two question-level variations. These encode the science — the
   frame semantics from geometry.js are compensated for here so that a
   "shape only" or "whole" rotation means the same thing in both frames.

   All functions take/return plain {baseRot, anchorRot, frame} records and
   never touch state. */

import { norm, signedDelta } from "./geometry.js";

/* ---- single object: rotational variant ----
   scope "whole":   the object turns as a unit. In screen frame the sub-shapes
                    must be turned explicitly; in vertex frame they follow.
   scope "shape":   only the configuration turns. In vertex frame the
                    sub-shapes would follow, so they are counter-rotated.
   scope "anchors": only the sub-shapes turn. */
export function rotateParams(p,scope,d){
  const v={...p};
  if(scope==="whole"){
    v.baseRot=norm(v.baseRot+d);
    if(v.frame==="screen")v.anchorRot=norm(v.anchorRot+d);
  }else if(scope==="shape"){
    v.baseRot=norm(v.baseRot+d);
    if(v.frame==="vertex")v.anchorRot=norm(v.anchorRot-d);
  }else{
    v.anchorRot=norm(v.anchorRot+d);
  }
  return v;
}

/* ---- vary grid ---- */
export function parseValues(tok){
  if(tok.includes(":")){
    const p=tok.split(":").map(Number);
    if(p.length!==3||p.some(isNaN)||p[1]<=0)return null;
    const out=[];
    for(let v=p[0];v<=p[2]+1e-9;v+=p[1])out.push(norm(v));
    return out.length?out:null;
  }
  const vals=tok.split(",").map(s=>parseFloat(s.trim()));
  if(!vals.length||vals.some(isNaN))return null;
  return vals.map(norm);
}
export function parseVary(txt){
  const m=txt.trim().toLowerCase().match(/^(?:shape\s+(\S+))?\s*(?:(?:sub|anchor)\s+(\S+))?$/);
  if(!m||(!m[1]&&!m[2]))return null;
  const res={};
  if(m[1]){res.shape=parseValues(m[1]);if(!res.shape)return null;}
  if(m[2]){res.anchor=parseValues(m[2]);if(!res.anchor)return null;}
  return res;
}

/* ---- question structure ----
   The structure of a question = how B and C differ from the reference A,
   per component (shape rotation / sub-shape rotation), with direction. */
export function relationOf(A,X){
  return {dBase:signedDelta(A.baseRot,X.baseRot), dAnchor:signedDelta(A.anchorRot,X.anchorRot)};
}
export function describeRel(lab,rel){
  const parts=[];
  if(Math.abs(rel.dBase)>=1)parts.push(`shape ${rel.dBase>0?"+":"−"}${Math.abs(Math.round(rel.dBase))}°`);
  if(Math.abs(rel.dAnchor)>=1)parts.push(`sub-shapes ${rel.dAnchor>0?"+":"−"}${Math.abs(Math.round(rel.dAnchor))}°`);
  return `${lab} = A ${parts.length?"with "+parts.join(", "):"(identical)"}`;
}

/* same relation, different rotation:
   rebuild a comparison from A with magnitude d applied to exactly the
   components (and directions) in which it originally differed.
   Magnitude ratios are deliberately discarded (see HANDOFF.md). */
export function applyRelation(A,rel,d){
  const copy={...A};
  if(Math.abs(rel.dBase)>=1)  copy.baseRot  =norm(A.baseRot  +Math.sign(rel.dBase)*d);
  if(Math.abs(rel.dAnchor)>=1)copy.anchorRot=norm(A.anchorRot+Math.sign(rel.dAnchor)*d);
  return copy;
}

/* different reference, same relation:
   a member turns as a whole by d (frame-aware), so A→B and A→C offsets
   are preserved exactly. */
export function turnWhole(p,d){
  return rotateParams(p,"whole",d);
}

/* ---- systematic condition code ----
   `Q1 · square/diamond · A(0,0) B(45,0) C(0,45)` — pairs are (baseRot, anchorRot). */
export function questionTitle(n,A,B,C){
  const sig=it=>{
    const d=it.trayRef.def.name;
    const s=it.trayRef.anchor&&!it.trayRef.anchor.none?"/"+it.trayRef.anchor.name:"";
    return d+s;
  };
  const f=it=>`(${norm(it.baseRot)},${norm(it.anchorRot)})`;
  if(sig(A)===sig(B)&&sig(A)===sig(C)){
    return `Q${n} · ${sig(A)} · A${f(A)} B${f(B)} C${f(C)}`;
  }
  return `Q${n} · A ${sig(A)}${f(A)} B ${sig(B)}${f(B)} C ${sig(C)}${f(C)}`;
}

/* ---- A/B/C assignment for a 3-object selection ----
   labels win if present and unique; otherwise geometric:
   topmost = A; of the rest, leftmost = B, rightmost = C. */
export function assignABC(sel){
  const byLabel={};
  sel.forEach(it=>{if(it.label&&!byLabel[it.label])byLabel[it.label]=it;});
  if(byLabel.A&&byLabel.B&&byLabel.C&&new Set([byLabel.A.id,byLabel.B.id,byLabel.C.id]).size===3){
    return [byLabel.A,byLabel.B,byLabel.C];
  }
  const sorted=[...sel].sort((p,q)=>p.y-q.y);
  const A=sorted[0];
  const rest=sorted.slice(1).sort((p,q)=>p.x-q.x);
  return [A,rest[0],rest[1]];
}
