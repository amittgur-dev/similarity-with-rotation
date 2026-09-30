import { test } from "node:test";
import assert from "node:assert/strict";
import { experimentQuestions, paramRecord, shuffled, buildTrials, trialGeometry, stimulusMarkup, resultRow, toCSV, CSV_COLUMNS, PROMPT, summarize, stimulusSVG, fileStem, paramColumns,
  newExperiment, experimentCode, nextOrdinal, isMember, setMembership, experimentsOf, removeQuestionEverywhere, loadExperiments, normalizeSettings, DEFAULT_SETTINGS } from "../src/experiment.js";

const SQ={n:4,offset:45,name:"square"}, DI={n:4,name:"diamond"};
const ref={def:SQ,anchor:DI};
const mk=(id,baseRot,anchorRot)=>({id,trayRef:ref,baseRot,anchorRot,frame:"screen",anchorRatio:0.18,scale:1,x:0,y:0});
const items=[mk(1,0,0),mk(2,45,0),mk(3,0,45),mk(4,0,0),mk(5,90,0),mk(6,0,90)];
const find=id=>items.find(i=>i.id===id);
const questions=[
  {id:10,title:"Q1",a:1,b:2,c:3,s:1},
  {id:11,title:"Q2 not included",a:4,b:5,c:6,s:0.8},
  {id:12,title:"Q3",a:4,b:5,c:6,s:0.8},
  {id:13,title:"Q4 broken",a:4,b:5,c:99,s:1},
];
const EXP=newExperiment(20,1,"pilot",[12,10,13]);   // out of canvas order on purpose

test("only member questions become trials; broken ones are skipped; order is canvas order", ()=>{
  assert.deepEqual(experimentQuestions(EXP,questions).map(q=>q.id),[10,12,13]);
  const t=buildTrials(EXP,questions,find,{shuffle:false});
  assert.deepEqual(t.map(x=>[x.trial,x.qId,x.questionIndex]),[[1,10,1],[2,12,2]]);
  assert.deepEqual(buildTrials(null,questions,find),[]);
  assert.equal(t[0].B.baseRot,45);
  assert.equal(t[0].A.defName,"square");assert.equal(t[0].A.subName,"diamond");
  assert.equal(paramRecord({...mk(7,0,0),trayRef:{def:SQ,anchor:{none:true}}}).subName,"none");
});

test("shuffle is deterministic under an injected rng and renumbers trials", ()=>{
  const rng=(()=>{let i=0;const seq=[0.9,0.1,0.5];return ()=>seq[i++%seq.length];})();
  assert.deepEqual(shuffled([1,2,3,4],rng),[3,2,1,4]);
  const t=buildTrials(EXP,questions,find,{shuffle:true,rng:()=>0,swapSides:false});
  assert.deepEqual(t.map(x=>x.trial),[1,2]);
  assert.deepEqual(t.map(x=>x.qId),[12,10]);
});

test("trial stimulus: same triangle as the canvas, at 1:1 pixels, with labels and no outlines", ()=>{
  const t=buildTrials(EXP,questions,find,{shuffle:false})[0];
  const g=trialGeometry(t);
  const dy=70*2.6;   // BASE_R × Q_DY: the comparison row sits well below A
  assert.deepEqual(g.positions,{A:[0,-dy],B:[-189,dy],C:[189,dy]});
  const m=stimulusMarkup(t);
  assert.equal((m.match(/<g data-m=/g)||[]).length,3);
  assert.equal((m.match(/<path/g)||[]).length,12,"4 diamonds × 3 objects");
  assert.ok(!m.includes("stroke"));
  assert.match(m,/>A<\/text>/);assert.match(m,/>B<\/text>/);assert.match(m,/>C<\/text>/);
  assert.ok(g.viewBox[2]>2*189&&g.viewBox[3]>2*dy);
  assert.equal(PROMPT,"Is A more similar to B or C?");
});

