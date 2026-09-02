import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeCanvas, deserializeCanvas, canvasFileName, SAVE_VERSION } from "../src/io.js";
import { layoutQuestion } from "../src/questions.js";
import { BASE_R, Q_DX, Q_DY } from "../src/geometry.js";

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
  assert.deepEqual(serializeCanvas({...back,name:"demo"}),data,"second save is byte-identical");
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
  const dx=BASE_R*Q_DX*0.5, dy=BASE_R*Q_DY*0.5;
  assert.deepEqual([list[0].x,list[0].y],[100,50-dy]);
  assert.deepEqual([list[1].x,list[1].y],[100-dx,50+dy]);
  assert.deepEqual([list[2].x,list[2].y],[100+dx,50+dy]);
  assert.deepEqual(list.map(i=>i.scale),[0.5,0.5,0.5]);
  assert.deepEqual(list.map(i=>i.anchorRatio),[0.2,0.2,0.2]);
  assert.deepEqual(list.map(i=>i.label),["A","B","C"]);
  // a missing member leaves everything untouched
  const lone=[mk(1)];
  layoutQuestion(q,lone);
  assert.equal(lone[0].x,999);
});

test("canvasFileName", ()=>{
  assert.equal(canvasFileName("  "),"untitled-canvas");
  assert.equal(canvasFileName("pilot  study 2"),"pilot-study-2");
});
