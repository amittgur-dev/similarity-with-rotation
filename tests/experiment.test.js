import { test } from "node:test";
import assert from "node:assert/strict";
import { experimentQuestions, paramRecord, shuffled, buildTrials, trialGeometry, stimulusMarkup, resultRow, toCSV, CSV_COLUMNS, PROMPT, summarize, stimulusSVG, fileStem, paramColumns } from "../src/experiment.js";

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
  assert.equal((m.match(/<g data-m=/g)||[]).length,3);
  assert.equal((m.match(/<path/g)||[]).length,12,"4 diamonds × 3 objects");
  assert.ok(!m.includes("stroke"));
  assert.match(m,/>A<\/text>/);assert.match(m,/>B<\/text>/);assert.match(m,/>C<\/text>/);
  assert.ok(g.viewBox[2]>2*189&&g.viewBox[3]>2*140);
  assert.equal(PROMPT,"Is A more similar to B or C?");
});

test("result rows carry every rendered parameter; CSV escapes commas and quotes", ()=>{
  const t=buildTrials(questions,find)[0];
  const row=resultRow(t,{participant:"pilot",response:"B",rt:812.6,pxPerMm:5,calibrated:true,timestamp:"2026-09-03T10:00:00Z",
                          sizes:{A:{w:28,h:26}},deg:mm=>mm/10,distanceCm:57,fixationMs:500});
  assert.equal(row.rt_ms,813);assert.equal(row.B_baseRot,45);assert.equal(row.C_subRot,45);assert.equal(row.calibrated,1);
  assert.equal(row.B_side,"left");assert.equal(row.repeat,1);assert.equal(row.A_width_mm,28);assert.equal(row.A_width_deg,2.8);
  assert.equal(row.B_width_mm,"","unknown sizes stay blank");assert.equal(row.viewing_distance_cm,57);assert.equal(row.fixation_ms,500);
  const csv=toCSV([{...row,question_title:'Q1 · a,b "x"'}]);
  const lines=csv.trim().split("\n");
  assert.equal(lines[0],CSV_COLUMNS.join(","));
  assert.ok(lines[1].includes('"Q1 · a,b ""x"""'));
  assert.equal(lines[1].split(",").length-1,CSV_COLUMNS.length-1+1,"one extra comma inside the quoted title");
});

test("repeats and side counterbalancing", ()=>{
  const t=buildTrials(questions,find,{repeats:3,rng:()=>0.2,swapSides:true});
  assert.equal(t.length,6);
  assert.deepEqual(t.map(x=>x.repeat),[1,1,2,2,3,3]);
  assert.deepEqual(t.map(x=>x.trial),[1,2,3,4,5,6]);
  assert.ok(t.every(x=>x.swapped===true),"rng 0.2 < 0.5 → swapped");
  const plain=buildTrials(questions,find,{swapSides:true,rng:()=>0.9})[0];
  assert.equal(plain.swapped,false);
  // swapped: B is drawn at C's slot (right), label follows the object
  const m=stimulusMarkup({...t[0],swapped:true});
  const g=trialGeometry(t[0]);
  assert.ok(m.includes(`<g data-m="B" transform="translate(${g.positions.C[0]},${g.positions.C[1]})`));
  assert.ok(m.includes(`<text x="${g.positions.C[0]}" y="${g.positions.C[1]+g.labelY}" text-anchor="middle" font-family="monospace" font-size="15" font-weight="700" fill="#111">B</text>`));
  assert.equal(resultRow({...t[0]},{participant:"p",response:"C",rt:1,pxPerMm:5,calibrated:true,timestamp:""}).B_side,"right");
});

test("summarize: proportion B and median RT per question", ()=>{
  const rows=[{question_id:1,question_title:"Q1",response:"B",rt_ms:500},{question_id:1,question_title:"Q1",response:"C",rt_ms:700},
              {question_id:1,question_title:"Q1",response:"B",rt_ms:900},{question_id:2,question_title:"Q2",response:"C",rt_ms:400}];
  const s=summarize(rows);
  assert.deepEqual(s.map(x=>[x.question_id,x.n,+x.pB.toFixed(3),x.medianRt]),[[1,3,0.667,700],[2,1,0,400]]);
});

test("standalone SVG document and deterministic file stems", ()=>{
  const t=buildTrials(questions,find)[0];
  const svg=stimulusSVG(t);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="'));
  assert.ok(svg.includes('fill="#fff"'),"white background");
  assert.equal((svg.match(/data-m="/g)||[]).length,3);
  assert.equal(fileStem("Q1 · square/diamond · A(0,0) B(45,0) C(0,45)",1),"Q1_square_diamond_A(0,0)_B(45,0)_C(0,45)");
  assert.equal(fileStem("★ Q2 · a  b",2),"Q2_a_b");
  assert.equal(fileStem("   ",7),"Q7");
  assert.ok(Object.keys(paramColumns(t)).includes("C_height_deg"));
});
