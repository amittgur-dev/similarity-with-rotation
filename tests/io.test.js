import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeCanvas, deserializeCanvas, canvasFileName, SAVE_VERSION } from "../src/io.js";
import { layoutQuestion, questionFrame, separateQuestions } from "../src/questions.js";
import { BASE_R, questionLayout } from "../src/geometry.js";

const SQ={n:4,offset:45,name:"square"}, DI={n:4,name:"diamond"};

function sampleCanvas(){
  const t1={id:1,def:SQ,anchor:DI,baseRot:0,anchorRot:0,frame:"screen",anchorRatio:0.18};
  const t2={id:2,def:{n:6,name:"hexagon"},anchor:{none:true},baseRot:30,anchorRot:0,frame:"vertex",anchorRatio:0.25};
  const mk=(id,ref,x,y,extra={})=>({id,trayRef:ref,x,y,scale:1,baseRot:ref.baseRot,anchorRot:ref.anchorRot,
                                  frame:ref.frame,anchorRatio:ref.anchorRatio,label:null,qId:null,...extra});
  const items=[mk(3,t1,100,100,{qId:6,label:"A"}),mk(4,t1,0,200,{qId:6,label:"B",baseRot:45}),
               mk(5,t1,200,200,{qId:6,label:"C",anchorRot:45}),mk(7,t2,400,100,{scale:1.5})];
  const questions=[{id:6,title:"Q1 · square/diamond · A(0,0) B(45,0) C(0,45)",a:3,b:4,c:5,cx:100,cy:166,s:1,anchorRatio:0.18}];
  return {name:"demo",view:{tx:10,ty:-5,z:1.2},tray:[t1,t2],items,questions};
}

test("serialize → deserialize round-trips, resolving live references", ()=>{
  const src=sampleCanvas();
  const data=serializeCanvas(src);
  assert.equal(data.version,SAVE_VERSION);
  assert.equal(data.items[0].trayId,1);
  assert.ok(!("trayRef" in data.items[0]),"no object graph in the file");
  const json=JSON.parse(JSON.stringify(data));
  const back=deserializeCanvas(json);
  assert.equal(back.name,"demo");
  assert.deepEqual(back.view,{tx:10,ty:-5,z:1.2});
  assert.equal(back.tray.length,2);
  assert.equal(back.items.length,4);
  assert.equal(back.items[0].trayRef,back.tray[0],"trayRef is a live reference into the loaded tray");
  assert.equal(back.items[3].trayRef.frame,"vertex");
  assert.equal(back.items[3].scale,1.5);
  assert.deepEqual(back.questions,src.questions);
  assert.equal(back.items[1].qId,6);
  assert.equal(back.maxId,7);
  assert.deepEqual(back.experiments,[]);
  assert.deepEqual(serializeCanvas({...back,name:"demo"}),data,"second save is byte-identical");
});

