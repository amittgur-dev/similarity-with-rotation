import { test } from "node:test";
import assert from "node:assert/strict";
import { experimentQuestions, paramRecord, shuffled, buildTrials, trialGeometry, stimulusMarkup, resultRow, toCSV, CSV_COLUMNS, PROMPT } from "../src/experiment.js";

const SQ={n:4,offset:45,name:"square"}, DI={n:4,name:"diamond"};
const ref={def:SQ,anchor:DI};
const mk=(id,baseRot,anchorRot)=>({id,trayRef:ref,baseRot,anchorRot,frame:"screen",anchorRatio:0.18,scale:1,x:0,y:0});
const items=[mk(1,0,0),mk(2,45,0),mk(3,0,45),mk(4,0,0),mk(5,90,0),mk(6,0,90)];
const find=id=>items.find(i=>i.id===id);
const questions=[
  {id:10,title:"Q1",a:1,b:2,c:3,s:1,inExp:true},
  {id:11,title:"Q2 not included",a:4,b:5,c:6,s:0.8},
  {id:12,title:"Q3",a:4,b:5,c:6,s:0.8,inExp:true},
  {id:13,title:"Q4 broken",a:4,b:5,c:99,s:1,inExp:true},
];

test("only marked questions become trials; broken ones are skipped; order is canvas order", ()=>{
  assert.deepEqual(experimentQuestions(questions).map(q=>q.id),[10,12,13]);
  const t=buildTrials(questions,find);
  assert.deepEqual(t.map(x=>[x.trial,x.qId]),[[1,10],[2,12]]);
  assert.equal(t[0].B.baseRot,45);
  assert.equal(t[0].A.defName,"square");assert.equal(t[0].A.subName,"diamond");
  assert.equal(paramRecord({...mk(7,0,0),trayRef:{def:SQ,anchor:{none:true}}}).subName,"none");
});

test("shuffle is deterministic under an injected rng and renumbers trials", ()=>{
  const rng=(()=>{let i=0;const seq=[0.9,0.1,0.5];return ()=>seq[i++%seq.length];})();
  assert.deepEqual(shuffled([1,2,3,4],rng),[3,2,1,4]);
  const t=buildTrials(questions,find,{shuffle:true,rng:()=>0});
  assert.deepEqual(t.map(x=>x.trial),[1,2]);
  assert.deepEqual(t.map(x=>x.qId),[12,10]);
});

test("trial stimulus: same triangle as the canvas, at 1:1 pixels, with labels and no outlines", ()=>{
  const t=buildTrials(questions,find)[0];
  const g=trialGeometry(t);
  assert.deepEqual(g.positions,{A:[0,-140],B:[-189,140],C:[189,140]});
  const m=stimulusMarkup(t);
  assert.equal((m.match(/<g transform/g)||[]).length,3);
  assert.equal((m.match(/<path/g)||[]).length,12,"4 diamonds × 3 objects");
  assert.ok(!m.includes("stroke"));
  assert.match(m,/>A<\/text>/);assert.match(m,/>B<\/text>/);assert.match(m,/>C<\/text>/);
  assert.ok(g.viewBox[2]>2*189&&g.viewBox[3]>2*140);
  assert.equal(PROMPT,"Is A more similar to B or C?");
});

test("result rows carry every rendered parameter; CSV escapes commas and quotes", ()=>{
  const t=buildTrials(questions,find)[0];
  const row=resultRow(t,{participant:"pilot",response:"B",rt:812.6,pxPerMm:5,calibrated:true,timestamp:"2026-09-03T10:00:00Z"});
  assert.equal(row.rt_ms,813);assert.equal(row.B_baseRot,45);assert.equal(row.C_subRot,45);assert.equal(row.calibrated,1);
  const csv=toCSV([{...row,question_title:'Q1 · a,b "x"'}]);
  const lines=csv.trim().split("\n");
  assert.equal(lines[0],CSV_COLUMNS.join(","));
  assert.ok(lines[1].includes('"Q1 · a,b ""x"""'));
  assert.equal(lines[1].split(",").length-1,CSV_COLUMNS.length-1+1,"one extra comma inside the quoted title");
});
