import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rotateParams, parseValues, parseVary, relationOf, describeRel,
  applyRelation, turnWhole, questionTitle, assignABC
} from "../src/variants.js";

const P=(baseRot,anchorRot,frame)=>({baseRot,anchorRot,frame});

test("rotational variant, whole: screen frame turns sub-shapes explicitly, vertex frame does not", ()=>{
  assert.deepEqual(rotateParams(P(10,20,"screen"),"whole",45),P(55,65,"screen"));
  assert.deepEqual(rotateParams(P(10,20,"vertex"),"whole",45),P(55,20,"vertex"));
});

test("rotational variant, shape only: vertex frame counter-rotates sub-shapes", ()=>{
  assert.deepEqual(rotateParams(P(10,20,"screen"),"shape",45),P(55,20,"screen"));
  assert.deepEqual(rotateParams(P(10,20,"vertex"),"shape",45),P(55,335,"vertex"));
});

test("rotational variant, sub-shapes only: same in both frames", ()=>{
  assert.deepEqual(rotateParams(P(10,20,"screen"),"anchors",45),P(10,65,"screen"));
  assert.deepEqual(rotateParams(P(10,20,"vertex"),"anchors",45),P(10,65,"vertex"));
});

test("rotational variant normalises and keeps other fields", ()=>{
  const v=rotateParams({...P(350,0,"screen"),x:5,scale:2},"whole",-30);
  assert.equal(v.baseRot,320);assert.equal(v.anchorRot,330);
  assert.equal(v.x,5);assert.equal(v.scale,2);
});

test("parseValues: lists and start:step:end ranges", ()=>{
  assert.deepEqual(parseValues("0,45,90"),[0,45,90]);
  assert.deepEqual(parseValues("0:30:90"),[0,30,60,90]);
  assert.deepEqual(parseValues("-45, 405"),[315,45]);
  assert.equal(parseValues("0:0:90"),null,"zero step");
  assert.equal(parseValues("a,b"),null);
  assert.equal(parseValues("0:30"),null);
});

test("parseVary: shape and/or sub|anchor clauses", ()=>{
  assert.deepEqual(parseVary("shape 0,45,90"),{shape:[0,45,90]});
  assert.deepEqual(parseVary("sub 0:30:60"),{anchor:[0,30,60]});
  assert.deepEqual(parseVary("shape 0,45 anchor 10"),{shape:[0,45],anchor:[10]});
  assert.equal(parseVary(""),null);
  assert.equal(parseVary("shape x"),null);
  assert.equal(parseVary("rotate 45"),null);
});

test("relationOf / describeRel", ()=>{
  const A=P(0,0,"screen");
  assert.deepEqual(relationOf(A,P(45,0)),{dBase:45,dAnchor:0});
  assert.deepEqual(relationOf(A,P(315,30)),{dBase:-45,dAnchor:30});
  assert.equal(describeRel("B",{dBase:45,dAnchor:0}),"B = A with shape +45°");
  assert.equal(describeRel("C",{dBase:-20,dAnchor:40}),"C = A with shape −20°, sub-shapes +40°");
  assert.equal(describeRel("C",{dBase:0,dAnchor:0}),"C = A (identical)");
});

test("same relation, different rotation: keeps which components differ and their direction, not the ratio", ()=>{
  const A=P(0,0,"screen");
  // B = A + (shape 20, subs 40) → at 45 becomes (45,45): 20:40 ratio discarded
  assert.deepEqual(applyRelation(A,relationOf(A,P(20,40)),45),P(45,45,"screen"));
  // negative direction preserved
  assert.deepEqual(applyRelation(A,relationOf(A,P(340,0)),45),P(315,0,"screen"));
  // component that did not differ stays untouched
  assert.deepEqual(applyRelation(A,relationOf(A,P(0,30)),90),P(0,90,"screen"));
  // identical comparison stays identical
  assert.deepEqual(applyRelation(A,relationOf(A,A),90),A);
  // relative to a non-zero reference
  assert.deepEqual(applyRelation(P(30,10,"vertex"),{dBase:10,dAnchor:-10},60),P(90,310,"vertex"));
});

test("different reference, same relation: whole turn preserves A→B and A→C offsets in both frames", ()=>{
  for(const frame of ["screen","vertex"]){
    const A=P(10,20,frame), B=P(55,20,frame), C=P(10,65,frame);
    const [nA,nB,nC]=[A,B,C].map(p=>turnWhole(p,33));
    assert.deepEqual(relationOf(nA,nB),relationOf(A,B));
    assert.deepEqual(relationOf(nA,nC),relationOf(A,C));
    assert.equal(nA.baseRot,43);
  }
  assert.equal(turnWhole(P(0,0,"screen"),90).anchorRot,90);
  assert.equal(turnWhole(P(0,0,"vertex"),90).anchorRot,0);
});

const item=(id,def,anchor,baseRot,anchorRot,x=0,y=0,label=null)=>
  ({id,trayRef:{def,anchor},baseRot,anchorRot,x,y,label});
const SQ={n:4,offset:45,name:"square"}, DI={n:4,name:"diamond"}, HX={n:6,name:"hexagon"};

test("questionTitle: systematic condition codes", ()=>{
  const A=item(1,SQ,DI,0,0), B=item(2,SQ,DI,45,0), C=item(3,SQ,DI,0,45);
  assert.equal(questionTitle(1,A,B,C),"Q1 · square/diamond · A(0,0) B(45,0) C(0,45)");
  const D=item(4,HX,{none:true},30,0);
  assert.equal(questionTitle(7,A,B,D),"Q7 · A square/diamond(0,0) B square/diamond(45,0) C hexagon(30,0)");
  assert.equal(questionTitle(2,item(1,HX,null,0,0),item(2,HX,null,0,0),item(3,HX,null,0,0)),
               "Q2 · hexagon · A(0,0) B(0,0) C(0,0)");
});

test("assignABC: unique labels win, otherwise topmost = A, then left = B, right = C", ()=>{
  const a=item(1,SQ,DI,0,0,100,0), b=item(2,SQ,DI,0,0,0,100), c=item(3,SQ,DI,0,0,200,100);
  assert.deepEqual(assignABC([c,b,a]).map(i=>i.id),[1,2,3]);
  const la={...a,label:"C"}, lb={...b,label:"A"}, lc={...c,label:"B"};
  assert.deepEqual(assignABC([la,lb,lc]).map(i=>i.id),[2,3,1]);
  // duplicate labels → fall back to geometry
  assert.deepEqual(assignABC([{...a,label:"A"},{...b,label:"A"},{...c,label:"B"}]).map(i=>i.id),[1,2,3]);
});
