import { test } from "node:test";
import assert from "node:assert/strict";
import { spinAngles, spinPhases, normalizeSpin, clampSpinSpeed, SPIN_SCOPES } from "../src/spin.js";
import { paramColumns, MEMBER_COLS } from "../src/experiment.js";
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
test("spin: phases, normalisation, earlier records", ()=>{
  assert.deepEqual(spinPhases({dps:30,sub:-90},1000),{phase:30,sub:270});
  assert.deepEqual(spinPhases({dps:720},1500),{phase:0,sub:0});assert.deepEqual(spinPhases(null,5000),{phase:0,sub:0});
  assert.deepEqual(normalizeSpin({dps:-45,scope:"shape",sub:20}),{dps:-45,scope:"shape",sub:20});
  assert.deepEqual(normalizeSpin({dps:999,scope:"bogus"}),{dps:720,scope:"whole",sub:0});
  assert.equal(normalizeSpin({dps:0,sub:0}),null);assert.equal(normalizeSpin(null),null);
  assert.deepEqual(normalizeSpin({dps:30,scope:"sub"}),{dps:0,scope:"whole",sub:30},"an earlier sub-shapes-only record");
  assert.deepEqual(normalizeSpin({dps:30,scope:"opposite"}),{dps:30,scope:"shape",sub:-30},"an earlier opposite record");
  assert.equal(clampSpinSpeed(-30),30);assert.equal(clampSpinSpeed("x"),30);
  // offsets on the shared clock: in step by default, ahead by the offset otherwise
  assert.deepEqual(normalizeSpin({dps:30,scope:"whole",sub:0,phase0:0,subPhase0:0}),{dps:30,scope:"whole",sub:0},"zero offsets are not kept");
  assert.deepEqual(normalizeSpin({dps:30,sub:-30,phase0:405,subPhase0:-90}),{dps:30,scope:"whole",sub:-30,phase0:45,subPhase0:270});
  assert.deepEqual(spinPhases({dps:30,phase0:45},1000),{phase:75,sub:0});
  assert.deepEqual(spinPhases({dps:30,sub:30,subPhase0:90},0),{phase:0,sub:90});
  assert.deepEqual(spinPhases({dps:30},2000),spinPhases({dps:30,scope:"shape"},2000),"same speed, same clock: in step");
});
test("spin: what turns, in both frames — the absolute orientation of the elements tells", ()=>{
  const abs=(p,a)=>p.frame==="vertex"?a.baseRot+a.anchorRot:a.anchorRot;   // an element's absolute orientation up to the vertex's own direction
  for(const frame of ["screen","vertex"]){
    const p=s=>({baseRot:10,anchorRot:20,frame,spin:{dps:30,scope:s}}), d={baseRot:10,anchorRot:20};
    const a=spinAngles(p("whole"),50);close(a.baseRot,60);close(abs(p("whole"),a),abs(p("whole"),d)+50);
    const b=spinAngles(p("shape"),50);close(b.baseRot,60);close(abs(p("shape"),b),abs(p("shape"),d));
    const c=spinAngles(p("whole"),0,50);close(c.baseRot,10);close(abs(p("whole"),c),abs(p("whole"),d)+50,"the sub-shapes alone, in place");
    const e=spinAngles(p("shape"),50,-50);close(e.baseRot,60);close(abs(p("shape"),e),abs(p("shape"),d)-50,"shape one way, sub-shapes the other");
    const f=spinAngles(p("whole"),50,30);close(f.baseRot,60);close(abs(p("whole"),f),abs(p("whole"),d)+80,"both add up");
  }
  assert.deepEqual(spinAngles({baseRot:10,anchorRot:20,frame:"screen",spin:{dps:30,scope:"shape"}},0,0),{baseRot:10,anchorRot:20},"phase 0: as designed");
  assert.deepEqual(SPIN_SCOPES,["whole","shape"]);
});
test("trial records carry both rotations per member", ()=>{
  for(const c of ["spin_deg_per_s","spin_turns","spin_offset_deg","sub_spin_deg_per_s","sub_spin_offset_deg"])assert.ok(MEMBER_COLS.includes(c),c);
  const p=k=>({defName:"square",subName:"diamond",texture:0,baseRot:0,anchorRot:0,frame:"screen",anchorRatio:0.18,scale:1,
               spin:k==="B"?{dps:-60,scope:"shape",sub:45,phase0:90}:k==="C"?{dps:0,scope:"whole",sub:-20,subPhase0:30}:null});
  const row=paramColumns({A:p("A"),B:p("B"),C:p("C")},{},()=>0);
  assert.equal(row.A_spin_deg_per_s,"");assert.equal(row.B_spin_deg_per_s,-60);assert.equal(row.B_spin_turns,"shape");assert.equal(row.B_sub_spin_deg_per_s,45);
  assert.equal(row.B_spin_offset_deg,90);assert.equal(row.B_sub_spin_offset_deg,0);
  assert.equal(row.C_spin_deg_per_s,"");assert.equal(row.C_spin_turns,"");assert.equal(row.C_sub_spin_deg_per_s,-20);assert.equal(row.C_spin_offset_deg,"");assert.equal(row.C_sub_spin_offset_deg,30);
});