test("v4 experiments round-trip; v3 stars migrate into experiment 1 with a fresh id", ()=>{
  const src=sampleCanvas();
  src.experiments=[{id:8,n:1,name:"pilot",questions:[6],settings:{repeats:2,shuffle:false,swapSides:true,fixation:true,fullscreen:false}}];
  const data=serializeCanvas(src);
  assert.equal(data.version,4);
  const back=deserializeCanvas(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(back.experiments,src.experiments);
  assert.equal(back.maxId,8);
  const v3=JSON.parse(JSON.stringify(data));delete v3.experiments;v3.version=3;v3.questions[0].inExp=true;
  const m=deserializeCanvas(v3);
  assert.equal(m.experiments.length,1);
  assert.equal(m.experiments[0].name,"experiment 1");assert.deepEqual(m.experiments[0].questions,[6]);
  assert.equal(m.experiments[0].id,8,"id after the highest existing id");assert.equal(m.maxId,8);
  assert.ok(!("inExp" in m.questions[0]));
});

test("deserialize rejects non-canvas files", ()=>{
  assert.throws(()=>deserializeCanvas({}),/not a canvas file/);
  assert.throws(()=>deserializeCanvas(null),/not a canvas file/);
});

test("migration: sub* keys → anchor*", ()=>{
  const old={version:1,tray:[{id:1,def:SQ,sub:DI,subRot:15,subRatio:0.3}],
             items:[{id:2,trayId:1,x:0,y:0,scale:1,baseRot:0,subRot:20,subRatio:0.3}],questions:[]};
  const back=deserializeCanvas(old);
  assert.deepEqual(back.tray[0].anchor,DI);
  assert.equal(back.tray[0].anchorRot,15);
  assert.equal(back.tray[0].anchorRatio,0.3);
  assert.equal(back.tray[0].frame,"screen","frame defaults to screen");
  assert.equal(back.items[0].anchorRot,20);
  assert.equal(back.items[0].anchorRatio,0.3);
});

test("migration: v2 trials → questions with derived center and scale", ()=>{
  const v2={version:2,tray:[{id:1,def:SQ,anchor:DI}],
            items:[{id:2,trayId:1,x:0,y:0,scale:2,baseRot:0,anchorRot:0},
                   {id:3,trayId:1,x:-60,y:90,scale:2,baseRot:0,anchorRot:0},
                   {id:4,trayId:1,x:60,y:90,scale:2,baseRot:0,anchorRot:0},
                   {id:9,trayId:99,x:0,y:0,scale:1,baseRot:0,anchorRot:0}],
            trials:[{id:5,title:"T",a:2,b:3,c:4},{id:6,title:"broken",a:2,b:3,c:42}]};
  const back=deserializeCanvas(v2);
  assert.equal(back.items.length,3,"item with unknown tray entry is dropped");
  assert.equal(back.questions.length,1,"trial with a missing member is dropped");
  const q=back.questions[0];
  assert.equal(q.cx,0);assert.equal(q.cy,60);assert.equal(q.s,2);
  assert.equal(q.anchorRatio,0.18);
  assert.ok(back.items.every(i=>i.qId===5));
  assert.equal(back.maxId,5);
});

test("layoutQuestion enforces the rigid triangle, shared size and ratio, and labels", ()=>{
  const ref={id:1,def:SQ,anchor:DI};
  const mk=id=>({id,trayRef:ref,x:999,y:999,scale:3,anchorRatio:0.5,label:null});
  const list=[mk(1),mk(2),mk(3)];
  const q={a:1,b:2,c:3,cx:100,cy:50,s:0.5,anchorRatio:0.2};
  layoutQuestion(q,list);
  const L=questionLayout(list.map(()=>({def:SQ,anchor:DI,ratio:0.2,texture:0})),0.5);
  list.forEach((m,i)=>assert.deepEqual([m.x,m.y],[100+L.positions[i][0],50+L.positions[i][1]]));
  const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  assert.ok(Math.abs(d(list[0],list[1])-d(list[0],list[2]))<1e-9&&Math.abs(d(list[1],list[2])-L.D)<1e-9,"equilateral: every pair the same distance");
  assert.ok(list[0].y<list[1].y&&list[1].x<list[0].x&&list[2].x>list[0].x,"A on top, B left, C right");
  assert.deepEqual(list.map(i=>i.scale),[0.5,0.5,0.5]);
  assert.deepEqual(list.map(i=>i.anchorRatio),[0.2,0.2,0.2]);
  assert.deepEqual(list.map(i=>i.label),["A","B","C"]);
  // a missing member leaves everything untouched
  const lone=[mk(1)];
  layoutQuestion(q,lone);
  assert.equal(lone[0].x,999);
});

test("opening a canvas moves overlapping questions apart, left to right; the rest stay put", ()=>{
  const ref={id:1,def:SQ,anchor:DI};
  const list=[1,2,3,4,5,6,7,8,9,10,11].map(id=>({id,trayRef:ref,x:0,y:0,scale:1,anchorRatio:0.18,label:null}));
  // two three-comparison questions 500 px apart overlap at the current spacing; a third sits well below
  const qs=[{id:21,a:1,b:2,c:3,d:4,cx:900,cy:300,s:1},{id:20,a:5,b:6,c:7,d:8,cx:400,cy:300,s:1},{id:22,a:9,b:10,c:11,cx:400,cy:1400,s:1}];
  qs.forEach(q=>layoutQuestion(q,list));
  const ov=(f,g)=>f.x0<g.x1&&f.x1>g.x0&&f.y0<g.y1&&f.y1>g.y0;
  assert.ok(ov(questionFrame(qs[0],list),questionFrame(qs[1],list)),"they start out overlapping");
  assert.equal(separateQuestions(qs,list),1);
  assert.equal(qs[1].cx,400,"the leftmost stays");assert.equal(qs[2].cx,400,"no overlap, no move");
  const [f0,f1]=[questionFrame(qs[0],list),questionFrame(qs[1],list)];
  assert.ok(Math.abs(f0.x0-(f1.x1+BASE_R))<1e-9,"cleared by a figure radius of space, no further");
  assert.equal(list[0].x,qs[0].cx,"members follow their question");
  assert.equal(separateQuestions(qs,list),0,"nothing left to move");
});

test("canvasFileName", ()=>{
  assert.equal(canvasFileName("  "),"untitled-canvas");
  assert.equal(canvasFileName("pilot  study 2"),"pilot-study-2");
});

test("textures round-trip; plain canvases carry no texture field", ()=>{
  const src=sampleCanvas();
  const plain=serializeCanvas(src);
  assert.ok(plain.tray.every(t=>!("texture" in t))&&plain.items.every(i=>!("texture" in i)));
  src.tray[0].texture=4;src.items[1].texture=7;
  const data=serializeCanvas(src);
  assert.equal(data.tray[0].texture,4);assert.equal(data.items[1].texture,7);assert.ok(!("texture" in data.items[0]));
  const back=deserializeCanvas(JSON.parse(JSON.stringify({...data,items:data.items.map((i,k)=>k===2?{...i,texture:99}:i)})));
  assert.equal(back.tray[0].texture,4);assert.equal(back.items[1].texture,7);
  assert.equal(back.items[2].texture,16,"out-of-range densities are clamped on load");
});

test("a question with three comparisons round-trips; plain questions carry no d", ()=>{
  const src=sampleCanvas();
  const plain=serializeCanvas(src);
  assert.ok(plain.questions.every(q=>!("d" in q)));
  src.items[3].qId=6;src.questions[0].d=7;
  const data=serializeCanvas(src);
  assert.equal(data.questions[0].d,7);
  const back=deserializeCanvas(JSON.parse(JSON.stringify(data)));
  assert.equal(back.questions[0].d,7);assert.equal(back.items.find(i=>i.id===7).qId,6);
  layoutQuestion(back.questions[0],back.items);
  const byId=id=>back.items.find(i=>i.id===id);
  assert.deepEqual([3,4,5,7].map(id=>byId(id).label),["A","B","C","D"]);
  const q=back.questions[0], A=byId(3), cmp=[4,5,7].map(byId);
  const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const D=d(A,cmp[0]);
  assert.ok(cmp.every(m=>Math.abs(d(A,m)-D)<1e-9),"every comparison the same distance from A");
  assert.ok(Math.abs(d(cmp[0],cmp[1])-D)<1e-9&&Math.abs(d(cmp[1],cmp[2])-D)<1e-9,"neighbouring comparisons that distance apart");
  assert.ok(cmp[0].x<cmp[1].x&&cmp[1].x<cmp[2].x&&cmp[1].x===q.cx&&cmp.every(m=>m.y>A.y),"B left, C centre, D right, all below A");
  assert.equal(byId(3).x,q.cx);
  // a missing D drops the question like any other missing member
  const broken=deserializeCanvas({...JSON.parse(JSON.stringify(data)),items:data.items.filter(i=>i.id!==7)});
  assert.equal(broken.questions.length,0);
});