test("result rows carry every rendered parameter; CSV escapes commas and quotes", ()=>{
  const t=buildTrials(EXP,questions,find,{shuffle:false,swapSides:false})[0];
  const row=resultRow(t,{participant:"pilot",canvas:"study 1",exp:EXP,response:"B",rt:812.6,pxPerMm:5,calibrated:true,timestamp:"2026-09-03T10:00:00Z",
                          sizes:{A:{w:28,h:26}},deg:mm=>mm/10,distanceCm:57,fixationMs:500});
  assert.equal(row.canvas,"study 1");assert.equal(row.experiment_id,20);assert.equal(row.experiment_code,"E1");assert.equal(row.experiment_name,"pilot");assert.equal(row.question_index,1);
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
  const t=buildTrials(EXP,questions,find,{shuffle:false,repeats:3,rng:()=>0.2,swapSides:true});
  assert.equal(t.length,6);
  assert.deepEqual(t.map(x=>x.repeat),[1,1,2,2,3,3]);
  assert.deepEqual(t.map(x=>x.trial),[1,2,3,4,5,6]);
  assert.ok(t.every(x=>x.swapped===true),"rng 0.2 < 0.5 → swapped");
  const plain=buildTrials(EXP,questions,find,{shuffle:false,swapSides:true,rng:()=>0.9})[0];
  assert.equal(plain.swapped,false);
  // swapped: B is drawn at C's slot (right), label follows the object
  const m=stimulusMarkup({...t[0],swapped:true});
  const g=trialGeometry(t[0]);
  assert.ok(m.includes(`<g data-m="B" transform="translate(${g.positions.C[0]},${g.positions.C[1]})`));
  assert.ok(m.includes(`<text x="${g.positions.C[0]}" y="${g.positions.C[1]+g.labelY}" text-anchor="middle" font-family="monospace" font-size="17" font-weight="700" fill="#111">B</text>`));
  assert.equal(resultRow({...t[0]},{participant:"p",response:"C",rt:1,pxPerMm:5,calibrated:true,timestamp:""}).B_side,"right");
  // settings on the experiment drive the defaults
  const e2={...newExperiment(21,2,"main",[10,12]),settings:{repeats:2,shuffle:false,swapSides:false,fixation:false,fullscreen:false}};
  assert.equal(buildTrials(e2,questions,find).length,4);
});

test("summarize: proportion B and median RT per question", ()=>{
  const rows=[{question_id:1,question_title:"Q1",response:"B",rt_ms:500},{question_id:1,question_title:"Q1",response:"C",rt_ms:700},
              {question_id:1,question_title:"Q1",response:"B",rt_ms:900},{question_id:2,question_title:"Q2",response:"C",rt_ms:400}];
  const s=summarize(rows);
  assert.deepEqual(s.map(x=>[x.question_id,x.n,+x.pB.toFixed(3),x.medianRt]),[[1,3,0.667,700],[2,1,0,400]]);
});

