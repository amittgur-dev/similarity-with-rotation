import { test } from "node:test";
import assert from "node:assert/strict";
import { spinAngles, spinPhase, normalizeSpin, clampSpinSpeed, SPIN_SCOPES } from "../src/spin.js";
import { paramColumns, MEMBER_COLS } from "../src/experiment.js";
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
test("spin: phase, normalisation", ()=>{
  close(spinPhase({dps:30},1000),30);close(spinPhase({dps:-30},1000),330);close(spinPhase({dps:720},1500),0);close(spinPhase(null,5000),0);
  assert.deepEqual(normalizeSpin({dps:-45,scope:"sub"}),{dps:-45,scope:"sub"});
  assert.deepEqual(normalizeSpin({dps:999,scope:"bogus"}),{dps:720,scope:"whole"});
  assert.equal(normalizeSpin({dps:0,scope:"sub"}),null);assert.equal(normalizeSpin(null),null);
  assert.equal(clampSpinSpeed(-30),30);assert.equal(clampSpinSpeed("x"),30);
});
test("spin: what turns, in both frames — the absolute orientation of the elements tells", ()=>{
  const abs=(p,a)=>p.frame==="vertex"?a.baseRot+a.anchorRot:a.anchorRot;   // an element's absolute orientation up to the vertex's own direction
  for(const frame of ["screen","vertex"]){
    const p=s=>({baseRot:10,anchorRot:20,frame,spin:{dps:30,scope:s}});
    const a=spinAngles(p("whole"),50);close(a.baseRot,60);close(abs(p("whole"),a),abs(p("whole"),{baseRot:10,anchorRot:20})+50);
    const b=spinAngles(p("shape"),50);close(b.baseRot,60);close(abs(p("shape"),b),abs(p("shape"),{baseRot:10,anchorRot:20}));
    const c=spinAngles(p("sub"),50);close(c.baseRot,10);close(abs(p("sub"),c),abs(p("sub"),{baseRot:10,anchorRot:20})+50);
    const d=spinAngles(p("opposite"),50);close(d.baseRot,60);close(abs(p("opposite"),d),abs(p("opposite"),{baseRot:10,anchorRot:20})-50);
  }
  assert.deepEqual(spinAngles({baseRot:10,anchorRot:20,frame:"screen",spin:{dps:30,scope:"sub"}},0),{baseRot:10,anchorRot:20},"phase 0: as designed");
  assert.deepEqual(SPIN_SCOPES,["whole","shape","sub","opposite"]);
});
test("trial records carry the spin per member", ()=>{
  assert.ok(MEMBER_COLS.includes("spin_deg_per_s")&&MEMBER_COLS.includes("spin_turns"));
  const p=k=>({defName:"square",subName:"diamond",texture:0,baseRot:0,anchorRot:0,frame:"screen",anchorRatio:0.18,scale:1,spin:k==="B"?{dps:-60,scope:"opposite"}:null});
  const row=paramColumns({A:p("A"),B:p("B"),C:p("C")},{},()=>0);
  assert.equal(row.A_spin_deg_per_s,"");assert.equal(row.B_spin_deg_per_s,-60);assert.equal(row.B_spin_turns,"opposite");
});