test("standalone SVG document and deterministic file stems", ()=>{
  const t=buildTrials(EXP,questions,find,{shuffle:false})[0];
  const svg=stimulusSVG(t);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="'));
  assert.ok(svg.includes('fill="#fff"'),"white background");
  assert.equal((svg.match(/data-m="/g)||[]).length,3);
  assert.equal(fileStem("Q1 · square/diamond · A(0,0) B(45,0) C(0,45)",1),"Q1_square_diamond_A(0,0)_B(45,0)_C(0,45)");
  assert.equal(fileStem("★ Q2 · a  b",2),"Q2_a_b");
  assert.equal(fileStem("   ",7),"Q7");
  assert.ok(Object.keys(paramColumns(t)).includes("C_height_deg"));
});

test("experiments: codes, membership in canvas order, cascade on question deletion", ()=>{
  const exps=[newExperiment(30,1,"pilot"),newExperiment(31,2,"main",[12])];
  assert.equal(experimentCode(exps[1]),"E2");assert.equal(nextOrdinal(exps),3);assert.equal(nextOrdinal([]),1);
  assert.equal(exps[0].name,"pilot");assert.equal(newExperiment(1,4).name,"experiment 4");
  setMembership(exps[0],12,true,questions);setMembership(exps[0],10,true,questions);
  assert.deepEqual(exps[0].questions,[10,12],"kept in canvas order");
  assert.ok(isMember(exps[0],10));
  setMembership(exps[0],10,false,questions);assert.deepEqual(exps[0].questions,[12]);
  assert.deepEqual(experimentsOf(12,exps).map(e=>e.n),[1,2]);assert.deepEqual(experimentsOf(11,exps),[]);
  removeQuestionEverywhere(12,exps);assert.deepEqual(exps.map(e=>e.questions),[[],[]]);
  assert.deepEqual(normalizeSettings({repeats:"7",shuffle:false}),{repeats:7,shuffle:false,swapSides:true,fixation:true,fullscreen:true});
  assert.deepEqual(normalizeSettings(),DEFAULT_SETTINGS);
});

test("loadExperiments: v4 block validated, v3 stars become experiment 1, nothing otherwise", ()=>{
  const qs=()=>questions.map(q=>({...q}));
  const v4=loadExperiments({experiments:[{id:40,n:3,name:"x",questions:[10,999],settings:{repeats:2}},null]},qs());
  assert.deepEqual(v4,[{id:40,n:3,name:"x",questions:[10],settings:{repeats:2,shuffle:true,swapSides:true,fixation:true,fullscreen:true}}]);
  const starred=qs();starred[0].inExp=true;starred[2].inExp=true;
  const v3=loadExperiments({},starred);
  assert.deepEqual(v3.map(e=>[e.id,e.n,e.name,e.questions]),[[null,1,"experiment 1",[10,12]]]);
  assert.ok(starred.every(q=>!("inExp" in q)),"stars are stripped");
  assert.deepEqual(loadExperiments({},qs()),[]);
  // a published experiment keeps its online record; junk in that slot is dropped
  const pub=loadExperiments({experiments:[{id:1,n:1,questions:[10],online:{id:"abc123",when:"t",active:true}},{id:2,n:2,questions:[],online:"x"}]},qs());
  assert.deepEqual(pub[0].online,{id:"abc123",when:"t",active:true});
  assert.ok(!("online" in pub[1]));
});

import { promptFor, sideOf, MEMBER_COLS } from "../src/experiment.js";

test("three comparisons: a random left-to-right order, prompt, geometry and records", ()=>{
  const its=[mk(31,0,0),mk(32,45,0),mk(33,0,45),mk(34,45,45)];
  const f=id=>its.find(i=>i.id===id)||find(id);
  const qs=[{id:40,title:"Q4 · four",a:31,b:32,c:33,d:34,s:1},{id:41,title:"Q1",a:1,b:2,c:3,s:1}];
  const exp=newExperiment(50,1,"x",[40,41]);
  const seq=[0.9,0.1,0.5,0.3];let i=0;
  const t=buildTrials(exp,qs,f,{shuffle:false,rng:()=>seq[i++%seq.length]});
  const four=t.find(x=>x.qId===40), two=t.find(x=>x.qId===41);
  assert.equal(four.D.baseRot,45);assert.ok(!("D" in two));
  assert.deepEqual([...four.order].sort(),["B","C","D"],"a permutation of the comparisons");
  assert.equal(two.order.length,2);
  assert.equal(promptFor(four),"Is A more similar to B, C or D?");assert.equal(promptFor(two),PROMPT);
  // geometry: the three comparisons sit left / centre / right under A, in `order`
  const g=trialGeometry(four);
  assert.deepEqual(g.positions.C,[0,g.dy]);
  const m=stimulusMarkup({...four,order:["D","B","C"]});
  const x=k=>+m.match(new RegExp(`data-m="${k}" transform="translate\\(([-\\d.]+)`))[1];
  assert.ok(x("D")<x("B")&&x("B")<x("C"),"drawn in the given order");
  assert.equal(sideOf({...four,order:["D","B","C"]},"B"),"middle");
  assert.equal(sideOf({B:1,C:1,swapped:true},"B"),"right","two comparisons unchanged");
  // records: D columns filled for four-object questions, empty otherwise
  const row4=resultRow({...four,order:["D","B","C"]},{participant:"p",exp,response:"D",rt:500,pxPerMm:4,calibrated:true,timestamp:"t"});
  assert.equal(row4.n_comparisons,3);assert.equal(row4.order,"DBC");assert.equal(row4.B_side,"middle");assert.equal(row4.D_baseRot,45);
  const row2=resultRow(two,{participant:"p",exp,response:"B",rt:500,pxPerMm:4,calibrated:true,timestamp:"t"});
  assert.equal(row2.n_comparisons,2);assert.equal(row2.D_shape,"");assert.ok(MEMBER_COLS.every(c=>`D_${c}` in row2));
  assert.ok(CSV_COLUMNS.includes("D_baseRot")&&CSV_COLUMNS.includes("order"));
  const s=summarize([row4,{...row4,response:"B"},{...row4,response:"C"},{...row4,response:"D"}]);
  assert.deepEqual([s[0].pB,s[0].pC,s[0].pD],[0.25,0.25,0.5]);
});

test("a four-object stimulus outside a run (export) draws B, C, D left to right", ()=>{
  const t={qId:1,title:"x",s:1,A:paramRecord(mk(61,0,0)),B:paramRecord(mk(62,45,0)),C:paramRecord(mk(63,0,45)),D:paramRecord(mk(64,45,45))};
  const m=stimulusSVG(t);
  const x=k=>+m.match(new RegExp(`data-m="${k}" transform="translate\\(([-\\d.]+)`))[1];
  assert.ok(x("B")<x("C")&&x("C")<x("D"));
});
